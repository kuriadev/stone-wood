// ── POST  /api/damage-rates      → add an item to the rate list  (admin only)
// ── PATCH /api/damage-rates?id=  → change its price, or retire it (admin only)
//
// The owner's price list for damaged property. Automatic penalties are
// quantity × the rate here. Items are retired (active = false) instead of
// deleted, so a penalty recorded last month still points at a real item.
// Changing a rate never touches penalties already recorded: each damage
// record keeps the unit rate it was charged at.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToDamageRate } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { cleanText } from "@/lib/money";
import type { DamageRateRow } from "@/types/database";

export const dynamic = "force-dynamic";

const rate = (v: unknown) => {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n <= 500_000 ? n : null;
};

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = cleanText(b?.name, 80);
  const r = rate(b?.rate);
  if (name.length < 2) return NextResponse.json({ success: false, error: "Name the item." }, { status: 400 });
  if (r === null) return NextResponse.json({ success: false, error: "Enter a rate of 0 or more." }, { status: 400 });
  try {
    const { data, error } = await getSupabaseAdmin().from("damage_rates").insert({
      name, rate: r,
      category: cleanText(b?.category, 40) || "General",
      unit: cleanText(b?.unit, 20) || "pc",
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, rate: rowToDamageRate(data as DamageRateRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/damage-rates POST]", err);
    return NextResponse.json({ success: false, error: "Could not add the item." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "An item id is required." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<DamageRateRow> = {};
  if (b.name !== undefined) {
    const name = cleanText(b.name, 80);
    if (name.length < 2) return NextResponse.json({ success: false, error: "Name the item." }, { status: 400 });
    patch.name = name;
  }
  if (b.rate !== undefined) {
    const r = rate(b.rate);
    if (r === null) return NextResponse.json({ success: false, error: "Enter a rate of 0 or more." }, { status: 400 });
    patch.rate = r;
  }
  if (b.category !== undefined) patch.category = cleanText(b.category, 40) || "General";
  if (b.unit !== undefined) patch.unit = cleanText(b.unit, 20) || "pc";
  if (b.active !== undefined) patch.active = !!b.active;
  if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
  try {
    const { data, error } = await getSupabaseAdmin().from("damage_rates").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
    return NextResponse.json({ success: true, rate: rowToDamageRate(data as DamageRateRow) });
  } catch (err) {
    console.error("[/api/damage-rates PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update the item." }, { status: 500 });
  }
}
