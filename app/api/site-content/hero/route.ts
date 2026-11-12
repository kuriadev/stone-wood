// ── GET    /api/site-content/hero            → the hero background staff set     (public)
// ── POST   /api/site-content/hero  {kind, type, size} → a one-time upload link  (catalog.manage)
// ── PUT    /api/site-content/hero  {kind, src}        → use it                  (catalog.manage)
// ── DELETE /api/site-content/hero            → back to the built-in photo       (catalog.manage)
//
// ?slot=closing works the same for the home page's closing band ("Your day
// at Stonewood Garden"), photos only (SITE_MEDIA_SLOTS).
//
// The home page's hero: a photo or an MP4 video (lib/heroMedia.ts). The file
// goes straight from the admin's browser to the public "site-media" storage
// bucket through a signed upload link, so a 50 MB video never passes through
// this server. The bucket is created here the first time it is needed.
// Saving needs the site_content table (migration 20261028130000_site_content).

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { actingStaff } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";
import {
  SITE_MEDIA_BUCKET, SITE_MEDIA_SLOTS, slotOf, HERO_UPLOAD, validateHeroMedia, heroUploadProblem, heroUploadPath, type HeroMedia,
} from "@/lib/heroMedia";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const NOT_READY = "The hero background switches on once the database update (20261028130000_site_content.sql) is applied.";
const missingTable = (msg: string | undefined) => /site_content/.test(msg ?? "");

export async function GET(req: NextRequest) {
  const slot = SITE_MEDIA_SLOTS[slotOf(req.nextUrl.searchParams.get("slot"))];
  try {
    const { data, error } = await getSupabaseAdmin().from("site_content").select("data, updated_at").eq("key", slot.key).maybeSingle();
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: true, media: null, ready: false });
      throw new Error(error.message);
    }
    const v = data ? validateHeroMedia((data as { data: unknown }).data) : null;
    return NextResponse.json({ success: true, media: v && v.ok ? v.media : null, ready: true });
  } catch (err) {
    console.error("[/api/site-content/hero GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the hero." }, { status: 500 });
  }
}

/** A signed link the browser uploads the file to. */
export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  const slotName = slotOf(req.nextUrl.searchParams.get("slot"));
  const slot = SITE_MEDIA_SLOTS[slotName];
  const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === "video" ? "video" : body.kind === "image" ? "image" : null;
  if (!kind) return NextResponse.json({ success: false, error: "Choose a photo or a video." }, { status: 400 });
  if (kind === "video" && !slot.video) return NextResponse.json({ success: false, error: "This background takes a photo, not a video." }, { status: 400 });
  const type = String(body.type ?? "");
  const problem = heroUploadProblem(kind, type, Number(body.size));
  if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });
  try {
    const storage = getSupabaseAdmin().storage;
    // First use: make the public bucket, limited to these file types.
    const got = await storage.getBucket(SITE_MEDIA_BUCKET);
    if (got.error) {
      const made = await storage.createBucket(SITE_MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: HERO_UPLOAD.video.maxBytes,
        allowedMimeTypes: [...HERO_UPLOAD.image.types, ...HERO_UPLOAD.video.types],
      });
      if (made.error && !/exists/i.test(made.error.message)) throw new Error(made.error.message);
    }
    const path = heroUploadPath(kind, type, Date.now(), slotName);
    const signed = await storage.from(SITE_MEDIA_BUCKET).createSignedUploadUrl(path);
    if (signed.error) throw new Error(signed.error.message);
    const publicUrl = storage.from(SITE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ success: true, uploadUrl: signed.data.signedUrl, path, publicUrl });
  } catch (err) {
    console.error("[/api/site-content/hero POST]", err);
    return NextResponse.json({ success: false, error: "Could not prepare the upload. Try again." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  const slot = SITE_MEDIA_SLOTS[slotOf(req.nextUrl.searchParams.get("slot"))];
  const v = validateHeroMedia(await readJson(req).catch(() => null));
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  if (v.media.kind === "video" && !slot.video) return NextResponse.json({ success: false, error: "This background takes a photo, not a video." }, { status: 400 });
  try {
    const who = actingStaff();
    const { error } = await getSupabaseAdmin().from("site_content").upsert(
      { key: slot.key, data: v.media, updated_at: new Date().toISOString(), updated_by_name: who?.name ?? null },
      { onConflict: "key" },
    );
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
      throw new Error(error.message);
    }
    revalidatePath("/");
    await logActivity({
      actor: "Admin", action: "site.hero", entity: "site_content", entityId: slot.key,
      summary: `Changed the home page's ${slot.label} to a ${v.media.kind === "video" ? "video" : "photo"}.`,
    });
    return NextResponse.json({ success: true, media: v.media satisfies HeroMedia });
  } catch (err) {
    console.error("[/api/site-content/hero PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the hero." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  const slot = SITE_MEDIA_SLOTS[slotOf(req.nextUrl.searchParams.get("slot"))];
  try {
    const { error } = await getSupabaseAdmin().from("site_content").delete().eq("key", slot.key);
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
      throw new Error(error.message);
    }
    revalidatePath("/");
    await logActivity({
      actor: "Admin", action: "site.hero", entity: "site_content", entityId: slot.key,
      summary: `Put the home page's ${slot.label} back to the built-in photo.`,
    });
    return NextResponse.json({ success: true, media: null });
  } catch (err) {
    console.error("[/api/site-content/hero DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not reset the hero." }, { status: 500 });
  }
}
