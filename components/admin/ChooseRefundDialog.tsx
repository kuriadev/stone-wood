"use client";

// ── "The guest chose a refund" on a booking the resort cancelled
//
// Refunds are arranged with the owner by call or chat, so the owner records
// the guest's choice here (POST /api/bookings/[id]/refund-request). The
// booking is cancelled, what the guest paid becomes a refund owed, and any
// new date they had picked is withdrawn. `onDone` then opens "Send refund"
// so the transfer can be recorded straight away.

import { useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { bookingMoney } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import { ActionButton, ConfirmDialog, ErrorNote, useAdminStyle } from "@/components/admin/ui";

export function ChooseRefundDialog({ booking, onClose, onDone }: {
  booking: Booking;
  onClose: () => void;
  /** Called with the updated booking, to open "Send refund". */
  onDone: (b: Booking) => void;
}) {
  const { C } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paid = Math.max(0, bookingMoney(booking, ops.payments, ops.damages).paid);

  const confirm = async () => {
    setError("");
    setBusy(true);
    const r = await ops.chooseRefund(booking.id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(paid > 0 ? `${booking.id} cancelled. ${fmt(paid)} is to be refunded to ${booking.name}.` : `${booking.id} cancelled. Nothing was paid, so there's nothing to refund.`, "info");
    if (paid > 0 && r.data?.booking) onDone(r.data.booking as Booking);
    else onClose();
  };

  return (
    <ConfirmDialog title={`${booking.name} chose a refund?`} onCancel={onClose}
      confirm={<ActionButton kind="red" icon="cash" disabled={busy} onClick={() => void confirm()}>{busy ? "Saving…" : paid > 0 ? `Yes, refund ${fmt(paid)}` : "Yes, cancel it"}</ActionButton>}>
      <p style={{ color: C.textS, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
        Record this once the guest has told you, by call or message, that they want their money back instead of a new date.
        {" "}{booking.id} will be cancelled and they can no longer pick a date{paid > 0 ? <>. The {fmt(paid)} they paid becomes a refund to send. Next you&apos;ll record the transfer.</> : "."}
        {paid > 0 && booking.email ? " They get an email saying the refund is on its way." : ""}
      </p>
      <ErrorNote>{error}</ErrorNote>
    </ConfirmDialog>
  );
}
