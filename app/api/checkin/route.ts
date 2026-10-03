// ── POST /api/checkin → the group has arrived            (admin only)
//
// Body: { bookingId, undo?: boolean }
//
// Records WHEN a confirmed group actually arrived and marks the facilities
// they use "In Use" (a facility Under Maintenance is left alone). Arrival
// is a tap rather than a guess from the clock: a group that never arrives
// stays visible as overdue instead of silently counting as on site.
//
// `undo` reverses a check-in tapped by mistake, as long as the group has
// not been checked out yet.
//
// A check-in recorded long after the visit (an overdue booking completed
// later) stamps the booking but leaves facility statuses alone.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { cleanText } from "@/lib/money";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { loadBookingAndFacilities, facilitiesInUseByOthers, stayLongOver } from "@/lib/ops.server";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bookingId = cleanText(b?.bookingId, 40);
  if (!bookingId) return NextResponse.json({ success: false, error: "Choose a booking." }, { status: 400 });
  const undo = !!b?.undo;

  try {
    const db = getSupabaseAdmin();
    const { booking, facilities } = await loadBookingAndFacilities(bookingId);
    if (!booking) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    if (booking.status !== "Confirmed") {
      return NextResponse.json({ success: false, error: booking.status === "Pending" ? "Accept this booking before checking the group in." : `This booking is already ${booking.status.toLowerCase()}.` }, { status: 409 });
    }
    if (booking.checkedOutAt) return NextResponse.json({ success: false, error: "This group has already checked out." }, { status: 409 });

    const used = facilitiesForBooking(booking, facilities);

    if (!undo) {
      if (booking.checkedInAt) return NextResponse.json({ success: false, error: "This group is already checked in." }, { status: 409 });
      const now = new Date().toISOString();
      const { data, error } = await db.from("bookings").update({ checked_in_at: now })
        .eq("id", booking.id).eq("status", "Confirmed").is("checked_in_at", null).select().maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ success: false, error: "This booking changed. Refresh and try again." }, { status: 409 });

      // A stay recorded after the fact (completed days later) leaves the
      // facilities as they are now: nobody is actually using them.
      const ids = stayLongOver(booking) ? [] : used.filter((f) => f.status !== "Under Maintenance").map((f) => f.id);
      if (ids.length) {
        await db.from("facilities").update({ status: "In Use", last_used_booking_id: booking.id, last_used_guest_name: booking.name }).in("id", ids);
      }
      await logActivity({
        actor: "Admin", action: "stay.checked_in", bookingId: booking.id, entity: "booking", entityId: booking.id,
        summary: `Checked in ${booking.name} (${booking.id}), ${booking.guests} guest${booking.guests === 1 ? "" : "s"}.`,
      });
      return NextResponse.json({ success: true, booking: rowToBooking(data as BookingRow) });
    }

    if (!booking.checkedInAt) return NextResponse.json({ success: false, error: "This group isn't checked in." }, { status: 409 });
    const { data, error } = await db.from("bookings").update({ checked_in_at: null })
      .eq("id", booking.id).is("checked_out_at", null).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "This booking changed. Refresh and try again." }, { status: 409 });

    const others = await facilitiesInUseByOthers(booking.id, facilities);
    const ids = used.filter((f) => f.status === "In Use" && !others.has(f.id)).map((f) => f.id);
    if (ids.length) await db.from("facilities").update({ status: "Available" }).in("id", ids);
    await logActivity({
      actor: "Admin", action: "stay.check_in_undone", bookingId: booking.id, entity: "booking", entityId: booking.id,
      summary: `Undid the check-in of ${booking.name} (${booking.id}).`,
    });
    return NextResponse.json({ success: true, booking: rowToBooking(data as BookingRow) });
  } catch (err) {
    console.error("[/api/checkin POST]", err);
    return NextResponse.json({ success: false, error: "Could not update the check-in." }, { status: 500 });
  }
}
