"use client";

/* ── Dashboard → Pending proof of payment
 *
 * Online guests pay by GCash and upload the receipt (/api/payment-proofs).
 * Each one waits here, above Guest bookings today, as a card: who, what
 * they booked, the amount they were asked to send, what the receipt reader
 * found, and the receipt itself. Staff open GCash, check the money arrived,
 * then:
 *
 *   Confirm partial payment   the 50% down payment arrived; the rest is
 *                             collected on arrival
 *   Confirm full payment      the whole total arrived
 *   Reject payment            with a reason the guest reads; they upload a
 *                             new receipt from their booking page
 *
 * Confirming moves the booking to Confirmed (All Bookings), records the
 * money in Payments & Expenses and emails the guest their confirmation.
 */

import { useCallback, useEffect, useState } from "react";
import { useAdminStyle, ActionButton, ErrorNote, Label, Modal, ConfirmDialog } from "@/components/admin/ui";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/common/Icon";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useStaff } from "@/contexts/StaffContext";
import { useToast } from "@/contexts/ToastContext";
import { fmt, fmtDate, bookingSlotInfo } from "@/lib/utils";
import { headcountLabel } from "@/lib/children";
import { reviewReasons } from "@/lib/reviewReasons";
import { sameReference } from "@/lib/receiptOcr";
import { gold } from "@/lib/styles";
import type { Booking } from "@/types/booking";

interface PendingProof {
  id: number;
  bookingId: string;
  booking: Booking;
  payChoice: "Downpayment" | "Full";
  amountDue: number;
  ocr: { reference?: string | null; ocrReference?: string | null; senderName?: string | null; senderAccount?: string | null; date?: string | null; amounts?: number[]; amountMatch?: boolean; nameFound?: boolean; confidence?: number };
  reference: string | null;
  submittedAt: string;
  imageUrl: string | null;
  rejectedBefore: string[];
}

