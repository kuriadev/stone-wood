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
 * The window a booking occupies the resort for, in local time.
 * Returns null when the booking has no usable date.
 *
 * NOTE: a "+ Room" package is treated as ending with its tour, NOT as an
 * overnight stay. The data model has no overnight package and no check-out
 * field, so assuming guests stay until morning would be inventing a rule.
 * If rooms are in fact overnight, extend `end` here — it is the only place
 * that decides this.
 */
export function getOccupancyWindow(
  booking: Pick<Booking, "date" | "package" | "overtime">
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
