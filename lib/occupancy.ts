// ── Who is physically in the resort right now
//
// Used by the dashboard's "TODAY (LIVE)" panel. A booking counts toward
// occupancy only while the clock is inside its tour window — so guests drop
// off by themselves when their tour ends, rather than lingering until
// midnight because the date still matches.
//
// Hours come from lib/resort.ts, the same place every page reads them from
// (they used to be set here separately, as 8 AM / 6 PM, and disagreed with
// the rest of the site).
//
// Rooms are rented per slot, so a guest with a room leaves when their slot
// ends — the 5–7 PM gap is what lets a room be turned over for the Night.

import type { Booking } from "@/types/booking";
import { parseDateStr } from "@/lib/validators";
import { SLOTS } from "@/lib/resort";
import { getBookingSlot } from "@/lib/utils";

/**
 * The window a booking occupies the resort for, in local time.
 * Returns null when the booking has no usable date.
 */
export function getOccupancyWindow(
  booking: Pick<Booking, "date" | "package" | "overtime" | "rooms" | "slot">
): { start: Date; end: Date } | null {
  const day = parseDateStr(booking.date ?? "");
  if (!day) return null;

  const slot = SLOTS[getBookingSlot(booking as Booking)];

  const start = new Date(day);
  start.setHours(slot.startHour, 0, 0, 0);

  // Day overtime pushes the end back (setHours handles 24 = midnight).
  const end = new Date(day);
  const overtime = slot.id === "Day" ? Math.max(0, booking.overtime ?? 0) : 0;
  end.setHours(slot.endHour + overtime, 0, 0, 0);

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
