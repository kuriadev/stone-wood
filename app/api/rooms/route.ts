// ── GET    /api/rooms      → list rooms      (public — the Rooms page needs it)
// ── POST   /api/rooms      → add a room      (admin only)
// ── PATCH  /api/rooms?id=  → update a room   (admin only)
// ── DELETE /api/rooms?id=  → delete a room   (admin only)

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToRoom, roomToRow } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { sanitizeLabel, sanitizeNotes } from "@/lib/validators";
import type { RoomRow } from "@/types/database";
import type { Room } from "@/types/room";

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

    const { data, error } = await getSupabaseAdmin().from("rooms")
      .insert(roomToRow({
        name: sanitizeLabel(String(b.name)),
        beds: String(b.beds ?? "").slice(0, 60),
        capacity: Math.round(Number(b.capacity)),
        price: Number(b.price),
        desc: sanitizeNotes(String(b.desc ?? "")),
        img: String(b.img ?? "").slice(0, 2000),
      } as Room))
      .select().single();

    if (error) throw new Error(error.message);
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

    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().from("rooms").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Room not found." }, { status: 404 });
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
    const { error } = await getSupabaseAdmin().from("rooms").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/rooms DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not delete that room." }, { status: 500 });
  }
}
