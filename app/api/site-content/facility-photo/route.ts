// ── GET    /api/site-content/facility-photo?id=N        → the photo itself        (public)
// ── GET    /api/site-content/facility-photo?id=N&meta=1 → { exists, updatedAt }   (public)
// ── PUT    /api/site-content/facility-photo  { id, photo } → save it             (facilities.manage)
// ── DELETE /api/site-content/facility-photo?id=N         → back to the stock one (facilities.manage)
//
// The photo a Resort Facility shows when a guest opens it on Home (see
// lib/facilityPhotos.ts). One site_content row per facility, so the page
// downloads only the photo that is opened. Needs the site_content table
// (migration 20261028130000_site_content); without it the GET answers "no
// photo" and Home shows the stock one.

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { actingStaff } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";
import { cleanImageRef } from "@/lib/image";
import { facilityPhotoKey, parseImageDataUrl } from "@/lib/facilityPhotos";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const NOT_READY = "Facility photos switch on once the database update (20261028130000_site_content.sql) is applied.";
const missingTable = (msg: string | undefined) => /site_content/.test(msg ?? "");
const idOf = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function facilityName(id: number): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from("facilities").select("name").eq("id", id).maybeSingle();
  return data ? String((data as { name: string }).name) : null;
}

export async function GET(req: NextRequest) {
  const id = idOf(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ success: false, error: "Which facility?" }, { status: 400 });
  const meta = req.nextUrl.searchParams.get("meta") === "1";
  try {
    const { data, error } = await getSupabaseAdmin().from("site_content").select("data, updated_at").eq("key", facilityPhotoKey(id)).maybeSingle();
    if (error && !missingTable(error.message)) throw new Error(error.message);
    const row = data as { data: { src?: unknown }; updated_at: string } | null;
    const src = typeof row?.data?.src === "string" ? row.data.src : null;
    if (meta) return NextResponse.json({ success: true, exists: !!src, updatedAt: row?.updated_at ?? null, ready: !error });
    if (!src) return NextResponse.json({ success: false, error: "No photo." }, { status: 404 });

    // A link: send the browser there. A data URL: serve the bytes, so
    // the page holds an ordinary image URL rather than a megabyte string.
    if (!src.startsWith("data:")) {
      return /^https:\/\//i.test(src) ? NextResponse.redirect(src) : NextResponse.json({ success: false, error: "No photo." }, { status: 404 });
    }
    const img = parseImageDataUrl(src);
    if (!img) return NextResponse.json({ success: false, error: "No photo." }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(img.base64, "base64")), {
      headers: {
        "Content-Type": img.type,
        // ?v= changes with every save, so a versioned URL never goes stale.
        "Cache-Control": req.nextUrl.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/site-content/facility-photo GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the photo." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "facilities.manage");
  if (denied) return denied;
  const body = await readJson(req).catch(() => null);
  const id = idOf(body?.id);
  if (!id) return NextResponse.json({ success: false, error: "Which facility?" }, { status: 400 });
  const photo = cleanImageRef(body?.photo, "photo");
  if (!photo.ok) return NextResponse.json({ success: false, error: photo.error }, { status: 400 });
  if (!photo.value) return NextResponse.json({ success: false, error: "Choose a photo." }, { status: 400 });
  if (!photo.value.startsWith("data:") && !/^https:\/\//i.test(photo.value)) {
    return NextResponse.json({ success: false, error: "Upload a photo, or use a link that starts with https://." }, { status: 400 });
  }
  try {
    const name = await facilityName(id);
    if (!name) return NextResponse.json({ success: false, error: "That facility no longer exists." }, { status: 404 });
    const who = actingStaff();
    const { error } = await getSupabaseAdmin().from("site_content").upsert(
      { key: facilityPhotoKey(id), data: { src: photo.value }, updated_at: new Date().toISOString(), updated_by_name: who?.name ?? null },
      { onConflict: "key" },
    );
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
      throw new Error(error.message);
    }
    revalidatePath("/");
    await logActivity({
      actor: "Admin", action: "site.facility_photo", entity: "facility", entityId: String(id),
      summary: `Changed the website photo of ${name}.`,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/site-content/facility-photo PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the photo." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "facilities.manage");
  if (denied) return denied;
  const id = idOf(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ success: false, error: "Which facility?" }, { status: 400 });
  try {
    const { error } = await getSupabaseAdmin().from("site_content").delete().eq("key", facilityPhotoKey(id));
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
      throw new Error(error.message);
    }
    revalidatePath("/");
    const name = await facilityName(id);
    await logActivity({
      actor: "Admin", action: "site.facility_photo", entity: "facility", entityId: String(id),
      summary: `Removed the website photo of ${name ?? `facility ${id}`}; the website shows a stock photo instead.`,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/site-content/facility-photo DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove the photo." }, { status: 500 });
  }
}
