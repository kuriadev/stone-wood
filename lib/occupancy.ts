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
//
// That single window is the whole truth for a Whole Day run, where the
// group really is on site throughout. For a Day or Night run it is the
// OUTER bound rather than continuous occupancy: the group goes home in the
// 14-hour gap between cycles. Nothing here needs to care — isInResort is
// only ever asked about now, and a guest who has gone home for the night
// is outside today's slot hours either way — but stayWindowLabel below
// shows these two ends to the guest, and SLOTS[].stay in lib/resort.ts is
// what tells them which of the two kinds of stay they have bought.

import type { Booking } from "@/types/booking";
import { parseDateStr } from "@/lib/validators";
import { SLOTS } from "@/lib/resort";
import { getBookingSlot, bookingEndDate, fmtDate } from "@/lib/utils";

/** The least a caller needs to supply to ask when a stay runs: the
 *  dates, and enough to work out the slot. `package` and `slot` are both
 *  optional because getBookingSlot falls back from one to the other, and
 *  `rooms` is not read here at all — it was only ever in this type
 *  because the first caller happened to pass a whole Booking. */
export type StayWindowInput =
  Pick<Booking, "date" | "endDate"> &
  Partial<Pick<Booking, "package" | "overtime" | "slot" | "rooms">>;

/**
 * The window a booking occupies the resort for, in local time.
 * Returns null when the booking has no usable date.
 */
export function getOccupancyWindow(booking: StayWindowInput): { start: Date; end: Date } | null {
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

/** A local Date back to YYYY-MM-DD. Local, not UTC: the window above is
 *  built with setHours on a local Date, so reading it back in UTC would
 *  shift the departure a day for anyone east of Greenwich — Manila
 *  included. */
const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The date the group actually leaves: for a Night Tour, the morning after
 *  its last date. */
export function departureDate(booking: StayWindowInput): string | null {
  const w = getOccupancyWindow(booking);
  return w ? isoDay(w.end) : null;
}

/** An hour of the day as "5:00 AM". Every window boundary in this system
 *  is set with setHours(h, 0, 0, 0), so there are never minutes to show. */
const clockLabel = (d: Date): string => {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
};

/**
 * When the guest actually arrives and when they actually leave — the two
 * moments a guest cares about, which for an overnight slot are NOT the
 * booking's first and last dates.
 *
 * A Night Tour booked for the 10th to the 12th runs to 5:00 AM on the
 * 13th, a date that appears nowhere on the booking. Showing "October 10 –
 * October 12" and the hours separately left the guest to do that sum
 * themselves, and they got it wrong. Derived from getOccupancyWindow so
 * it can never disagree with the operations screen.
 */
export function stayWindowLabel(booking: StayWindowInput): { arrive: string; depart: string } | null {
  const w = getOccupancyWindow(booking);
  if (!w) return null;
  return {
    arrive: `${fmtDate(isoDay(w.start))}, ${clockLabel(w.start)}`,
    depart: `${fmtDate(isoDay(w.end))}, ${clockLabel(w.end)}`,
  };
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
