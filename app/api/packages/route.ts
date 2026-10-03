// ── GET    /api/packages      → packages  (public — Home and Packages pages)
// ── POST   /api/packages      → add       (admin only)
// ── PATCH  /api/packages?id=  → update    (admin only)
// ── DELETE /api/packages?id=  → remove    (admin only)
//
// Needs migration 20260923090000.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity, changes, listFields, loadRow } from "@/lib/activity.server";
import { fmt } from "@/lib/utils";
import { getSupabaseAdmin, rowToPackage } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { pricingProblem } from "@/lib/pricing";
import { GALLERY_MAX, sanitizeLabel, sanitizeNotes } from "@/lib/validators";
import type { PackageRow } from "@/types/database";
import type { BookingResource, BookingTier } from "@/types/booking";

export const dynamic = "force-dynamic";

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const TIERS: BookingTier[] = ["Shared", "Exclusive"];

const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 40)
                   : String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 40);

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("packages").select("*").order("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, packages: (data as PackageRow[]).map(rowToPackage) });
  } catch (err) {
    console.error("[/api/packages GET]", err);
    return NextResponse.json({ success: false, error: "Could not load packages." }, { status: 500 });
  }
}

/** The gallery as the admin form sends it: up to GALLERY_MAX frames, each
 *  a real image source with a caption. Anything else in the array is dropped
 *  rather than written to the row -- the column is rendered straight into the
 *  guest's gallery, and a request does not have to come from the admin UI. */
function cleanGallery(input: unknown): { src: string; label: string; kind: string }[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: { src: string; label: string; kind: string }[] = [];
  for (const raw of input) {
    const g = (raw ?? {}) as Record<string, unknown>;
    const src = String(g.src ?? "").slice(0, 2_000_000);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      src,
      label: sanitizeLabel(String(g.label ?? "")).slice(0, 60),
      kind: sanitizeLabel(String(g.kind ?? "")).slice(0, 30),
    });
    if (out.length >= GALLERY_MAX) break;
  }
  return out;
}

function build(b: Record<string, unknown>) {
  const price = Number(b.price);
  const capacity = Number(b.capacity);
  return {
    // Falls back to a slug of the title, matching what PackagesTab does when
    // the admin leaves the code blank.
    code: String(b.code ?? "").trim() || String(b.title ?? "").trim().toUpperCase().replace(/\s+/g, "-"),
    title: sanitizeLabel(String(b.title ?? "")),
    resource: b.resource as BookingResource,
    status: b.status as BookingTier,
    price,
    list_price: b.listPrice ? Number(b.listPrice) : null,
    capacity: Math.round(capacity),
    requires_room: !!b.requiresRoom,
    slot_mode: (b.slotMode === "WholeDay" ? "WholeDay" : "Single") as "Single" | "WholeDay",
    cover: String(b.cover ?? "").slice(0, 2_000_000),
    gallery: cleanGallery(b.gallery),
    blurb: sanitizeNotes(String(b.blurb ?? "")),
    includes: lines(b.includes),
    note: b.note ? sanitizeNotes(String(b.note)) : null,
    active: b.active !== false,
  };
}

function problemWith(b: Record<string, unknown>): string | null {
  if (!sanitizeLabel(String(b.title ?? ""))) return "A package title is required.";
  if (!RESOURCES.includes(b.resource as BookingResource)) return "Unknown resource.";
  if (!TIERS.includes(b.status as BookingTier)) return "Unknown tier.";
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0) return "Price must be zero or more.";
  const cap = Number(b.capacity);
  if (!Number.isFinite(cap) || cap < 1) return "Capacity must be at least 1.";
  const problem = pricingProblem(b.resource as BookingResource, b.status as BookingTier, b.slotMode === "WholeDay" ? "WholeDay" : "Day");
  if (problem) return problem;
  return null;
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const b = await req.json().catch(() => ({}));
    const problem = problemWith(b);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().from("packages").insert(build(b)).select().single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ success: false, error: "A package with that code already exists." }, { status: 409 });
      throw new Error(error.message);
    }
    const added = data as PackageRow;
    await logActivity({ actor: "Admin", action: "package.added", entity: "package", entityId: added.id, summary: `Added the package "${added.title}" at ${fmt(Number(added.price))}.` });
    return NextResponse.json({ success: true, package: rowToPackage(data as PackageRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/packages POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that package." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric package id is required." }, { status: 400 });
  try {
    const b = await req.json().catch(() => ({}));
    const problem = problemWith(b);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const prev = await loadRow("packages", id);
    const { data, error } = await getSupabaseAdmin().from("packages").update(build(b)).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Package not found." }, { status: 404 });
    const diff = changes(prev, data as Record<string, unknown>);
    if (Object.keys(diff).length) {
      await logActivity({ actor: "Admin", action: "package.updated", entity: "package", entityId: id, summary: `Updated the package "${(data as PackageRow).title}": ${listFields(diff)}.`, details: { changes: diff } });
    }
    return NextResponse.json({ success: true, package: rowToPackage(data as PackageRow) });
  } catch (err) {
    console.error("[/api/packages PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that package." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric package id is required." }, { status: 400 });
  try {
    const { data, error } = await getSupabaseAdmin().from("packages").delete().eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (data) await logActivity({ actor: "Admin", action: "package.removed", entity: "package", entityId: id, summary: `Removed the package "${(data as PackageRow).title}".` });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/packages DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove that package." }, { status: 500 });
  }
}
