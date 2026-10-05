"use client";

// ── A guest asks to move their booking: approve or decline
//
// The new date has been held for the guest since they asked (48 hours).
// Approving checks it once more, moves the booking and resets its
// preparation; declining keeps it where it was, and the note is what the
// guest reads. Either way the next screen texts them.

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { fmtDeadline, holdActive } from "@/lib/rebooking";
import { fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import type { Booking } from "@/types/booking";
import type { DateChange } from "@/types/finance";
import { TextGuest } from "@/components/admin/TextGuest";
import { Btn, ErrorNote, Label, Line, Modal, useAdminStyle } from "@/components/admin/ui";

export function DateChangeReview({ request, booking, onClose }: { request: DateChange; booking: Booking; onClose: () => void }) {
  const { C, soft, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ sms: string; approved: boolean } | null>(null);
  const held = holdActive(request);
  const slot = SLOTS[getBookingSlot(booking)];

  const decide = async (approve: boolean) => {
    setError("");
    setBusy(approve ? "approve" : "decline");
    const r = await ops.decideDateChange(request.id, approve, note.trim());
    setBusy(null);
    if (!r.ok) return setError(r.error);
    toast(approve ? `${booking.id} moved to ${fmtDate(request.toDate)}.` : `Request declined. ${booking.id} stays on ${fmtDate(request.fromDate)}.`, approve ? "success" : "info");
    setDone({ sms: String(r.data?.sms ?? ""), approved: approve });
  };

  if (done) {
    return (
      <Modal title={done.approved ? "Booking moved" : "Request declined"} subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={560}
        footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><Btn kind="primary" onClick={onClose}>Done</Btn></div>}>
        <p style={{ color: C.textB, fontSize: 13.5, marginTop: 0 }}>
          {done.approved ? "The preparation checklist was reset for the new date. " : ""}They were emailed{booking.email ? "" : " (no email on file)"}. Text them too:
        </p>
        {done.sms && <TextGuest booking={booking} message={done.sms} about={done.approved ? "the new date" : "the declined date change"} />}
      </Modal>
    );
  }

  return (
    <Modal title="Date change request" subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={560}
      footer={<div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Btn kind="red" disabled={!!busy} onClick={() => decide(false)}>{busy === "decline" ? "Saving…" : "Decline"}</Btn>
        <Btn kind="primary" icon="check" disabled={!!busy || !held} onClick={() => decide(true)}>{busy === "approve" ? "Saving…" : `Move to ${fmtDate(request.toDate)}`}</Btn>
      </div>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: soft, borderRadius: 10, padding: "8px 16px" }}>
          <Line label="Current date" value={`${fmtDate(request.fromDate)} · ${slot.label}`} />
          <Line label="Asks to move to" value={`${fmtDate(request.toDate)} · ${slot.label}`} strong />
          <Line label="Guests" value={String(booking.guests)} />
        </div>
        <p style={{ color: held ? C.textS : "#d4a800", fontSize: 13, margin: 0 }}>
          {held
            ? `The new date is held for them until ${fmtDeadline(request.holdUntil!)}. Approving checks it again and moves the booking; the payment carries over.`
            : "The 48-hour hold has run out, so the date wasn't kept. Decline it and the guest can ask again."}
        </p>
        <div>
          <Label htmlFor="dc-note">Message to the guest if you decline (optional)</Label>
          <Textarea id="dc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, resize: "none" }}
            placeholder="e.g. We have a private event that weekend." />
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
