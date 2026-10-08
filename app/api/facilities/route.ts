// ── GET    /api/facilities      → list              (admin only)
// ── POST   /api/facilities      → add an amenity    (admin only)
// ── PATCH  /api/facilities?id=  → update / retire   (admin only)
// ── DELETE /api/facilities?id=  → remove an amenity (admin only)
//
// Needs migrations 20260923090000 and 20260929120000.
//
// Admin-only throughout, and the table has no anon RLS policy: the caretaker
// checklist, the notes and who last used a room are staff information, not
// something a guest should be able to read. The public amenities list reads
// its few safe columns through /api/amenities instead.
//
// The owner adds amenities here; rooms come from the Rooms module. An
// amenity can be RETIRED (active = false: hidden, and restorable any time)
// or REMOVED for good. Removing is safe for the records: inspections and
// damage records store the amenity's name, not a link to this row, so they
// read the same afterwards, and the audit log keeps a copy of what was
// removed. The pool and the events venue can be neither renamed, retired
// nor removed — booking availability looks them up by name.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity, changes, listFields, loadRow } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToFacility } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { sanitizeNotes } from "@/lib/validators";
import type { FacilityRow } from "@/types/database";
import type { AmenityArea, FacilityStatus } from "@/types/facility";
import { AMENITY_ICONS, CORE_AMENITIES } from "@/lib/facilityUsage";

export const dynamic = "force-dynamic";

