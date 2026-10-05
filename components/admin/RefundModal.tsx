"use client";

// ── Send a refund the resort owes
//
// Owed when the resort cancelled and the guest chose a refund (or didn't
// choose in time). The owner sends the money first (by GCash to the guest's
// number, usually), then records it here with the reference and, ideally, a
// photo of the transfer receipt. The guest then sees "Refund sent" with the
// reference and the receipt on their own booking page, and gets an email;
// the next screen texts them.

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { livePayments, round2 } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import { MANUAL_METHODS } from "@/types/finance";
import type { Booking } from "@/types/booking";
import { TextGuest } from "@/components/admin/TextGuest";
import { Btn, ErrorNote, Label, Modal, Segmented, useAdminStyle } from "@/components/admin/ui";

/** Shrink a photo to a size that fits comfortably in the database. */
async function compress(file: File): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result));
    rd.onerror = () => reject(new Error("Couldn't read that file."));
    rd.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file isn't a picture."));
    i.src = url;
  });
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.8;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > 1_800_000 && quality > 0.3) {
    quality -= 0.15;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

export function RefundModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, inp, soft } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const refunded = round2(livePayments(ops.payments).filter((p) => p.bookingId === booking.id && p.type === "Refund").reduce((s, p) => s + p.amount, 0));
  const owed = round2(Math.max(0, (booking.refundAmount ?? 0) - refunded));

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>("GCash");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sms, setSms] = useState<string | null>(null);

  const value = amount === "" ? owed : Math.max(0, round2(Number(amount) || 0));

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try { setReceipt(await compress(file)); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't use that photo."); }
  };

  const save = async () => {
    setError("");
    if (value <= 0) return setError("Enter the amount you sent.");
    if (method !== "Cash" && !reference.trim()) return setError(`Enter the ${method} reference number.`);
    setBusy(true);
    const r = await ops.recordPayment({
      bookingId: booking.id, type: "Refund", amount: value, method, reference: reference.trim(),
      notes: "Refund to the guest (resort cancellation).", receipt: receipt ?? undefined,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`${fmt(value)} refund to ${booking.name} recorded.`, "success");
    if (typeof r.data?.sms === "string") setSms(r.data.sms);
    else onClose();
  };

  if (sms) {
    return (
      <Modal title="Refund recorded" subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={560}
        footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><Btn kind="primary" onClick={onClose}>Done</Btn></div>}>
        <p style={{ color: C.textB, fontSize: 13.5, marginTop: 0 }}>Their booking page now shows the refund as sent{receipt ? ", with the receipt" : ""}. Let them know:</p>
        <TextGuest booking={booking} message={sms} about="the refund" />
      </Modal>
    );
  }

  return (
    <Modal title="Send the refund" subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={600}
      footer={<div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn kind="primary" icon="receipt" disabled={busy} onClick={save}>{busy ? "Saving…" : `Record ${fmt(value)} refund`}</Btn>
      </div>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ background: soft, borderRadius: 10, padding: "12px 16px", margin: 0, color: C.textB, fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: C.textH }}>{fmt(owed)}</strong> is owed to {booking.name}. Send it first (their number, {booking.contact}, is often their GCash), then record it here.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label htmlFor="rf-amount">Amount sent</Label>
            <Input id="rf-amount" type="number" min={0} value={amount === "" ? String(owed) : amount} onChange={(e) => setAmount(e.target.value)} style={inp} />
          </div>
          {method !== "Cash" && (
            <div>
              <Label htmlFor="rf-ref">{method} reference</Label>
              <Input id="rf-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={inp} />
            </div>
          )}
        </div>
        <div>
          <Label>Sent by</Label>
          <Segmented label="Sent by" value={method} onChange={setMethod} size="sm" options={MANUAL_METHODS.map((m) => ({ value: m, label: m }))} />
        </div>
        <div>
          <Label htmlFor="rf-receipt">Receipt photo (recommended)</Label>
          <input id="rf-receipt" type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} style={{ color: C.textB, fontSize: 13 }} />
          {receipt && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={receipt} alt="Refund receipt" style={{ display: "block", marginTop: 8, maxHeight: 180, borderRadius: 8 }} />
          )}
          <p style={{ color: C.textS, fontSize: 12, margin: "8px 0 0" }}>The guest sees this on their booking page, which is the strongest proof the money was sent.</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
