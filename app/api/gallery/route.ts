// ── GET  /api/gallery  → ordered photos with their captions   (public)
// ── PUT  /api/gallery  → replace the whole list                 (admin only)
//
// PUT rather than per-row CRUD: the admin Gallery tab edits the list as a
// whole (add, remove, reorder), so sending the finished list keeps
// sort_order consistent instead of patching positions one row at a time.
//
// Each photo carries a title and a line of text (migration
// 20261028120000_gallery_captions). Until that migration has run, photos
// still save, without their words, and `captionsReady: false` tells the
// admin Gallery tab to say so rather than lose the text quietly.

import { NextResponse, type NextRequest } from "next/server";
import { cleanImageList } from "@/lib/image";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowsToGalleryPhotos } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { cleanCaption, GALLERY_TITLE_MAX, GALLERY_TEXT_MAX } from "@/lib/gallery";
import type { GalleryRow } from "@/types/database";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 200;

/** The caption columns are missing: the migration has not run yet. */
const noCaptionColumns = (err: { message?: string } | null | undefined) =>
  !!err && /(column|schema cache)/i.test(err.message ?? "") && /(title|description)/.test(err.message ?? "");

async function captionsReady(): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from("gallery").select("title, description").limit(1);
  return !noCaptionColumns(error);
}

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("gallery").select("*");
    if (error) throw new Error(error.message);
    const photos = rowsToGalleryPhotos(data as GalleryRow[]);
    return NextResponse.json({
      success: true,
      photos,
      // The bare urls too, for anything still reading the old shape.
      gallery: photos.map((p) => p.url),
      captionsReady: await captionsReady(),
    });
  } catch (err) {
    console.error("[/api/gallery GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the gallery." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    // `photos` ({url, title, description}[]) is the current shape; a bare
    // `gallery` url list is still accepted and saves with no captions.
    const raw: unknown = Array.isArray(body?.photos) ? body.photos : body?.gallery;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ success: false, error: "photos must be an array." }, { status: 400 });
    }
    if (raw.length > MAX_IMAGES) {
      return NextResponse.json({ success: false, error: `At most ${MAX_IMAGES} images.` }, { status: 400 });
    }
    const given = raw.map((p) =>
      typeof p === "string"
        ? { url: p, title: "", description: "" }
        : { url: (p as { url?: unknown })?.url, title: (p as { title?: unknown })?.title, description: (p as { description?: unknown })?.description },
    );

    // Checked, not shortened: these are `data:` URLs, and cutting one to
    // 2000 characters stores a corrupt image behind a 200 OK (lib/image.ts).
    const checked = cleanImageList(given.map((p) => p.url), "photo");
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 413 });
    const rows = checked.value.map((url, i) => ({
      url,
      sort_order: i,
      title: cleanCaption(given[i]?.title, GALLERY_TITLE_MAX),
      description: cleanCaption(given[i]?.description, GALLERY_TEXT_MAX),
    }));

    const db = getSupabaseAdmin();

    // Replace wholesale. Not a transaction — PostgREST has no multi-statement
    // transaction — so on a failed insert the gallery would be left empty.
    // The insert is therefore validated above and the delete only runs once
    // there is something valid to put back.
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Refusing to empty the gallery." }, { status: 400 });
    }

    const ready = await captionsReady();
    const toInsert = ready ? rows : rows.map(({ url, sort_order }) => ({ url, sort_order }));

    const { error: delErr } = await db.from("gallery").delete().gte("id", 0);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await db.from("gallery").insert(toInsert);
    if (insErr) throw new Error(insErr.message);
    const captioned = rows.filter((r) => r.title || r.description).length;
    await logActivity({
      actor: "Admin", action: "site.gallery", entity: "gallery",
      summary: `Updated the website gallery (${rows.length} photo${rows.length === 1 ? "" : "s"}${ready && captioned ? `, ${captioned} with text` : ""}).`,
    });

    return NextResponse.json({
      success: true,
      photos: ready ? rows.map(({ url, title, description }) => ({ url, title, description })) : rows.map(({ url }) => ({ url, title: "", description: "" })),
      captionsReady: ready,
    });
  } catch (err) {
    console.error("[/api/gallery PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the gallery." }, { status: 500 });
  }
}
