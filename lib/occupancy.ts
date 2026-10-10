// ── Who is physically in the resort right now
//
// getOccupancyWindow gives a booking's hours; Daily Operations uses it to
// flag a checked-in group whose booked time is over. A booking counts toward
// occupancy only while the clock is inside its tour window — so guests drop
// off by themselves when their tour ends, rather than lingering until
// midnight because the date still matches.
//
// Hours come from lib/resort.ts, the same place every page reads them from
// (they used to be set here separately, as 8 AM / 6 PM, and disagreed with
// the rest of the site).
//
// ── Rooms are per SLOT. A slot may now run overnight; that is not the same
// ── thing as selling an overnight stay, and the difference still matters.
//
// A room is a day-use room attached to a tour: the guest has it for their
// slot and gives it back when that slot ends. The Night Tour's slot now
// ends at 5 AM the following morning (lib/resort.ts), so a Night group
// genuinely is on the premises after midnight — but the room is still tied
// to the SLOT, not rented by the night:
//
//   - a Night booking on the 10th holds its room for Night/10th only;
//   - it is handed back at 5 AM on the 11th;
//   - MORNING_TURNOVER_WINDOW (5–7 AM) cleans it;
//   - the 11th's Day Tour takes it at 7 AM, unblocked.
//
// So `occupiedSlots` and `roomsTakenOn` are unchanged and still correct.
// This was once rewritten to treat a room as a rented night running to an
// 8 AM checkout, and reverted; that is still the wrong model. The right
// one is: slots have hours, hours may cross midnight, rooms follow slots.
//
// A stay booked over several days (`endDate`) repeats the same slot on each
// date, so its window runs from the first day's start to the LAST day's
// end — which is why the end below is computed from the end date.

import type { Booking } from "@/types/booking";
import { parseDateStr } from "@/lib/validators";
import { SLOTS } from "@/lib/resort";
import { getBookingSlot, bookingEndDate } from "@/lib/utils";

/**
 * The window a booking occupies the resort for, in local time.
 * Returns null when the booking has no usable date.
 */
export function getOccupancyWindow(
  booking: Pick<Booking, "date" | "endDate" | "package" | "overtime" | "rooms" | "slot">
): { start: Date; end: Date } | null {
  const day = parseDateStr(booking.date ?? "");
  if (!day) return null;
  // A multi-day stay ends on its last date; a one-day booking ends on its
  // own. The Night Tour's 5 AM finish is then an hour past 24, which
  // setHours rolls into the following morning by itself.
  const lastDay = parseDateStr(bookingEndDate(booking)) ?? day;

  const slot = SLOTS[getBookingSlot(booking as Booking)];

  const start = new Date(day);
  start.setHours(slot.startHour, 0, 0, 0);

  // Day overtime pushes the end back (setHours handles 24 = midnight, and
  // 29 = 5 AM the next day).
  const end = new Date(lastDay);
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
