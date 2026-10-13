// ── GET /api/availability  → which dates, rooms and capacity are taken
//
// Public. Feeds the calendars and the capacity checks on the guest pages.
//
// Before this, guests had no real booking data at all: the full list is
// admin-only (it holds names, emails and phone numbers), so the public
// pages fell back to sample bookings and showed dates as free that were
// actually full. This returns only what availability needs — no id, name,
// email, contact, notes or amounts.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { startOfToday, toDateStr } from "@/lib/validators";
import { heldBookings, FREED_STATUS_LIST, sweepExpired } from "@/lib/rebooking.server";
import type { AvailabilitySlot, AvailabilityFacility } from "@/lib/publicAvailability";

export type { AvailabilitySlot, AvailabilityFacility };

export const dynamic = "force-dynamic";

const SLOT_COLUMNS = "date, guests, status, rooms, resource, tier, slot, overtime, package";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { name: "availability", limit: 300, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  // One day of slack behind "today": the server may run in UTC while the
  // resort is in UTC+8, and dropping a day the guest still sees as today
  // would show it as free.
  const from = startOfToday();
  from.setDate(from.getDate() - 1);
  const fromStr = toDateStr(from);

  try {
    // Release unpaid walk-ins and expired holds first, so a date a forgotten
    // walk-in was holding shows as open (lib/rebooking.server.ts).
    await sweepExpired();
    const db = getSupabaseAdmin();

    /* Every booking still running on or after `from`, judged by its LAST
       day — a stay that began last week and ends tomorrow still holds
       tomorrow. Its end date is sent too, or the calendar would read it
       as a one-day booking and offer the rest of the stay as free.

       Before 20261010120000_multi_day_bookings.sql there is no end_date
       column and every booking is a single day, so the start date is the
       last day and the old query is exactly right. */
    const currentBookings = async () => {
      const ranged = await db.from("bookings").select(`${SLOT_COLUMNS}, end_date`)
        .not("status", "in", FREED_STATUS_LIST).gte("end_date", fromStr).order("date");
      if (!ranged.error || !/end_date/i.test(ranged.error.message)) return ranged;
      return db.from("bookings").select(SLOT_COLUMNS)
        .not("status", "in", FREED_STATUS_LIST).gte("date", fromStr).order("date");
    };

    // Both in parallel — this endpoint sits in front of every guest calendar,
    // so it should not cost two round trips in series.
    const [bookingsRes, facilitiesRes] = await Promise.all([
      currentBookings(),
      // Column list, not select("*"): the omitted columns are staff-only and
      // one of them holds a past guest's name.
      db.from("facilities").select("id, category, name, status, room_id").order("id"),
    ]);
    // Dates held for a guest's pending date change count as booked, so the
    // calendar never offers a date someone is already waiting on. A hold
    // covers the whole stay it would move, so it carries its end date too.
    const holds: AvailabilitySlot[] = (await heldBookings({ fromDate: fromStr })).map((b) => ({
      date: b.date, end_date: b.endDate ?? b.date, guests: b.guests, status: b.status, rooms: b.rooms,
      resource: b.resource ?? null, tier: b.tier ?? null, slot: b.slot ?? null, overtime: b.overtime, package: b.package,
    }));

    if (bookingsRes.error) throw new Error(bookingsRes.error.message);
    if (facilitiesRes.error) throw new Error(facilitiesRes.error.message);

    return NextResponse.json({
      success: true,
      slots: [...((bookingsRes.data ?? []) as AvailabilitySlot[]), ...holds],
      // Lets a guest see that a room is Under Maintenance. Without it their
      // copy of the facility list was the hardcoded INIT_FACILITIES, where
      // everything is "Available" — so a room pulled out of circulation in
      // the admin panel was still bookable from the public site.
      facilities: (facilitiesRes.data ?? []) as AvailabilityFacility[],
    });
  } catch (err) {
    console.error("[/api/availability GET]", err);
    return NextResponse.json({ success: false, error: "Could not load availability." }, { status: 500 });
  }
}