const REJECT_PRESETS = [
  "We can't find this payment in our GCash.",
  "The amount on the receipt doesn't match what you needed to pay.",
  "The receipt isn't clear enough to read the reference number.",
  "This receipt is for a different payment.",
];

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} d ago`;
};

export function ProofQueue({ mob }: { mob: boolean }) {
  const { C, cBg, cBr, soft, inp } = useAdminStyle();
  const { reloadBookings } = useApp();
  const ops = useOps();
  const staff = useStaff();
  const { toast } = useToast();
  const [proofs, setProofs] = useState<PendingProof[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [zoom, setZoom] = useState<PendingProof | null>(null);
  const [confirm, setConfirm] = useState<{ p: PendingProof; as: "Downpayment" | "Full" } | null>(null);
  const [rejecting, setRejecting] = useState<PendingProof | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const canDecide = staff.can("payments.record");

  const load = useCallback(async () => {
    try {
      const j = await fetch("/api/payment-proofs", { cache: "no-store" }).then((r) => r.json());
      if (j?.success) { setProofs(j.proofs ?? []); setEnabled(j.enabled !== false); }
    } catch { /* keep what is showing */ }
  }, []);

  // Now, then every 30 seconds: a guest who just paid shows up on its own.
  useEffect(() => {
    let live = true;
    const tick = () => { if (live && document.visibilityState === "visible") void load(); };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    void load();
    const t = setInterval(tick, 30_000);
    return () => { live = false; clearInterval(t); };
  }, [load]);

  const decide = async (p: PendingProof, action: "Downpayment" | "Full" | "Reject", why = "") => {
    setBusy(p.id); setError("");
    try {
      const res = await fetch(`/api/payment-proofs/${p.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: why }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? "Could not save the decision.");
      setProofs((list) => (list ?? []).filter((x) => x.id !== p.id));
      setConfirm(null); setRejecting(null); setReason("");
      if (j.emailed === false) {
        toast(action === "Reject"
          ? `Payment rejected, but the email to ${p.booking.name} didn't send. Tell them by phone (${p.booking.contact}) or email them from the booking.`
          : `${fmt(j.amount ?? 0)} confirmed and ${p.booking.id} is confirmed, but the confirmation email to ${p.booking.name} didn't send. Use "Email guest" on the booking.`, "warning");
      } else {
        toast(action === "Reject"
          ? `Payment rejected. ${p.booking.name} was emailed to send a new receipt.`
          : `${fmt(j.amount ?? 0)} confirmed. ${p.booking.id} is now confirmed and the confirmation was emailed to ${p.booking.email || p.booking.name}.`, action === "Reject" ? "warning" : "success");
      }
      void reloadBookings(); void ops.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the decision.");
    } finally {
      setBusy(null);
    }
  };

  if (!enabled || proofs === null) return null;
  const n = proofs.length;

  return (
    <section aria-labelledby="dash-proofs" style={{ border: `1px solid ${n ? "rgba(245,165,36,0.5)" : cBr}`, borderRadius: 12, background: cBg, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
        <Icon name="receipt" size={16} style={{ color: n ? "#f5a524" : C.goldInk, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="dash-proofs" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Pending proof of payment</h3>
          <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>Check each receipt against your GCash, then confirm or reject it</div>
        </div>
        {n > 0 && <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "#f5a524", color: "#000" }}>{n}</span>}
      </div>

      {n === 0 ? (
        <p style={{ color: C.textS, fontSize: 13, margin: 0, padding: 16 }}>No receipts waiting. New ones show up here on their own.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, padding: 16 }}>
          {proofs.map((p) => {
            const b = p.booking;
            const slot = bookingSlotInfo(b);
            const flags = reviewReasons(b.notes);
            const read = p.ocr ?? {};
            return (
              <article key={p.id} style={{ border: `1px solid ${cBr}`, borderLeft: "3px solid #f5a524", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.textH, fontSize: 15, fontWeight: 600 }}>{b.name}</div>
                    <div style={{ color: C.goldInk, fontFamily: "monospace", fontSize: 12 }}>{b.id}</div>
                  </div>
                  <span style={{ color: C.textS, fontSize: 11.5, whiteSpace: "nowrap" }}>{ago(p.submittedAt)}</span>
                </div>

                <div style={{ color: C.textB, fontSize: 12.5, lineHeight: 1.6 }}>
                  {fmtDate(b.date)} · {slot.label} ({slot.hours})<br />
                  {headcountLabel(b.guests, b.children ?? 0)} · {b.package || "Booking"}<br />
                  {b.contact}{b.email ? ` · ${b.email}` : ""}
                </div>

                <div style={{ background: soft, borderRadius: 10, padding: "10px 12px", display: "grid", gap: 4, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textS }}>Amount to be paid</span><strong style={{ color: C.textH, fontSize: 16 }}>{fmt(p.amountDue)}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textS }}>Guest chose</span><span style={{ color: C.textB }}>{p.payChoice === "Full" ? "Full payment" : "50% down payment"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textS }}>Booking total</span><span style={{ color: C.textB }}>{fmt(b.total)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: C.textS }}>Sender name</span><span style={{ color: C.textH, textAlign: "right", overflowWrap: "anywhere" }}>{read.senderName ?? "—"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: C.textS }}>Sender account</span><span style={{ color: C.textH, fontFamily: "monospace" }}>{read.senderAccount ?? "—"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: C.textS }}>Reference</span><span style={{ color: C.textH, fontFamily: "monospace", overflowWrap: "anywhere" }}>{p.reference ?? "—"}</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {[
                      ...(read.ocrReference !== undefined && p.reference
                        ? [[sameReference(read.ocrReference, p.reference), sameReference(read.ocrReference, p.reference) ? "Reference matches receipt" : `Receipt shows ${read.ocrReference ?? "no reference"}`] as [boolean, string]]
                        : []),
                      [!!read.date, read.date ? `Dated ${fmtDate(read.date)}` : "No date read"],
                      [!!read.amountMatch, read.amountMatch ? "Amount matches" : `Amount read: ${(read.amounts ?? []).map(fmt).join(" / ") || "none"}`],
                      [!!read.nameFound, read.nameFound ? "Name found" : "Name not read"],
                    ].map(([ok, t]) => (
                      <span key={String(t)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${ok ? "#2e9e4e66" : "#f5a52466"}`, color: ok ? "#2e9e4e" : "#f5a524" }}>{String(t)}</span>
                    ))}
                  </div>
                </div>

                {flags.length > 0 && (
                  <div style={{ color: "#f5a524", fontSize: 12, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                    <Icon name="alert" size={13} /> {flags.map((f) => f.title).join(" · ")}: check before confirming
                  </div>
                )}
                {p.rejectedBefore.length > 0 && (
                  <div style={{ color: C.textS, fontSize: 12 }}>A receipt was rejected before: {p.rejectedBefore.filter(Boolean).join("; ") || "no reason given"}</div>
                )}

                {/* The receipt itself, below the details. Click for full size. */}
                {p.imageUrl ? (
                  <button type="button" onClick={() => setZoom(p)} aria-label={`Open the receipt for ${b.id}`}
                    style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: 0, background: "#fff", cursor: "zoom-in", overflow: "hidden" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed, private link */}
                    <img src={p.imageUrl} alt={`GCash receipt for ${b.id}`} loading="lazy" style={{ display: "block", width: "100%", maxHeight: 280, objectFit: "contain" }} />
                  </button>
                ) : <p style={{ color: C.dangerInk, fontSize: 12.5, margin: 0 }}>The receipt image couldn&apos;t be loaded.</p>}

                {canDecide ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <ActionButton kind="primary" disabled={busy === p.id} onClick={() => setConfirm({ p, as: "Downpayment" })}>Confirm partial</ActionButton>
                      <ActionButton kind="green" icon="check" disabled={busy === p.id} onClick={() => setConfirm({ p, as: "Full" })}>Confirm full</ActionButton>
                    </div>
                    <ActionButton kind="red" disabled={busy === p.id} onClick={() => { setRejecting(p); setReason(""); setError(""); }}>Reject payment</ActionButton>
                  </div>
                ) : <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>A super admin or the front desk confirms payments.</p>}
              </article>
            );
          })}
        </div>
      )}

      {zoom?.imageUrl && (
        <Modal title={`Receipt · ${zoom.booking.id}`} subtitle={`${zoom.booking.name} · ${fmt(zoom.amountDue)} · ref ${zoom.reference ?? "—"}`} onClose={() => setZoom(null)} width={720}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, private link */}
          <img src={zoom.imageUrl} alt="" style={{ display: "block", width: "100%", maxHeight: "75vh", objectFit: "contain", background: "#fff", borderRadius: 8 }} />
        </Modal>
      )}

      {confirm && (() => {
        const { p, as } = confirm;
        const amount = as === "Full" ? p.booking.total : (p.payChoice === "Downpayment" ? p.amountDue : Math.ceil(p.booking.total / 2));
        return (
          <ConfirmDialog
            title={as === "Full" ? "Confirm full payment?" : "Confirm partial payment?"}
            description={`${p.booking.name} · ${p.booking.id} · ${fmtDate(p.booking.date)}`}
            onCancel={() => setConfirm(null)} cancelLabel="Go back" width={500}
            confirm={<ActionButton kind={as === "Full" ? "green" : "primary"} icon="check" disabled={busy === p.id} onClick={() => void decide(p, as)}>{busy === p.id ? "Saving…" : `Yes, ${fmt(amount)} arrived`}</ActionButton>}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ background: soft, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, lineHeight: 1.8, color: C.textB }}>
                <div>Received by GCash: <strong style={{ color: C.textH }}>{fmt(amount)}</strong></div>
                <div>{as === "Full" ? "Paid in full. Nothing to collect on arrival." : <>Balance on arrival: <strong style={{ color: C.textH }}>{fmt(Math.max(0, p.booking.total - amount))}</strong></>}</div>
              </div>
              {as === "Full" && p.payChoice === "Downpayment" && (
                <p style={{ color: "#f5a524", fontSize: 12.5, margin: 0 }}>The guest chose the 50% down payment ({fmt(p.amountDue)}). Only confirm full if the whole {fmt(p.booking.total)} is in your GCash.</p>
              )}
              <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>The booking is confirmed, the payment is recorded in Payments &amp; Expenses, and {p.booking.email ? `a confirmation goes to ${p.booking.email}` : "the guest has no email"}.</p>
              <ErrorNote>{error}</ErrorNote>
            </div>
          </ConfirmDialog>
        );
      })()}

      {rejecting && (
        <ConfirmDialog title="Reject this payment?" description={`${rejecting.booking.name} · ${rejecting.booking.id} · ${fmt(rejecting.amountDue)}`}
          onCancel={() => setRejecting(null)} cancelLabel="Go back" width={520}
          confirm={<ActionButton kind="red" disabled={busy === rejecting.id || reason.trim().length < 3} onClick={() => void decide(rejecting, "Reject", reason.trim())}>{busy === rejecting.id ? "Saving…" : "Reject payment"}</ActionButton>}>
          <div style={{ display: "grid", gap: 10 }}>
            <Label htmlFor="proof-reason">Reason the guest reads</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {REJECT_PRESETS.map((t) => (
                <button key={t} type="button" onClick={() => setReason(t)} aria-pressed={reason === t}
                  style={{ padding: "4px 10px", borderRadius: 14, fontSize: 12, cursor: "pointer", border: `1px solid ${reason === t ? `${gold}88` : cBr}`, background: reason === t ? `${gold}1a` : "transparent", color: C.textB, textAlign: "left" }}>
                  {t}
                </button>
              ))}
            </div>
            <Textarea id="proof-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We can't find this payment in our GCash." style={{ ...inp }} />
            <p style={{ color: C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
              The guest is emailed this reason and a link to upload a new receipt. The booking stays waiting, holding its date. To free the date, cancel the booking from All Bookings.
            </p>
            <ErrorNote>{error}</ErrorNote>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
