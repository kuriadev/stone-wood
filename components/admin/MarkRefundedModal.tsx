"use client";

// ── "Mark as refunded"
//
// The system does not send refunds. A refund happens only when the resort
// cancelled, and the guest and the owner or front desk agree it by call or
// chat; whoever returns the money then marks the booking here. One step:
// no reference, no receipt. It closes the booking (no new date any more)
// and saves the refund, so Reports and Sales stop counting that money as
// kept. POST /api/bookings/[id]/mark-refunded.

import { useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { bookingMoney, livePayments, round2 } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import { MANUAL_METHODS } from "@/types/finance";
import type { Booking } from "@/types/booking";
import { ActionButton, ChoiceButtons, ErrorNote, Label, Modal, useAdminStyle } from "@/components/admin/ui";

export function MarkRefundedModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, soft } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  // What goes back: everything they paid (a booking the resort just
  // cancelled), or what is still owed (one already waiting for a refund).
  const refunded = round2(livePayments(ops.payments).filter((p) => p.bookingId === booking.id && p.type === "Refund").reduce((s, p) => s + p.amount, 0));
  const amount = booking.refundStatus === "Owed"
    ? round2(Math.max(0, (booking.refundAmount ?? 0) - refunded))
    : round2(Math.max(0, bookingMoney(booking, ops.payments, ops.damages).paid));

  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>("GCash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    setBusy(true);
    const r = await ops.markRefunded(booking.id, { method, note: "" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(amount > 0 ? `${booking.id} marked refunded: ${fmt(amount)} returned to ${booking.name}.` : `${booking.id} marked refunded.`, "success");
    onClose();
  };

  return (
    <Modal title="Mark as refunded" subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : amount > 0 ? `Mark ${fmt(amount)} refunded` : "Mark refunded"}
          </ActionButton>
        </div>
      }>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ background: soft, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: C.textS, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>Returned to the guest</div>
          <div style={{ color: C.textH, fontSize: 26, fontWeight: 700, marginTop: 2 }}>{fmt(amount)}</div>
        </div>
        <p style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
          Refunds are arranged with the guest by call or chat, not sent through the system. Mark it here <strong style={{ color: C.textH }}>after</strong> you
          and {booking.name} have agreed it and the money is back with them. The booking closes (they can no longer pick a new date),
          and the refund comes off the money totals in Reports and Sales.
        </p>
        {amount > 0 && (
          <div>
            <Label>How did the money go back?</Label>
            {/* How the money went back is whatever the guest and staff agreed:
                cash, or any online transfer (stored as the e-wallet method). */}
            <ChoiceButtons value={method} onChange={setMethod} size="sm" options={MANUAL_METHODS.map((m) => ({ value: m, label: m === "Cash" ? "Cash" : "Online transaction" }))} />
            {method === "Cash" && <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>Cash comes out of today&apos;s drawer count.</p>}
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
