// ── GET    /api/staff/photo?id=N      → the photo itself (or ?meta=1 → { photo })  (any staff)
// ── PUT    /api/staff/photo { id, photo } → set it        (that person, or the super admin)
// ── DELETE /api/staff/photo?id=N      → remove it          (that person, or the super admin)
//
// Staff profile photos (lib/staffPhotos.ts). Needs the site_content table
// (migration 20261028130000_site_content).

import { NextResponse, type NextRequest } from "next/server";
import { sessionOf, currentIdentity } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanImageRef } from "@/lib/image";
import { parseImageDataUrl } from "@/lib/facilityPhotos";
import { staffPhotoKey, staffPhotoUrl } from "@/lib/staffPhotos";
import { logActivity } from "@/lib/activity.server";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const NOT_READY = "Profile photos switch on once the database update (20261028130000_site_content.sql) is applied.";
const missingTable = (msg: string | undefined) => /site_content/.test(msg ?? "");
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Who is asking, and may they change this person's photo? */
async function who(req: NextRequest, id: string) {
  const session = sessionOf(req);
  if (!session) return { error: NextResponse.json({ success: false, error: "Not authorised." }, { status: 401 }) };
  const me = await currentIdentity(session);
  if (!me) return { error: NextResponse.json({ success: false, error: "Your account is no longer active." }, { status: 401 }) };
  const self = me.id === id;
  return { me, self, mayEdit: self || me.role === "Owner" };
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isId(id)) return NextResponse.json({ success: false, error: "Which person?" }, { status: 400 });
  const w = await who(req, id);
  if (w.error) return w.error;
  const { data, error } = await getSupabaseAdmin().from("site_content").select("data, updated_at").eq("key", staffPhotoKey(id)).maybeSingle();
  if (error && !missingTable(error.message)) return NextResponse.json({ success: false, error: "Could not load the photo." }, { status: 500 });
  const row = data as { data: { src?: unknown }; updated_at: string } | null;
  const src = typeof row?.data?.src === "string" ? row.data.src : null;
  if (req.nextUrl.searchParams.get("meta") === "1") {
    return NextResponse.json({ success: true, photo: src && row ? staffPhotoUrl(id, row.updated_at) : null, ready: !error });
  }
  const img = src ? parseImageDataUrl(src) : null;
  if (!img) return NextResponse.json({ success: false, error: "No photo." }, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(img.base64, "base64")), {
    headers: { "Content-Type": img.type, "Cache-Control": req.nextUrl.searchParams.has("v") ? "private, max-age=31536000, immutable" : "no-store" },
  });
}

export async function PUT(req: NextRequest) {
  const body = (await readJson(req).catch(() => null)) as { id?: string; photo?: unknown } | null;
  const id = String(body?.id ?? "");
  if (!isId(id)) return NextResponse.json({ success: false, error: "Which person?" }, { status: 400 });
  const w = await who(req, id);
  if (w.error) return w.error;
  if (!w.mayEdit) return NextResponse.json({ success: false, error: "You can only change your own photo." }, { status: 403 });
  const photo = cleanImageRef(body?.photo, "photo");
  if (!photo.ok) return NextResponse.json({ success: false, error: photo.error }, { status: 400 });
  if (!photo.value.startsWith("data:")) return NextResponse.json({ success: false, error: "Upload a photo from your device." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("site_content").upsert(
    { key: staffPhotoKey(id), data: { src: photo.value }, updated_at: new Date().toISOString(), updated_by_name: w.me!.name },
    { onConflict: "key" },
  );
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
    return NextResponse.json({ success: false, error: "Could not save the photo." }, { status: 500 });
  }
  await logActivity({
    actor: "Admin", action: "staff.photo", entity: "staff", entityId: id,
    summary: w.self ? `${w.me!.name} changed their profile photo.` : `${w.me!.name} changed a staff member's profile photo.`,
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isId(id)) return NextResponse.json({ success: false, error: "Which person?" }, { status: 400 });
  const w = await who(req, id);
  if (w.error) return w.error;
  if (!w.mayEdit) return NextResponse.json({ success: false, error: "You can only change your own photo." }, { status: 403 });
  const { error } = await getSupabaseAdmin().from("site_content").delete().eq("key", staffPhotoKey(id));
  if (error && !missingTable(error.message)) return NextResponse.json({ success: false, error: "Could not remove the photo." }, { status: 500 });
  return NextResponse.json({ success: true });
}
