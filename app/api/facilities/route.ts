// ── GET    /api/facilities      → list        (admin only)
// ── PATCH  /api/facilities?id=  → update      (admin only)
//
// Needs migration 20260923090000.
//
// Admin-only throughout, and the table has no anon RLS policy: the caretaker
// checklist, the notes and who last used a room are staff information, not
// something a guest should be able to read.
//
// No POST/DELETE: facilities mirror the physical resort, so they are seeded
// once and then maintained. Adding one is rare enough to be a migration or a
// dashboard insert rather than a public endpoint.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToFacility } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { sanitizeNotes } from "@/lib/validators";
import type { FacilityRow } from "@/types/database";
import type { FacilityStatus } from "@/types/facility";

export const dynamic = "force-dynamic";

const STATUSES: FacilityStatus[] = ["Available", "In Use", "Needs Cleaning", "Under Maintenance"];

/** An array becomes the stored checklist; anything else (including null)
 *  clears it, which makes FacilitiesTab fall back to the category default
 *  rather than showing an empty list. */
const checklist = (v: unknown): string[] | null =>
  Array.isArray(v)
    ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 30)
    : null;

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { data, error } = await getSupabaseAdmin().from("facilities").select("*").order("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, facilities: (data as FacilityRow[]).map(rowToFacility) });
  } catch (err) {
    console.error("[/api/facilities GET]", err);
    return NextResponse.json({ success: false, error: "Could not load facilities." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric facility id is required." }, { status: 400 });

  try {
    const b = await req.json().catch(() => ({}));
    const patch: Partial<FacilityRow> = {};

    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return NextResponse.json({ success: false, error: "Unknown facility status." }, { status: 400 });
      patch.status = b.status;
    }
    if (b.notes !== undefined) patch.notes = sanitizeNotes(String(b.notes));
    if (b.lastCheckedAt !== undefined) patch.last_checked_at = b.lastCheckedAt ? String(b.lastCheckedAt) : null;
    if (b.lastUsedBookingId !== undefined) patch.last_used_booking_id = b.lastUsedBookingId ? String(b.lastUsedBookingId) : null;
    if (b.lastUsedGuestName !== undefined) patch.last_used_guest_name = b.lastUsedGuestName ? String(b.lastUsedGuestName).slice(0, 120) : null;
    if (b.beforeUseChecklist !== undefined) patch.before_use_checklist = checklist(b.beforeUseChecklist);
    if (b.afterUseChecklist !== undefined) patch.after_use_checklist = checklist(b.afterUseChecklist);

    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().from("facilities").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
    return NextResponse.json({ success: true, facility: rowToFacility(data as FacilityRow) });
  } catch (err) {
    console.error("[/api/facilities PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that facility." }, { status: 500 });
  }
}
