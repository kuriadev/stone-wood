// ── Moving bookings: the rules, shared by the guest page, the admin and
// the server
//
//   Resort cancellation   The resort can't host the booking (emergency,
//                         weather, a repair). The date is freed, the guest's
//                         payment stays with the booking, and the guest has
//                         GUEST_CHOICE_DAYS to pick a new date — confirmed at
//                         once — or ask for a refund. No answer by then means
//                         a refund is owed.
//
//   Guest date change     The guest picks a free date themselves, once per
//                         booking, and only before the visit day. The new
//                         date is held for HOLD_HOURS while the owner
//                         approves or declines.
//
// Neither needs a background job: each deadline is stored, and everything
// that reads a booking or a request compares it with the clock.

import type { Booking } from "@/types/booking";
import type { DateChange } from "@/types/finance";

export const GUEST_CHOICE_DAYS = 7;
export const HOLD_HOURS = 48;
/** Date changes a guest may ask for on one booking. */
export const GUEST_CHANGES_ALLOWED = 1;

/** Whether a resort-cancelled booking's guest can still choose. */
export function choiceOpen(b: Pick<Booking, "status" | "choiceDeadline">, now = Date.now()): boolean {
  return b.status === "ResortCancelled" && !!b.choiceDeadline && Date.parse(b.choiceDeadline) > now;
}

/** A pending guest request whose 48-hour hold hasn't run out. */
export function holdActive(r: Pick<DateChange, "status" | "holdUntil">, now = Date.now()): boolean {
  return r.status === "Pending" && !!r.holdUntil && Date.parse(r.holdUntil) > now;
}

/** The bookings list with every held date added as a stand-in booking, so
 *  any availability check that reads the list (a walk-in, the calendar)
 *  treats a held date as taken. Stand-ins carry a HOLD- id and are never
 *  shown or saved. */
export function withHolds(bookings: Booking[], requests: DateChange[], now = Date.now()): Booking[] {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const held: Booking[] = [];
  for (const r of requests) {
    if (!holdActive(r, now)) continue;
    const b = byId.get(r.bookingId);
    if (b) held.push({ ...b, id: `HOLD-${r.id}`, date: r.toDate, status: "Confirmed" });
  }
  return held.length ? [...bookings, ...held] : bookings;
}

/** "Sat, Oct 12, 2:30 PM" in Manila time, for deadlines. */
export function fmtDeadline(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}