const STATUSES: FacilityStatus[] = ["Available", "In Use", "Needs Cleaning", "Under Maintenance"];
const AREAS: AmenityArea[] = ["Pool", "Venue", "Common"];
const isCore = (name: string) => (CORE_AMENITIES as readonly string[]).includes(name);
const cleanName = (v: unknown) => sanitizeNotes(String(v ?? "")).replace(/\s+/g, " ").trim().slice(0, 60);

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

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const b = await req.json().catch(() => ({}));
    const name = cleanName(b.name);
    if (name.length < 2) return NextResponse.json({ success: false, error: "Give the amenity a name." }, { status: 400 });
    if (!AREAS.includes(b.area)) return NextResponse.json({ success: false, error: "Choose which bookings use this amenity." }, { status: 400 });
    const before = checklist(b.beforeUseChecklist);
    const after = checklist(b.afterUseChecklist);
    if (!before?.length || !after?.length) {
      return NextResponse.json({ success: false, error: "Write at least one before-use and one after-use check, so it can be prepared and inspected." }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const dup = await db.from("facilities").select("id").ilike("name", name).maybeSingle();
    if (dup.error) throw new Error(dup.error.message);
    if (dup.data) return NextResponse.json({ success: false, error: `There is already a facility called "${name}".` }, { status: 409 });

    const { data, error } = await db.from("facilities").insert({
      category: "Amenity",
      name,
      icon: (AMENITY_ICONS as readonly string[]).includes(b.icon) ? b.icon : "toolbox",
      area: b.area,
      description: sanitizeNotes(String(b.description ?? "")).slice(0, 200),
      show_on_site: b.showOnSite !== false,
      active: true,
      status: "Available",
      notes: "",
      before_use_checklist: before,
      after_use_checklist: after,
    }).select().single();
    if (error) throw new Error(error.message);
    await logActivity({ actor: "Admin", action: "facility.added", entity: "facility", entityId: (data as FacilityRow).id, summary: `Added the amenity "${name}"${b.showOnSite !== false ? ", shown on the website" : ""}.` });
    return NextResponse.json({ success: true, facility: rowToFacility(data as FacilityRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/facilities POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that amenity." }, { status: 500 });
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

    // Amenity details. Rooms keep their name and area from the Rooms module.
    const wantsDetails = ["name", "icon", "area", "description", "showOnSite", "active"].some((k) => b[k] !== undefined);
    if (wantsDetails) {
      const cur = await getSupabaseAdmin().from("facilities").select("*").eq("id", id).maybeSingle();
      if (cur.error) throw new Error(cur.error.message);
      if (!cur.data) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
      const row = cur.data as FacilityRow;
      const amenity = row.category === "Amenity";

      if (b.name !== undefined && cleanName(b.name) !== row.name) {
        if (!amenity) return NextResponse.json({ success: false, error: "Rename a room from the Rooms module." }, { status: 400 });
        if (isCore(row.name)) return NextResponse.json({ success: false, error: `${row.name} can't be renamed: bookings check its availability by name.` }, { status: 400 });
        const name = cleanName(b.name);
        if (name.length < 2) return NextResponse.json({ success: false, error: "Give the amenity a name." }, { status: 400 });
        const dup = await getSupabaseAdmin().from("facilities").select("id").ilike("name", name).neq("id", id).maybeSingle();
        if (dup.data) return NextResponse.json({ success: false, error: `There is already a facility called "${name}".` }, { status: 409 });
        patch.name = name;
      }
      if (b.icon !== undefined && amenity) {
        if (!(AMENITY_ICONS as readonly string[]).includes(b.icon)) return NextResponse.json({ success: false, error: "Unknown icon." }, { status: 400 });
        patch.icon = b.icon;
      }
      if (b.area !== undefined && amenity && b.area !== row.area) {
        if (!AREAS.includes(b.area)) return NextResponse.json({ success: false, error: "Unknown area." }, { status: 400 });
        if (isCore(row.name)) return NextResponse.json({ success: false, error: `${row.name}'s area is fixed.` }, { status: 400 });
        patch.area = b.area;
      }
      if (b.description !== undefined) patch.description = sanitizeNotes(String(b.description)).slice(0, 200);
      if (b.showOnSite !== undefined) patch.show_on_site = !!b.showOnSite;
      if (b.active !== undefined && !!b.active !== row.active) {
        if (!amenity) return NextResponse.json({ success: false, error: "Remove a room from the Rooms module." }, { status: 400 });
        if (!b.active && isCore(row.name)) return NextResponse.json({ success: false, error: `${row.name} can't be retired. Set it Under Maintenance to stop bookings instead.` }, { status: 400 });
        patch.active = !!b.active;
      }
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });

    const prev = await loadRow("facilities", id);
    const { data, error } = await getSupabaseAdmin().from("facilities").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
    // The day-of routes keep these up to date on their own; logging them
    // here too would bury the owner's own changes.
    const diff = changes(prev, data as Record<string, unknown>, ["last_checked_at", "last_used_booking_id", "last_used_guest_name", "updated_at"]);
    if (Object.keys(diff).length) {
      const f = data as FacilityRow;
      const summary = Object.keys(diff).length === 1 && diff.status
        ? `Set ${f.name} to ${f.status}.`
        : diff.active
          ? `${f.active ? "Restored" : "Retired"} the amenity "${f.name}".`
          : `Updated ${f.name}: ${listFields(diff)}.`;
      await logActivity({ actor: "Admin", action: "facility.updated", entity: "facility", entityId: id, summary, details: { changes: diff } });
    }
    return NextResponse.json({ success: true, facility: rowToFacility(data as FacilityRow) });
  } catch (err) {
    console.error("[/api/facilities PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that facility." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric facility id is required." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const cur = await db.from("facilities").select("*").eq("id", id).maybeSingle();
    if (cur.error) throw new Error(cur.error.message);
    if (!cur.data) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
    const row = cur.data as FacilityRow;

    if (row.category !== "Amenity") return NextResponse.json({ success: false, error: "Remove a room from the Rooms module." }, { status: 400 });
    if (isCore(row.name)) return NextResponse.json({ success: false, error: `${row.name} can't be removed: bookings check its availability by name. Set it Under Maintenance to stop bookings instead.` }, { status: 400 });
    // A group has it right now: its check-out inspection still needs it.
    if (row.status === "In Use") return NextResponse.json({ success: false, error: `A group is using ${row.name} right now. Remove it after they check out.` }, { status: 409 });

    const { data, error } = await db.from("facilities").delete().eq("id", id).neq("status", "In Use").select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That amenity just changed. Refresh and try again." }, { status: 409 });

    await logActivity({
      actor: "Admin", action: "facility.removed", entity: "facility", entityId: id,
      summary: `Removed the amenity "${row.name}" for good. Past inspections and damage records still name it.`,
      // What it was, since the row itself is gone.
      details: { removed: {
        name: row.name, area: row.area, description: row.description, show_on_site: row.show_on_site, active: row.active,
        before_use_checklist: row.before_use_checklist, after_use_checklist: row.after_use_checklist,
      } },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/facilities DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove that amenity." }, { status: 500 });
  }
}
