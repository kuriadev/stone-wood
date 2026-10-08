"use client";

// ── "Cancel (resort can't host)"
//
// The one way the resort turns a booking down: an emergency, bad weather, a
// repair, a double booking. Available any time until the group checks in,
// whatever the guest has paid. Nothing is decided for the guest here:
//
//   • the date is freed and their payment stays with the booking
//   • they're emailed, and the owner can text them from the next screen
//   • on their booking page they pick a new date within GUEST_CHOICE_DAYS;
//     it comes to Daily Operations → Reschedules for the owner to approve
//   • a refund instead is arranged with the owner by call or chat
//
// So a paying guest is never just "rejected" and left wondering where
// their money went. (/api/bookings/[id]/resort-cancel does the work.)

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { bookingMoney } from "@/lib/finance";
import { GUEST_CHOICE_DAYS } from "@/lib/rebooking";
import { fmt, fmtDate } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import type { RejectionMoney } from "@/lib/emailTemplate";
import { TextGuest } from "@/components/admin/TextGuest";
import { Btn, ConfirmDialog, ErrorNote, Label, Modal, useAdminStyle } from "@/components/admin/ui";

export type UpdateStatus = (
  id: string,
  status: string,
  reason?: string,
  opts?: { silent?: boolean; money?: RejectionMoney },
) => void;

/** One-tap reasons. The text is what the guest reads, and stays editable. */
const PRESETS: { label: string; text: string }[] = [
  { label: "Emergency", text: "An emergency at the resort means we can't host your group on that date." },
  { label: "Bad weather", text: "The resort is closed on that date because of bad weather." },
  { label: "Facility repair", text: "A facility in your booking is under repair on that date." },
  { label: "Double booking", text: "That date was booked twice by mistake on our side." },
];

export function ResortCancelDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, cBr, soft, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const paid = Math.max(0, bookingMoney(booking, ops.payments, ops.damages).paid);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ sms: string; emailed: boolean } | null>(null);

  const confirm = async () => {
    setError("");
    setBusy(true);
    const r = await ops.resortCancel(booking.id, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`${booking.id} cancelled. ${booking.name} will choose a new date or a refund.`, "warning");
    setDone({ sms: String(r.data?.sms ?? ""), emailed: r.data?.emailed === true });
  };

  // ── After: let the guest know ──────────────────────────────────────
  if (done) {
    return (
      <Modal title="Let the guest know" subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={560}
        footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><Btn kind="primary" onClick={onClose}>Done</Btn></div>}>
        <p style={{ color: C.textB, fontSize: 13.5, marginTop: 0 }}>
          {done.emailed ? `An email went to ${booking.email}. ` : booking.email ? "The email couldn't be sent. " : "This guest has no email. "}
          Most guests read texts sooner, so send them this too:
        </p>
        {done.sms && <TextGuest booking={booking} message={done.sms} about="the cancellation" />}
      </Modal>
    );
  }

  return (
    <ConfirmDialog title="Cancel this booking?" description={`${booking.name} · ${booking.id} · ${fmtDate(booking.date)}`}
      onCancel={onClose} cancelLabel="Go back" width={560}
      confirm={<Btn kind="red" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "Cancel booking"}</Btn>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <Label htmlFor="cancel-reason">Reason the guest reads</Label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => setReason(p.text)} aria-pressed={reason === p.text}
                style={{ padding: "4px 12px", borderRadius: 14, fontSize: 12, cursor: "pointer", border: `1px solid ${reason === p.text ? "#d4a80088" : cBr}`, background: reason === p.text ? "rgba(212,168,0,0.1)" : "transparent", color: C.textB }}>
                {p.label}
              </button>
            ))}
          </div>
          <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. An emergency at the resort means we can't host your group on that date." style={{ ...inp, resize: "none" }} />
        </div>

        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.textB, lineHeight: 1.6 }}>
          <strong style={{ color: C.textH, display: "block", marginBottom: 4 }}>What happens next</strong>
          The date opens up for other guests.{" "}
          {paid > 0 ? <>The <strong style={{ color: C.textH }}>{fmt(paid)}</strong> they paid stays with the booking. </> : null}
          {booking.name} gets {GUEST_CHOICE_DAYS} days to pick a new date on their booking page. The date they pick comes to Daily Operations → Reschedules for you to approve before it&apos;s confirmed.
          {paid > 0 && <> If they&apos;d rather have a refund, they&apos;ll call or message you to arrange it.</>}
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </ConfirmDialog>
  );
}
