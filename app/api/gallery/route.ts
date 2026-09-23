// ── GET  /api/gallery  → ordered image urls   (public)
// ── PUT  /api/gallery  → replace the whole list (admin only)
//
// PUT rather than per-row CRUD: the admin Gallery tab edits the list as a
// whole (add, remove, reorder), and the UI type is a plain string[]. Sending
// the finished list keeps sort_order consistent instead of trying to patch
// positions one row at a time.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowsToGalleryUrls } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import type { GalleryRow } from "@/types/database";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 200;

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("gallery").select("*");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, gallery: rowsToGalleryUrls(data as GalleryRow[]) });
  } catch (err) {
    console.error("[/api/gallery GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the gallery." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const urls: unknown = body?.gallery;
    if (!Array.isArray(urls)) {
      return NextResponse.json({ success: false, error: "gallery must be an array of urls." }, { status: 400 });
    }
    if (urls.length > MAX_IMAGES) {
      return NextResponse.json({ success: false, error: `At most ${MAX_IMAGES} images.` }, { status: 400 });
    }

    const rows = urls
      .map((u) => String(u).trim())
      .filter(Boolean)
      .map((url, i) => ({ url: url.slice(0, 2000), sort_order: i }));

    const db = getSupabaseAdmin();

    // Replace wholesale. Not a transaction — PostgREST has no multi-statement
    // transaction — so on a failed insert the gallery would be left empty.
    // The insert is therefore validated above and the delete only runs once
    // there is something valid to put back.
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Refusing to empty the gallery." }, { status: 400 });
    }

    const { error: delErr } = await db.from("gallery").delete().gte("id", 0);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await db.from("gallery").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({ success: true, gallery: rows.map((r) => r.url) });
  } catch (err) {
    console.error("[/api/gallery PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the gallery." }, { status: 500 });
  }
}
