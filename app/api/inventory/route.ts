// ── GET    /api/inventory      → list items            (admin only)
// ── POST   /api/inventory      → add an item           (admin only)
// ── PATCH  /api/inventory?id=  → update an item        (admin only)
// ── DELETE /api/inventory?id=  → soft-delete an item   (admin only)
//
// Replaces the Mongoose placeholder. Inventory has no anon RLS policy at
// all, so it is unreachable with the publishable key by design — every read
// and write here goes through the service role behind the admin session.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToInventoryItem } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { sanitizeName, sanitizeNotes } from "@/lib/validators";
import type { InventoryRow } from "@/types/database";
import type { InventoryCategory } from "@/types/inventory";

export const dynamic = "force-dynamic";

const CATEGORIES: InventoryCategory[] = [
  "Pool & Chemicals",
  "Furniture & Misc",
  "Cleaning Tools",
  "Food Ingredients",
];

/** Shared shape-check for POST and PATCH. Returns an error string, or null. */
function validate(body: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || body.category !== undefined) {
    if (!CATEGORIES.includes(body.category as InventoryCategory)) return "Unknown inventory category.";
  }
  if (!partial || body.name !== undefined) {
    const n = sanitizeName(String(body.name ?? ""));
    if (!n) return "An item name is required.";
  }
  for (const k of ["qty", "minQty"] as const) {
    if (!partial || body[k] !== undefined) {
      const v = Number(body[k]);
      if (!Number.isFinite(v) || v < 0) return `${k} must be zero or more.`;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("inventory").select("*").order("category").order("name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, inventory: (data as InventoryRow[]).map(rowToInventoryItem) });
  } catch (err) {
    console.error("[/api/inventory GET]", err);
    return NextResponse.json({ success: false, error: "Could not load inventory." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const problem = validate(body, false);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().from("inventory").insert({
      category: body.category,
      name: sanitizeName(String(body.name)),
      qty: Math.round(Number(body.qty)),
      unit: String(body.unit ?? "pc").slice(0, 24),
      min_qty: Math.round(Number(body.minQty ?? 0)),
      notes: sanitizeNotes(String(body.notes ?? "")),
    }).select().single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, item: rowToInventoryItem(data as InventoryRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/inventory POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that item." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "A numeric item id is required." }, { status: 400 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const problem = validate(body, true);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const patch: Partial<InventoryRow> = {};
    if (body.category !== undefined) patch.category = body.category;
    if (body.name !== undefined) patch.name = sanitizeName(String(body.name));
    if (body.qty !== undefined) patch.qty = Math.round(Number(body.qty));
    if (body.unit !== undefined) patch.unit = String(body.unit).slice(0, 24);
    if (body.minQty !== undefined) patch.min_qty = Math.round(Number(body.minQty));
    if (body.notes !== undefined) patch.notes = sanitizeNotes(String(body.notes));

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("inventory").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });

    return NextResponse.json({ success: true, item: rowToInventoryItem(data as InventoryRow) });
  } catch (err) {
    console.error("[/api/inventory PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that item." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "A numeric item id is required." }, { status: 400 });
  }
  try {
    // Soft delete: the table carries deleted_at, and a menu item's recipe can
    // still reference an ingredient that has been retired. Hard-deleting the
    // row would leave those recipes pointing at nothing.
    const { data, error } = await getSupabaseAdmin()
      .from("inventory")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id).select().maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/inventory DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove that item." }, { status: 500 });
  }
}
