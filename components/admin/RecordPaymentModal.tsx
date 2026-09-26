"use client";

// Record money received for a booking: a stay payment (downpayment,
// balance or full), a damage penalty, or a refund. The server checks the
// amount against the real balance again; the limits here are for the
// admin's convenience, not for safety.

import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { bookingMoney } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import { MANUAL_METHODS, type PaymentType } from "@/types/finance";
import type { Booking } from "@/types/booking";
import { Modal, Label, Segmented, Btn, Line, ErrorNote, useAdminStyle } from "@/components/admin/ui";

type Kind = "Stay" | "Penalty" | "Refund";

export function RecordPaymentModal({
  bookings, bookingId, onClose, defaultKind = "Stay",
}: {
  bookings: Booking[];
  bookingId?: string;
  onClose: () => void;
  defaultKind?: Kind;
}) {
  const { C, soft, cBr, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();

  const [pickedId, setPickedId] = useState(bookingId ?? "");
  const [search, setSearch] = useState("");
  const booking = bookings.find((b) => b.id === pickedId) ?? null;
  const money = booking ? bookingMoney(booking, ops.payments, ops.damages) : null;

  const [kind, setKind] = useState<Kind>(defaultKind);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const max = !money ? 0 : kind === "Stay" ? money.balance : kind === "Penalty" ? money.penaltyDue : money.paid;
  const shownAmount = amount === "" ? (max > 0 ? String(max) : "") : amount;
  const value = Number(shownAmount) || 0;

  const type: PaymentType = kind === "Penalty" ? "Penalty" : kind === "Refund" ? "Refund"
    : money && money.paid <= 0 ? (value >= (booking?.total ?? 0) ? "Full" : "Downpayment") : "Balance";

  // Bookings worth picking: something still owed, or (for a refund) paid.
  const candidates = useMemo(() => {
    const q = search.toLowerCase().trim();
    return bookings
      .filter((b) => !b.id.startsWith("TMP-"))
      .map((b) => ({ b, m: bookingMoney(b, ops.payments, ops.damages) }))
      .filter(({ m }) => m.due > 0 || m.paid > 0)
      .filter(({ b }) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.contact.includes(q))
      .sort((a, b) => b.m.due - a.m.due)
      .slice(0, 8);
  }, [bookings, ops.payments, ops.damages, search]);

  const save = async () => {
    setError("");
    if (!booking) return setError("Choose the booking this payment is for.");
    if (value <= 0) return setError("Enter an amount greater than zero.");
    if (value > max) return setError(`The most you can record here is ${fmt(max)}.`);
    if (method !== "Cash" && !reference.trim()) return setError(`Enter the ${method} reference number.`);
    setBusy(true);
    const r = await ops.recordPayment({ bookingId: booking.id, type, amount: value, method, reference, notes });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`${type === "Refund" ? "Refund" : "Payment"} of ${fmt(value)} recorded for ${booking.name}.`, "success");
    onClose();
  };

  return (
    <Modal
      title="Record payment"
      subtitle={booking ? `${booking.name} · ${booking.id}` : "Money received for a booking"}
      onClose={onClose}
      width={620}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={save} disabled={busy || !booking || max <= 0}>
            {busy ? "Saving…" : kind === "Refund" ? `Record refund of ${fmt(value)}` : `Record ${fmt(value)}`}
          </Btn>
        </div>
      }
    >
      {!bookingId && (
        <div style={{ marginBottom: 16 }}>
          <Label htmlFor="pay-search">Booking</Label>
          <Input id="pay-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest name, booking ID or phone" style={inp} />
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {candidates.map(({ b, m }) => (
              <button key={b.id} type="button" onClick={() => { setPickedId(b.id); setAmount(""); }}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left", padding: "9px 12px", borderRadius: 8, cursor: "pointer", background: pickedId === b.id ? "rgba(201,168,76,0.12)" : "transparent", border: `1px solid ${pickedId === b.id ? "rgba(201,168,76,0.5)" : cBr}`, color: C.textH }}>
                <span><strong style={{ fontWeight: 600 }}>{b.name}</strong> <span style={{ color: C.textS, fontSize: 12.5 }}>{b.id} · {b.date}</span></span>
                <span style={{ color: m.due > 0 ? "#d4a800" : C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{m.due > 0 ? `${fmt(m.due)} owed` : "Paid in full"}</span>
              </button>
            ))}
            {candidates.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>No bookings match.</p>}
          </div>
        </div>
      )}

      {booking && money && (
        <>
          <div style={{ background: soft, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            <Line label="Booking total" value={fmt(booking.total)} />
            <Line label="Paid so far" value={fmt(money.paid)} />
            <Line label="Balance" value={fmt(money.balance)} color={money.balance > 0 ? "#d4a800" : undefined} />
            {(money.penaltyTotal > 0) && <Line label="Unpaid penalties" value={fmt(money.penaltyDue)} color={money.penaltyDue > 0 ? "#d44" : undefined} />}
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>What is this for?</Label>
            <Segmented<Kind>
              value={kind}
              onChange={(k) => { setKind(k); setAmount(""); }}
              options={[
                { value: "Stay", label: "Stay payment", disabled: money.balance <= 0 },
                { value: "Penalty", label: "Damage penalty", disabled: money.penaltyDue <= 0 },
                { value: "Refund", label: "Refund", disabled: money.paid <= 0 },
              ]}
            />
            <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>
              Saved as <strong style={{ color: C.textB }}>{type}</strong>.{kind === "Refund" ? " Refunds are subtracted from money collected." : ""}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <Label htmlFor="pay-amount">Amount (₱)</Label>
              <Input id="pay-amount" type="number" min={0} step="0.01" max={max} value={shownAmount}
                onChange={(e) => setAmount(e.target.value)} style={inp} />
              <p style={{ color: C.textS, fontSize: 12, margin: "5px 0 0" }}>Up to {fmt(max)}</p>
            </div>
            <div>
              <Label>Method</Label>
              <Segmented value={method} onChange={setMethod} size="sm"
                options={MANUAL_METHODS.map((m) => ({ value: m, label: m }))} />
            </div>
          </div>

          {method !== "Cash" && (
            <div style={{ marginBottom: 14 }}>
              <Label htmlFor="pay-ref">{method} reference number</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={inp} />
            </div>
          )}
          <div>
            <Label htmlFor="pay-notes">Notes (optional)</Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} />
          </div>
        </>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
