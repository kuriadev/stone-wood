"use client";

/* "Edit" on a Dashboard card: one window that lists what can still be
 * changed on a booking, each opening the window that already does it
 * properly (with the price, the calendar and the activity log kept right):
 * guest details, more guests (over capacity with a warning), overtime, a
 * room, the events venue, a payment, the date. */

import { Modal, useAdminStyle } from "@/components/admin/ui";
import { Icon, type IconName } from "@/components/common/Icon";
import { chargeKindsFor, type ChargeKind } from "@/lib/charges";
import { SLOTS } from "@/lib/resort";
import { fmtDate, getBookingSlot } from "@/lib/utils";
import type { Booking } from "@/types/booking";

export type EditChoice = "details" | "charge" | "pay" | "move";

export function EditBookingHub({ booking: b, canMove, canPay, onPick, onClose }: {
  booking: Booking;
  /** The date can still be changed by hand (not today or on site). */
  canMove: boolean;
  canPay: boolean;
  onPick: (what: EditChoice, charge?: ChargeKind) => void;
  onClose: () => void;
}) {
  const { C, cBr } = useAdminStyle();
  const blocked = chargeKindsFor(b);
  const tile = (icon: IconName, title: string, sub: string, onClick: () => void, off?: string) => (
    <button type="button" onClick={onClick} disabled={!!off} title={off}
      className="sw-gold-hover"
      style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "10px 14px", borderRadius: 12, border: `1px solid ${cBr}`, background: "transparent", cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.5 : 1, textAlign: "left", font: "inherit", color: "inherit", width: "100%" }}>
      <span aria-hidden style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(201,168,76,0.12)", color: "var(--sw-gold-ink)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={17} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", color: C.textH, fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ display: "block", color: C.textS, fontSize: 12 }}>{off ?? sub}</span>
      </span>
      {!off && <Icon name="chevron-right" size={16} style={{ color: C.textS, flexShrink: 0 }} />}
    </button>
  );
  const s = SLOTS[getBookingSlot(b)];
  return (
    <Modal title={`Edit ${b.name}'s booking`} subtitle={`${b.id} · ${fmtDate(b.date)} · ${s.label} · ${b.guests} guest${b.guests === 1 ? "" : "s"}`} onClose={onClose} width={560}>
      <div style={{ display: "grid", gap: 10 }}>
        {tile("user", "Guest details", "Name, phone number and email", () => onPick("details"))}
        {tile("users", "Number of guests", "More people came — over capacity too, with a warning", () => onPick("charge", "guests"), blocked.guests || undefined)}
        {tile("clock", "Overtime", "Extra hours on a Day Tour", () => onPick("charge", "overtime"), blocked.overtime || undefined)}
        {tile("bed", "Add a room", "A room for the group", () => onPick("charge", "room"), blocked.room || undefined)}
        {tile("tent", "Add the events venue", "The hall for their event", () => onPick("charge", "venue"), blocked.venue || undefined)}
        {canPay && tile("cash", "Record a payment", "Money received from the guest", () => onPick("pay"))}
        {tile("calendar", "Change the date", "Move it to another free date", () => onPick("move"), canMove ? undefined : "Only bookings not yet arriving can be moved. Use Coming up.")}
      </div>
      <p style={{ color: C.textS, fontSize: 12, margin: "14px 0 0", lineHeight: 1.5 }}>
        Each change updates the price and the balance, and is written to Activity History with your name.
      </p>
    </Modal>
  );
}
