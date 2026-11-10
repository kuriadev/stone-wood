// ── Charges added on the day
//
// Money the resort earns at the resort, after the booking was made:
//
//   overtime      a Day Tour staying past 5 PM, ₱500/hr, at most
//                 OVERTIME_MAX hours in all, only when the Night slot is free
//   extra guests  more people than booked, on any booking (Shared,
//                 Exclusive or venue-only): each extra guest pays the
//                 per-guest rate, for every tour and day of the stay. Front
//                 desk and the owner can always add them, and go over
//                 capacity on purpose (with a warning), up to
//                 OVERRIDE_GUESTS_MAX in all.
//   a room        a room added to a booking that didn't have it, at the
//                 room's own rate for each slot
//   the venue     the events venue added to an Exclusive pool booking, at
//                 the venue's own rate for each slot. An Exclusive booking
//                 keeps the hall from other groups but doesn't include it;
//                 a group that decides on the day pays for it here.
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
import { CHILD_FREE_AGE } from "@/lib/children";
import type { Room } from "@/types/room";
import { SLOTS } from "@/lib/resort";
import { getBookingSlot, getBookingResource, getBookingTier, bookingDays } from "@/lib/utils";
import { OVERTIME_MAX, OVERTIME_RATE, sharedRateFor, OVERRIDE_GUESTS_MAX, EVENT_VENUE_RATE, guestLimitFor } from "@/lib/validators";

export type ChargeKind = "overtime" | "guests" | "room" | "venue";

export interface ChargeRequest {
  kind: ChargeKind;
  /** Overtime: hours to add. */
  hours?: number;
  /** Extra guests: how many more people. */
  guests?: number;
  /** A room: which one. */
  roomId?: number;
  /** Staff chose to go over the resort's capacity (OVERRIDE_GUESTS_MAX). */
  overCapacity?: boolean;
}

export type ChargeResult =
  | { ok: true; amount: number; label: string; next: Pick<Booking, "overtime" | "guests" | "rooms" | "resource"> }
  | { ok: false; error: string };

/** Which charges this booking can take at all, for the admin window. */
export function chargeKindsFor(b: Booking): Record<ChargeKind, string | null> {
  const slot = getBookingSlot(b);
  const pool = getBookingResource(b) !== "Venue";
  return {
    overtime: slot !== "Day" ? "Overtime is only for the Day Tour."
      : (b.overtime ?? 0) >= OVERTIME_MAX ? `It already has the most overtime allowed (${OVERTIME_MAX} hrs).`
      : null,
    // Always possible: staff can raise the count on any booking.
    guests: null,
    room: !pool ? "A venue-only booking doesn't include rooms." : null,
    venue: getBookingResource(b) !== "Pool" ? "This booking already has the events venue."
      : getBookingTier(b) !== "Exclusive" ? "The events venue can only be added to an Exclusive booking. A shared tour can't have it."
      : null,
  };
}

export function priceCharge(b: Booking, req: ChargeRequest, rooms: Room[]): ChargeResult {
  const no = (error: string): ChargeResult => ({ ok: false, error });
  const blocked = chargeKindsFor(b)[req.kind];
  if (blocked === undefined) return no("Choose what to charge for.");
  if (blocked) return no(blocked);
  const slots = SLOTS[getBookingSlot(b)].span;
  // Extra guests and a room are there for the whole stay, so a three-day
  // Whole Day pays for them three times — as the booking itself was priced.
  // (Overtime is a Day Tour thing, and Day Tours are one date.)
  const days = bookingDays(b);
  const keep = { overtime: b.overtime ?? 0, guests: b.guests, rooms: b.rooms ?? [], resource: getBookingResource(b) };

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
    const limit = guestLimitFor(getBookingResource(b));
    const cap = req.overCapacity ? OVERRIDE_GUESTS_MAX : limit;
    // Children under 3 sit outside the capacity, but adults and children
    // together never pass OVERRIDE_GUESTS_MAX (lib/children.ts).
    const kids = b.children ?? 0;
    // Shared children count toward the capacity; Exclusive ones don't.
    const countedKids = getBookingTier(b) === "Shared" ? kids : 0;
    if (keep.guests + extra + kids > OVERRIDE_GUESTS_MAX) {
      return no(`That would make ${keep.guests + extra + kids} people with the ${kids} child${kids === 1 ? "" : "ren"} under ${CHILD_FREE_AGE}; the most for one booking is ${OVERRIDE_GUESTS_MAX}.`);
    }
    if (keep.guests + extra + countedKids > cap) {
      return no(req.overCapacity
        ? `That would make ${keep.guests + extra + countedKids} guests; even over capacity the most for one booking is ${OVERRIDE_GUESTS_MAX}.`
        : `That would make ${keep.guests + extra + countedKids} guests${countedKids ? `, with the ${countedKids} child${countedKids === 1 ? "" : "ren"} under ${CHILD_FREE_AGE}` : ""}, more than the capacity of ${limit}. Tick "Allow more than ${limit} guests" to add them anyway.`);
    }
    return {
      ok: true, amount: extra * sharedRateFor(getBookingSlot(b)) * days,
      label: `${extra} extra guest${extra === 1 ? "" : "s"}${days > 1 ? ` × ${days} days` : ""}`,
      next: { ...keep, guests: keep.guests + extra },
    };
  }

  if (req.kind === "venue") {
    // The venue's own rate per slot and day, as on the rate card. The 10%
    // bundle is for booking the two together in advance.
    return {
      ok: true, amount: EVENT_VENUE_RATE * slots * days,
      label: `the events venue${days > 1 ? ` × ${days} days` : ""}`,
      next: { ...keep, resource: "Pool+Venue" },
    };
  }

  const room = rooms.find((r) => r.id === Number(req.roomId));
  if (!room) return no("Choose a room.");
  if (keep.rooms.includes(room.id)) return no(`${room.name} is already part of this booking.`);
  return {
    ok: true, amount: room.price * slots * days,
    label: `room: ${room.name}${days > 1 ? ` × ${days} days` : ""}`,
    next: { ...keep, rooms: [...keep.rooms, room.id] },
  };
}
