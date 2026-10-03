// ── GET    /api/rooms      → list rooms      (public — the Rooms page needs it)
// ── POST   /api/rooms      → add a room      (admin only)
// ── PATCH  /api/rooms?id=  → update a room   (admin only)
// ── DELETE /api/rooms?id=  → delete a room   (admin only)

import { NextResponse, type NextRequest } from "next/server";
import { logActivity, changes, listFields, loadRow } from "@/lib/activity.server";
import { fmt } from "@/lib/utils";
import { getSupabaseAdmin, rowToRoom, roomToRow } from "@/lib/supabase";
import { GALLERY_MAX } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth";
import { sanitizeLabel, sanitizeNotes } from "@/lib/validators";
import type { RoomRow } from "@/types/database";
import type { Room } from "@/types/room";

/** Strings only, no blanks, no duplicates, cover first, capped at
 *  GALLERY_MAX. The admin UI enforces the same cap, but a request does not
 *  have to come from the admin UI. */
function cleanGallery(input: unknown, cover: string): string[] {
  const list = Array.isArray(input) ? input : [];
  const cleaned = list
    .map((x) => String(x ?? "").slice(0, 2000))
    .filter((x) => x.length > 0);
  if (cover && !cleaned.includes(cover)) cleaned.unshift(cover);
  return Array.from(new Set(cleaned)).slice(0, GALLERY_MAX);
}

/** True when PostgREST is saying the `gallery` column is not there yet,
 *  i.e. supabase/migrations/20260928120000_room_gallery.sql has not been
 *  applied to this database.
 *
 *  A room is more important than its extra photos: rather than failing the
 *  whole save, the write is retried without the column, so adding and editing
 *  rooms keeps working on a database that is still on the old schema and
 *  starts keeping galleries the moment the migration lands. */
function galleryColumnMissing(msg: string): boolean {
  return /gallery/i.test(msg) && /(column|schema cache)/i.test(msg);
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("rooms").select("*").order("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, rooms: (data as RoomRow[]).map(rowToRoom) });
  } catch (err) {
    console.error("[/api/rooms GET]", err);
    return NextResponse.json({ success: false, error: "Could not load rooms." }, { status: 500 });
  }
}

/** Shared field check. Returns an error string, or null when the shape is fine. */
function problemWith(b: Record<string, unknown>, partial: boolean): string | null {
  if ((!partial || b.name !== undefined) && !sanitizeLabel(String(b.name ?? ""))) return "A room name is required.";
  for (const k of ["capacity", "price"] as const) {
    if (!partial || b[k] !== undefined) {
      const v = Number(b[k]);
      if (!Number.isFinite(v) || v < 0) return `${k} must be a non-negative number.`;
    }
  }
  if ((!partial || b.capacity !== undefined) && Number(b.capacity) < 1) return "Capacity must be at least 1.";
  return null;
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const b = await req.json().catch(() => ({}));
    const problem = problemWith(b, false);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const row = roomToRow({
      name: sanitizeLabel(String(b.name)),
      beds: String(b.beds ?? "").slice(0, 60),
      capacity: Math.round(Number(b.capacity)),
      price: Number(b.price),
      desc: sanitizeNotes(String(b.desc ?? "")),
      img: String(b.img ?? "").slice(0, 2000),
      gallery: cleanGallery(b.gallery, String(b.img ?? "")),
    } as Room);

    let { data, error } = await getSupabaseAdmin().from("rooms").insert(row).select().single();
    if (error && galleryColumnMissing(error.message)) {
      console.warn("[/api/rooms POST] rooms.gallery is missing - apply 20260928120000_room_gallery.sql. Saving the cover only.");
      const { gallery: _drop, ...bare } = row;
      ({ data, error } = await getSupabaseAdmin().from("rooms").insert(bare).select().single());
    }
    if (error) throw new Error(error.message);
    const added = data as RoomRow;
    await logActivity({ actor: "Admin", action: "room.added", entity: "room", entityId: added.id, summary: `Added the room "${added.name}" at ${fmt(Number(added.price))} per slot.` });
    return NextResponse.json({ success: true, room: rowToRoom(data as RoomRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/rooms POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that room." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric room id is required." }, { status: 400 });

  try {
    const b = await req.json().catch(() => ({}));
    const problem = problemWith(b, true);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const patch: Partial<RoomRow> = {};
    if (b.name !== undefined) patch.name = sanitizeLabel(String(b.name));
    if (b.beds !== undefined) patch.beds = String(b.beds).slice(0, 60);
    if (b.capacity !== undefined) patch.capacity = Math.round(Number(b.capacity));
    if (b.price !== undefined) patch.price = Number(b.price);
    // The UI calls it `desc`; the column is `description` (desc is reserved).
    if (b.desc !== undefined) patch.description = sanitizeNotes(String(b.desc));
    if (b.img !== undefined) patch.img = String(b.img).slice(0, 2000);
    if (b.gallery !== undefined) {
      patch.gallery = cleanGallery(b.gallery, String(b.img ?? ""));
      // The cover must stay the first photo, or the card and the gallery
      // would disagree about what this room looks like.
      if (patch.gallery.length && b.img === undefined) patch.img = patch.gallery[0];
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });

    const prev = await loadRow("rooms", id);
    let { data, error } = await getSupabaseAdmin().from("rooms").update(patch).eq("id", id).select().maybeSingle();
    if (error && galleryColumnMissing(error.message)) {
      console.warn("[/api/rooms PATCH] rooms.gallery is missing - apply 20260928120000_room_gallery.sql. Saving the cover only.");
      const { gallery: _drop, ...bare } = patch;
      ({ data, error } = await getSupabaseAdmin().from("rooms").update(bare).eq("id", id).select().maybeSingle());
    }
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Room not found." }, { status: 404 });
    const diff = changes(prev, data as Record<string, unknown>);
    if (Object.keys(diff).length) {
      await logActivity({ actor: "Admin", action: "room.updated", entity: "room", entityId: id, summary: `Updated the room "${(data as RoomRow).name}": ${listFields(diff)}.`, details: { changes: diff } });
    }
    return NextResponse.json({ success: true, room: rowToRoom(data as RoomRow) });
  } catch (err) {
    console.error("[/api/rooms PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that room." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric room id is required." }, { status: 400 });
  try {
    const { data, error } = await getSupabaseAdmin().from("rooms").delete().eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (data) await logActivity({ actor: "Admin", action: "room.removed", entity: "room", entityId: id, summary: `Removed the room "${(data as RoomRow).name}".` });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/rooms DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not delete that room." }, { status: 500 });
  }
}
