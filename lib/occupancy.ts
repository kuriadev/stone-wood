// ── Who is physically in the resort right now
//
// Used by the dashboard's "TODAY (LIVE)" panel. A booking counts toward
// occupancy only while the clock is inside its tour window — so guests drop
// off by themselves when their tour ends, rather than lingering until
// midnight because the date still matches.
//
// ── HOURS: SINGLE SOURCE OF TRUTH ───────────────────────────────────
// The rest of the app currently disagrees with itself about opening time:
//   components/sections/BookNow.tsx    Day 8:00 AM – 5:00 PM, Night 6:00 PM – 12:00 AM
//   components/sections/Home.tsx       Day 7:00 AM – 5:00 PM, Night 7:00 PM – 12:00 AM
//   components/layout/Navbar.tsx       7:00 AM – 5:00 PM
//   components/sections/CustomerService.tsx  8:00 AM – 5:00 PM
//
// The values below follow BookNow, because that is the surface where a guest
// actually completes a reservation. Change them here and the live occupancy
// count follows; the user-facing copy in those files is separate and still
// needs reconciling.

import type { Booking } from "@/types/booking";
import { parseDateStr } from "@/lib/validators";

export const DAY_TOUR_START_HOUR = 8;   // 8:00 AM
export const DAY_TOUR_END_HOUR = 17;    // 5:00 PM
export const NIGHT_TOUR_START_HOUR = 18; // 6:00 PM
export const NIGHT_TOUR_END_HOUR = 24;   // 12:00 AM (midnight, same calendar day + 1)

/**
 * When a guest with a room is considered to have left, the morning after.
 *
 * ASSUMPTION, not a fact from the data: there is no check-out field on a
 * booking, so this had to be picked. 8:00 AM lines up with the day tour's
 * start, so an overnight guest leaves exactly as the next day opens. If the
 * resort's real check-out is 10:00 or noon, change this one number.
 */
export const ROOM_CHECKOUT_HOUR = 8;

/**
 * The window a booking occupies the resort for, in local time.
 * Returns null when the booking has no usable date.
 *
 * A booking with a room is an OVERNIGHT stay: it runs from the tour start
 * until ROOM_CHECKOUT_HOUR the following morning, not until the tour ends.
 * Without this a "Day Tour + Room" guest vanished from the live count at
 * 5:00 PM while still asleep in the room they had paid for.
 *
 * A booking with no room still ends with its tour, which is correct — those
 * guests really do leave.
 */
export function getOccupancyWindow(
  booking: Pick<Booking, "date" | "package" | "overtime" | "rooms">
): { start: Date; end: Date } | null {
  const day = parseDateStr(booking.date ?? "");
  if (!day) return null;

  const pkg = String(booking.package ?? "");
  const isNight = pkg.startsWith("Night");

  const startHour = isNight ? NIGHT_TOUR_START_HOUR : DAY_TOUR_START_HOUR;
  const endHour = isNight ? NIGHT_TOUR_END_HOUR : DAY_TOUR_END_HOUR;

  const start = new Date(day);
  start.setHours(startHour, 0, 0, 0);

  // Overtime extends the end. setHours handles rollover past midnight, so a
  // night tour running over simply lands on the following morning.
  const end = new Date(day);
  end.setHours(endHour + Math.max(0, booking.overtime ?? 0), 0, 0, 0);

  // Overnight: a room was actually assigned, or the package names one. The
  // assigned-rooms list is the stronger signal, since a package can be
  // renamed but an allocated room is a fact about this booking.
  const hasRoom = (booking.rooms?.length ?? 0) > 0 || /\+\s*room/i.test(pkg);
  if (hasRoom) {
    const checkout = new Date(day);
    checkout.setDate(checkout.getDate() + 1);
    checkout.setHours(ROOM_CHECKOUT_HOUR, 0, 0, 0);
    // Whichever is later. A night tour with enough overtime could in
    // principle already run past the next morning's check-out.
    if (checkout.getTime() > end.getTime()) return { start, end: checkout };
  }

  return { start, end };
}

/** True when `now` falls inside the booking's window and it is confirmed. */
export function isInResort(booking: Booking, now: Date): boolean {
  // Only Confirmed guests are actually on site. Paid means the booking is
  // reserved but not yet accepted by staff; Completed and Cancelled are done.
  if (booking.status !== "Confirmed") return false;

  const w = getOccupancyWindow(booking);
  if (!w) return false;

  const t = now.getTime();
  return t >= w.start.getTime() && t < w.end.getTime();
}

/** Bookings currently on site, and the headcount they represent. */
export function getCurrentOccupancy(
  bookings: Booking[],
  now: Date
): { present: Booking[]; total: number } {
  const present = bookings.filter((b) => isInResort(b, now));
  return { present, total: present.reduce((sum, b) => sum + (b.guests ?? 0), 0) };
}
