// ── POST /api/inspections → save a PREPARATION check          (admin only)
//
// Done before a group arrives: the owner ticks the before-use checklist of
// every facility the reservation will use. It opens the day before the
// visit and closes at check-in (prepBlocked in lib/operations.ts): ticked
// any earlier, other groups would use the facilities in between. A booking
// has ONE preparation:
// saving again updates it (with the new time) rather than adding another
// record. EVERY item on every facility's before-use list must be ticked:
// no skipping, and no saving with a note instead. The list is rebuilt here
// from each facility's own checklist, so a shortened list from the screen
// can't leave items out.
// Saving puts any facility
// still flagged "Needs Cleaning" back to "Available" (a facility "Under
// Maintenance" is left alone — preparing around it does not fix it).
//
// The CHECK-OUT inspection is a separate route (/api/checkout) because it
// also records damage, collects payment and completes the booking.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToInspection, rowToBooking, rowToFacility } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { actingStaff } from "@/lib/staff.server";
import { cleanText } from "@/lib/money";
import { cleanItems, remainingToPrepare } from "@/lib/inspection.server";
import { facilitiesForBooking, checklistFor } from "@/lib/facilityUsage";
import { prepBlocked } from "@/lib/operations";
import { manilaDate } from "@/lib/finance";
import { getBookingSlot, bookingEndDate } from "@/lib/utils";
import type { BookingRow, FacilityRow, InspectionRow } from "@/types/database";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "facilities.inspect");
  if (denied) return denied;

  const b = (await readJson(req).catch(() => null)) as Record<string, unknown> | null;
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
    const all = facilitiesForBooking(booking, facilities);
    if (all.length === 0) return NextResponse.json({ success: false, error: "No facilities to prepare for this booking." }, { status: 400 });
    // What's left for this group: facilities another group on the same stay
    // already had prepared count as done. A saved preparation being updated
    // covers everything it had.
    const own = await db.from("facility_inspections").select("id").eq("booking_id", booking.id).eq("stage", "Preparation").maybeSingle();
    if (own.error) throw new Error(own.error.message);
    const used = own.data ? all : await remainingToPrepare(booking, facilities);
    if (used.length === 0) return NextResponse.json({ success: false, error: "Everything this group uses was already prepared for another group on the same stay. Check them in." }, { status: 409 });
    const sent = cleanItems(b?.items, new Set(used.map((f) => f.id)));
    // Every facility the booking uses, with its full before-use list; an
    // item counts as done only if the screen sent it ticked.
    const items = used.map((f) => {
      const got = sent.find((x) => x.facilityId === f.id);
      return {
        facilityId: f.id, facilityName: f.name, condition: "OK" as const,
        checklist: checklistFor(f, "before").map((label) => ({ label, done: !!got?.checklist.find((c) => c.label === label)?.done })),
      };
    });

    const notes = cleanText(b?.notes, 300);
    const unticked = items.reduce((n, x) => n + x.checklist.filter((c) => !c.done).length, 0);
    if (unticked > 0) {
      return NextResponse.json({ success: false, error: `${unticked} check${unticked === 1 ? " isn't" : "s aren't"} ticked yet. Every item has to be checked and ticked before the facilities count as prepared.` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const existing = await db.from("facility_inspections").select("id")
      .eq("booking_id", booking.id).eq("stage", "Preparation").maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    // Who prepared it, on the record itself (after the stock migration).
    const by = actingStaff()?.name ?? null;
    const save = (extra: Record<string, unknown>) => existing.data
      ? db.from("facility_inspections").update({ items, notes, inspected_at: now, ...extra })
          .eq("id", (existing.data as { id: number }).id).select().single()
      : db.from("facility_inspections").insert({ booking_id: booking.id, stage: "Preparation", items, notes, ...extra })
          .select().single();
    let { data, error } = await save({ inspected_by_name: by });
    if (error && /inspected_by_name/.test(error.message)) ({ data, error } = await save({}));
    if (error) throw new Error(error.message);

    const readyIds = used.filter((f) => f.status === "Needs Cleaning").map((f) => f.id);
    if (readyIds.length) {
      await db.from("facilities").update({ status: "Available", last_checked_at: now }).in("id", readyIds);
    }
    const otherIds = used.filter((f) => f.status !== "Needs Cleaning").map((f) => f.id);
    if (otherIds.length) await db.from("facilities").update({ last_checked_at: now }).in("id", otherIds);

    /* Groups on the same stay share the same facilities: when several
       groups book the same date and stay (two shared Day Stays, or two
       Night Stays), the pool and the rest are prepared once, for all of
       them. Every other such group that isn't prepared or checked in yet,
       and whose facilities were all just prepared, gets the same
       preparation, so it goes straight to Check in. A group that also has
       something the others don't (a room, say) still needs its own. */
    const together: string[] = [];
    const preparedIds = new Set(items.map((x) => x.facilityId));
    const slot = getBookingSlot(booking);
    const sibs = await db.from("bookings").select("*").eq("date", booking.date).neq("id", booking.id)
      .in("status", ["Confirmed", "Pending"]).is("checked_in_at", null);
    if (sibs.error) throw new Error(sibs.error.message);
    const candidates = (sibs.data as BookingRow[]).map(rowToBooking)
      .filter((x) => getBookingSlot(x) === slot && bookingEndDate(x) === bookingEndDate(booking));
    if (candidates.length) {
      const done = await db.from("facility_inspections").select("booking_id").eq("stage", "Preparation").in("booking_id", candidates.map((x) => x.id));
      if (done.error) throw new Error(done.error.message);
      const already = new Set(((done.data ?? []) as { booking_id: string }[]).map((r) => r.booking_id));
      for (const sib of candidates) {
        if (already.has(sib.id)) continue;
        const theirs = facilitiesForBooking(sib, facilities);
        if (theirs.length === 0 || !theirs.every((f) => preparedIds.has(f.id))) continue;
        const sibItems = items.filter((x) => theirs.some((f) => f.id === x.facilityId));
        const row = { booking_id: sib.id, stage: "Preparation", items: sibItems, notes: `Prepared together with ${booking.id} (same stay).` };
        let ins = await db.from("facility_inspections").insert({ ...row, inspected_by_name: by });
        if (ins.error && /inspected_by_name/.test(ins.error.message)) ins = await db.from("facility_inspections").insert(row);
        if (ins.error) throw new Error(ins.error.message);
        together.push(sib.id);
      }
    }

    await logActivity({
      actor: "Admin", action: "stay.prepared", bookingId: booking.id, entity: "inspection", entityId: (data as InspectionRow).id,
      summary: `${existing.data ? "Updated the preparation" : "Prepared the facilities"} for ${booking.name} (${booking.id}), every item ticked.${together.length ? ` Also counts for ${together.join(", ")} (same stay, same facilities).` : ""}`,
      details: { facilities: items.map((x) => x.facilityName), unticked },
    });
    return NextResponse.json({ success: true, inspection: rowToInspection(data as InspectionRow), alsoPrepared: together }, { status: 201 });
  } catch (err) {
    console.error("[/api/inspections POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the preparation check." }, { status: 500 });
  }
}
