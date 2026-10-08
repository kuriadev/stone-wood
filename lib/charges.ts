// ── Charges added on the day
//
// Money the resort earns at the resort, after the booking was made:
//
//   overtime      a Day Tour staying past 5 PM, ₱500/hr, at most
//                 OVERTIME_MAX hours in all, only when the Night slot is free
//   extra guests  more people than booked on a Shared pool booking, at the
//                 per-guest rate (Exclusive already covers the whole resort,
//                 and the venue is a flat rate)
//   a room        a room added to a booking that didn't have it, at the
//                 room's own rate for each slot
//
// Before this there was nowhere to put that money: the booking's total
// couldn't change, and Record payment won't take more than the balance. So it
// never reached Sales, and when it was paid in cash the day's count came out
// "over". A charge raises the booking's total; the money is then collected
// like any balance (Check out, Settle or Record payment) and lands in Sales
// and the cash count by the usual route.
//
// Pure: the admin window shows this price, and POST /api/bookings/[id]/charge
// works it out again from the database before saving, so the two agree.

import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import { SLOTS } from "@/lib/resort";
import { getBookingSlot, getBookingResource, getBookingTier } from "@/lib/utils";
import { OVERTIME_MAX, OVERTIME_RATE, SHARED_PER_HEAD_RATE, GUESTS_MAX } from "@/lib/validators";

export type ChargeKind = "overtime" | "guests" | "room";

export interface ChargeRequest {
  kind: ChargeKind;
  /** Overtime: hours to add. */
  hours?: number;
  /** Extra guests: how many more people. */
  guests?: number;
  /** A room: which one. */
  roomId?: number;
}

export type ChargeResult =
  | { ok: true; amount: number; label: string; next: Pick<Booking, "overtime" | "guests" | "rooms"> }
  | { ok: false; error: string };

/** Which charges this booking can take at all, for the admin window. */
export function chargeKindsFor(b: Booking): Record<ChargeKind, string | null> {
  const slot = getBookingSlot(b);
  const pool = getBookingResource(b) !== "Venue";
  return {
    overtime: slot !== "Day" ? "Overtime is only for the Day Tour."
      : (b.overtime ?? 0) >= OVERTIME_MAX ? `It already has the most overtime allowed (${OVERTIME_MAX} hrs).`
      : null,
    guests: !pool ? "The events venue is a flat rate, whatever the number of guests."
      : getBookingTier(b) !== "Shared" ? `An Exclusive booking already covers up to ${GUESTS_MAX} guests at a flat rate.`
      : null,
    room: !pool ? "A venue-only booking doesn't include rooms." : null,
  };
}

export function priceCharge(b: Booking, req: ChargeRequest, rooms: Room[]): ChargeResult {
  const no = (error: string): ChargeResult => ({ ok: false, error });
  const blocked = chargeKindsFor(b)[req.kind];
  if (blocked === undefined) return no("Choose what to charge for.");
  if (blocked) return no(blocked);
  const slots = SLOTS[getBookingSlot(b)].span;
  const keep = { overtime: b.overtime ?? 0, guests: b.guests, rooms: b.rooms ?? [] };

  if (req.kind === "overtime") {
    const hours = Math.round(Number(req.hours) || 0);
    const left = OVERTIME_MAX - keep.overtime;
    if (hours < 1) return no("Enter the hours of overtime.");
    if (hours > left) return no(`At most ${left} more hour${left === 1 ? "" : "s"} of overtime (${OVERTIME_MAX} in all).`);
    return {
      ok: true, amount: hours * OVERTIME_RATE,
      label: `${hours} hr overtime`,
      next: { ...keep, overtime: keep.overtime + hours },
    };
  }

  if (req.kind === "guests") {
    const extra = Math.round(Number(req.guests) || 0);
    if (extra < 1) return no("Enter how many more guests came.");
    if (keep.guests + extra > GUESTS_MAX) return no(`That would make ${keep.guests + extra} guests; the most for one booking is ${GUESTS_MAX}.`);
    return {
      ok: true, amount: extra * SHARED_PER_HEAD_RATE * slots,
      label: `${extra} extra guest${extra === 1 ? "" : "s"}`,
      next: { ...keep, guests: keep.guests + extra },
    };
  }

  const room = rooms.find((r) => r.id === Number(req.roomId));
  if (!room) return no("Choose a room.");
  if (keep.rooms.includes(room.id)) return no(`${room.name} is already part of this booking.`);
  return {
    ok: true, amount: room.price * slots,
    label: `room: ${room.name}`,
    next: { ...keep, rooms: [...keep.rooms, room.id] },
  };
}
