// ── GET  /api/site-content/media → how many photos are still stored as text   (catalog.manage)
// ── POST /api/site-content/media → move them to file storage, once            (catalog.manage)
//
// Photos used to be saved inside the room, package and gallery records as
// data: URLs, about 20 MB that every visitor downloaded (lib/mediaStore.server.ts).
// New saves store files already; this moves the ones saved before. Safe to
// run more than once: a photo already moved is a link and is skipped, and
// the same photo is stored under the same name. Old and new versions of the
// site both show a linked photo, so nothing breaks while it runs.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isDataImage, storeImage } from "@/lib/mediaStore.server";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";
// Moving a few dozen photos can take a little while.
export const maxDuration = 60;

type RoomRow = { id: number; img: string | null; gallery: string[] | null };
type PkgRow = { id: number; cover: string | null; gallery: { src: string; label?: string; kind?: string }[] | null };
type GalRow = { id: number; url: string };

async function load() {
  const db = getSupabaseAdmin();
  const [rooms, pkgs, gal] = await Promise.all([
    db.from("rooms").select("id, img, gallery"),
    db.from("packages").select("id, cover, gallery"),
    db.from("gallery").select("id, url"),
  ]);
  return {
    rooms: (rooms.data ?? []) as RoomRow[],
    pkgs: (pkgs.data ?? []) as PkgRow[],
    gal: (gal.data ?? []) as GalRow[],
  };
}

function countInline({ rooms, pkgs, gal }: Awaited<ReturnType<typeof load>>): number {
  let n = 0;
  for (const r of rooms) n += (isDataImage(r.img) ? 1 : 0) + (r.gallery ?? []).filter(isDataImage).length;
  for (const p of pkgs) n += (isDataImage(p.cover) ? 1 : 0) + (p.gallery ?? []).filter((g) => isDataImage(g?.src)).length;
  for (const g of gal) n += isDataImage(g.url) ? 1 : 0;
  return n;
}

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  try {
    return NextResponse.json({ success: true, inline: countInline(await load()) });
  } catch (err) {
    console.error("[/api/site-content/media GET]", err);
    return NextResponse.json({ success: false, error: "Could not check the photos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  try {
    const db = getSupabaseAdmin();
    const data = await load();
    const before = countInline(data);
    for (const r of data.rooms) {
      if (!isDataImage(r.img) && !(r.gallery ?? []).some(isDataImage)) continue;
      const img = r.img ? await storeImage(r.img, "rooms") : r.img;
      const gallery = await Promise.all((r.gallery ?? []).map((u) => storeImage(u, "rooms")));
      await db.from("rooms").update({ img, gallery }).eq("id", r.id);
    }
    for (const p of data.pkgs) {
      if (!isDataImage(p.cover) && !(p.gallery ?? []).some((g) => isDataImage(g?.src))) continue;
      const cover = p.cover ? await storeImage(p.cover, "packages") : p.cover;
      const gallery = await Promise.all((p.gallery ?? []).map(async (g) => ({ ...g, src: await storeImage(g.src, "packages") })));
      await db.from("packages").update({ cover, gallery }).eq("id", p.id);
    }
    for (const g of data.gal) {
      if (!isDataImage(g.url)) continue;
      await db.from("gallery").update({ url: await storeImage(g.url, "gallery") }).eq("id", g.id);
    }
    const left = countInline(await load());
    await logActivity({
      actor: "Admin", action: "site.media_moved", entity: "site_content", entityId: "media",
      summary: `Moved ${before - left} photo${before - left === 1 ? "" : "s"} from the database to file storage${left ? `; ${left} couldn't be moved` : ""}.`,
    });
    return NextResponse.json({ success: true, moved: before - left, left });
  } catch (err) {
    console.error("[/api/site-content/media POST]", err);
    return NextResponse.json({ success: false, error: "Could not move the photos. Nothing was lost; try again." }, { status: 500 });
  }
}
