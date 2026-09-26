// ── POST /api/inspections → save a PREPARATION check          (admin only)
//
// Done before a group arrives: the owner ticks the before-use checklist of
// every facility the reservation will use. Saving it records who was
// prepared for, when, and which items were ticked, and puts any facility
// still flagged "Needs Cleaning" back to "Available" (a facility "Under
// Maintenance" is left alone — preparing around it does not fix it).
//
// The CHECK-OUT inspection is a separate route (/api/checkout) because it
// also records damage, collects payment and completes the booking.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToInspection, rowToBooking, rowToFacility } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { cleanText } from "@/lib/money";
import { cleanItems } from "@/lib/inspection.server";
import { facilitiesForBooking } from "@/lib/facilityUsage";
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
    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return NextResponse.json({ success: false, error: `This booking is already ${booking.status.toLowerCase()}.` }, { status: 409 });
    }

    const facilities = (fs.data as FacilityRow[]).map(rowToFacility);
    const used = facilitiesForBooking(booking, facilities);
    const items = cleanItems(b?.items, new Set(used.map((f) => f.id)));
    if (items.length === 0) return NextResponse.json({ success: false, error: "No facilities to prepare for this booking." }, { status: 400 });

    const { data, error } = await db.from("facility_inspections").insert({
      booking_id: booking.id, stage: "Preparation", items, notes: cleanText(b?.notes, 300),
    }).select().single();
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    const readyIds = used.filter((f) => f.status === "Needs Cleaning").map((f) => f.id);
    if (readyIds.length) {
      await db.from("facilities").update({ status: "Available", last_checked_at: now }).in("id", readyIds);
    }
    const otherIds = used.filter((f) => f.status !== "Needs Cleaning").map((f) => f.id);
    if (otherIds.length) await db.from("facilities").update({ last_checked_at: now }).in("id", otherIds);

    return NextResponse.json({ success: true, inspection: rowToInspection(data as InspectionRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/inspections POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the preparation check." }, { status: 500 });
  }
}
