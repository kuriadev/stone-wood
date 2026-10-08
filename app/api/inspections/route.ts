// ── POST /api/inspections → save a PREPARATION check          (admin only)
//
// Done before a group arrives: the owner ticks the before-use checklist of
// every facility the reservation will use. It opens the day before the
// visit and closes at check-in (prepBlocked in lib/operations.ts): ticked
// any earlier, other groups would use the facilities in between. A booking
// has ONE preparation:
// saving again updates it (with the new time) rather than adding another
// record. Every item must be ticked, or the notes must say why not.
// Saving puts any facility
// still flagged "Needs Cleaning" back to "Available" (a facility "Under
// Maintenance" is left alone — preparing around it does not fix it).
//
// The CHECK-OUT inspection is a separate route (/api/checkout) because it
// also records damage, collects payment and completes the booking.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToInspection, rowToBooking, rowToFacility } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { cleanText } from "@/lib/money";
import { cleanItems } from "@/lib/inspection.server";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { prepBlocked } from "@/lib/operations";
import { manilaDate } from "@/lib/finance";
import type { BookingRow, FacilityRow, InspectionRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bookingId = cleanText(b?.bookingId, 40);
  if (!bookingId) return NextResponse.json({ success: false, error: "Choose a booking." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const [bk, fs] = await Promise.all([
      db.from("bookings").select("*").eq("id", bookingId).maybeSingle(),
      db.from("facilities").select("*"),
    ]);
    if (bk.error) throw new Error(bk.error.message);
    if (fs.error) throw new Error(fs.error.message);
    if (!bk.data) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    const booking = rowToBooking(bk.data as BookingRow);
    if (booking.status === "Cancelled" || booking.status === "ResortCancelled" || booking.status === "Completed") {
      return NextResponse.json({ success: false, error: `This booking is already ${booking.status.toLowerCase()}.` }, { status: 409 });
    }
    // Only from the day before the visit until check-in (lib/operations.ts).
    const blocked = prepBlocked(booking, manilaDate());
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 });

    const facilities = (fs.data as FacilityRow[]).map(rowToFacility);
    const used = facilitiesForBooking(booking, facilities);
    const items = cleanItems(b?.items, new Set(used.map((f) => f.id)));
    if (items.length === 0) return NextResponse.json({ success: false, error: "No facilities to prepare for this booking." }, { status: 400 });

    const notes = cleanText(b?.notes, 300);
    const unticked = items.reduce((n, x) => n + x.checklist.filter((c) => !c.done).length, 0);
    if (unticked > 0 && notes.length < 3) {
      return NextResponse.json({ success: false, error: `${unticked} check${unticked === 1 ? " isn't" : "s aren't"} ticked. Tick ${unticked === 1 ? "it" : "them"}, or say in the notes why not.` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const existing = await db.from("facility_inspections").select("id")
      .eq("booking_id", booking.id).eq("stage", "Preparation").maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    const { data, error } = existing.data
      ? await db.from("facility_inspections").update({ items, notes, inspected_at: now })
          .eq("id", (existing.data as { id: number }).id).select().single()
      : await db.from("facility_inspections").insert({ booking_id: booking.id, stage: "Preparation", items, notes })
          .select().single();
    if (error) throw new Error(error.message);

    const readyIds = used.filter((f) => f.status === "Needs Cleaning").map((f) => f.id);
    if (readyIds.length) {
      await db.from("facilities").update({ status: "Available", last_checked_at: now }).in("id", readyIds);
    }
    const otherIds = used.filter((f) => f.status !== "Needs Cleaning").map((f) => f.id);
    if (otherIds.length) await db.from("facilities").update({ last_checked_at: now }).in("id", otherIds);

    await logActivity({
      actor: "Admin", action: "stay.prepared", bookingId: booking.id, entity: "inspection", entityId: (data as InspectionRow).id,
      summary: `${existing.data ? "Updated the preparation" : "Prepared the facilities"} for ${booking.name} (${booking.id})${unticked ? `, ${unticked} item${unticked === 1 ? "" : "s"} not ticked: ${notes}` : ", every item ticked"}.`,
      details: { facilities: items.map((x) => x.facilityName), unticked },
    });
    return NextResponse.json({ success: true, inspection: rowToInspection(data as InspectionRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/inspections POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the preparation check." }, { status: 500 });
  }
}
