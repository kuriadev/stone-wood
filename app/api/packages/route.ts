// ── GET    /api/packages      → packages  (public — Home and Packages pages)
// ── POST   /api/packages      → add       (admin only)
// ── PATCH  /api/packages?id=  → update    (admin only)
// ── DELETE /api/packages?id=  → remove    (admin only)
//
// Needs migration 20260923090000.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToPackage } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { sanitizeLabel, sanitizeNotes } from "@/lib/validators";
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
    food_discount_pct: b.foodDiscountPct ? Number(b.foodDiscountPct) : null,
    cover: String(b.cover ?? "").slice(0, 2_000_000),
    gallery: Array.isArray(b.gallery) ? b.gallery : [],
    blurb: sanitizeNotes(String(b.blurb ?? "")),
    includes: lines(b.includes),
    food_note: sanitizeNotes(String(b.foodNote ?? "")),
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
  const pct = b.foodDiscountPct;
  if (pct !== undefined && pct !== null && pct !== "" && (Number(pct) < 0 || Number(pct) > 1)) {
    return "Food discount must be between 0 and 1.";
  }
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

    const { data, error } = await getSupabaseAdmin().from("packages").update(build(b)).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Package not found." }, { status: 404 });
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
    const { error } = await getSupabaseAdmin().from("packages").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/packages DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove that package." }, { status: 500 });
  }
}
