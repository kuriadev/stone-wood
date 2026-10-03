// Server-only helpers shared by the day-of routes (check-in, check-out,
// settle): load the facilities and bookings they need, and work out which
// facilities another group is still using, so one group leaving the shared
// pool does not flag it "Needs Cleaning" under a group still swimming.

import { getSupabaseAdmin, rowToBooking, rowToFacility } from "@/lib/supabase";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import type { BookingRow, FacilityRow } from "@/types/database";
import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";

export async function loadBookingAndFacilities(bookingId: string): Promise<{ booking: Booking | null; facilities: Facility[] }> {
  const db = getSupabaseAdmin();
  const [bk, fs] = await Promise.all([
    db.from("bookings").select("*").eq("id", bookingId).maybeSingle(),
    db.from("facilities").select("*"),
  ]);
  if (bk.error) throw new Error(bk.error.message);
  if (fs.error) throw new Error(fs.error.message);
  return {
    booking: bk.data ? rowToBooking(bk.data as BookingRow) : null,
    facilities: (fs.data as FacilityRow[]).map(rowToFacility),
  };
}

/** Ids of facilities used by any OTHER group that is checked in and not
 *  yet checked out. */
export async function facilitiesInUseByOthers(bookingId: string, facilities: Facility[]): Promise<Set<number>> {
  const { data, error } = await getSupabaseAdmin().from("bookings").select("*")
    .eq("status", "Confirmed").not("checked_in_at", "is", null).is("checked_out_at", null).neq("id", bookingId);
  if (error) throw new Error(error.message);
  const ids = new Set<number>();
  for (const row of data as BookingRow[]) {
    for (const f of facilitiesForBooking(rowToBooking(row), facilities)) ids.add(f.id);
  }
  return ids;
}

/** True when the booked hours ended more than 12 hours ago: the stay is
 *  being recorded after the fact (an overdue booking completed later), so
 *  the state of its facilities now has nothing to do with it and is left
 *  alone. Worked out in Manila time, whatever the server's own zone. */
export function stayLongOver(booking: Booking, now = Date.now()): boolean {
  const slot = SLOTS[getBookingSlot(booking)];
  const overtime = slot.id === "Day" ? Math.max(0, booking.overtime ?? 0) : 0;
  const end = Date.parse(`${booking.date}T00:00:00+08:00`) + (slot.endHour + overtime) * 3_600_000;
  return Number.isFinite(end) && now - end > 12 * 3_600_000;
}
