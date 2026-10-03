// ── GET    /api/inventory      → list items            (admin only)
// ── POST   /api/inventory      → add an item           (admin only)
// ── PATCH  /api/inventory?id=  → update an item        (admin only)
// ── DELETE /api/inventory?id=  → soft-delete an item   (admin only)
//
// Replaces the Mongoose placeholder. Inventory has no anon RLS policy at
// all, so it is unreachable with the publishable key by design — every read
// and write here goes through the service role behind the admin session.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity, changes, listFields, loadRow } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToInventoryItem } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { inventoryItemInput, inventoryItemPatch, parseInput } from "@/lib/schemas";
import type { InventoryRow } from "@/types/database";

export const dynamic = "force-dynamic";

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
    const parsed = parseInput(inventoryItemInput, await req.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    const item = parsed.data;

    const { data, error } = await getSupabaseAdmin().from("inventory").insert({
      category: item.category,
      name: item.name,
      qty: Math.round(item.qty),
      unit: item.unit,
      min_qty: Math.round(item.minQty),
      notes: item.notes,
    }).select().single();

    if (error) throw new Error(error.message);
    const added = data as InventoryRow;
    await logActivity({ actor: "Admin", action: "inventory.added", entity: "inventory", entityId: added.id, summary: `Added "${added.name}" to inventory (${added.qty} ${added.unit}).` });
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
    const parsed = parseInput(inventoryItemPatch, await req.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    const fields = parsed.data;

    // Only the keys the caller actually sent: `.partial()` leaves the rest
    // undefined, so an omitted field is never written as null.
    const patch: Partial<InventoryRow> = {};
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.qty !== undefined) patch.qty = Math.round(fields.qty);
    if (fields.unit !== undefined) patch.unit = fields.unit;
    if (fields.minQty !== undefined) patch.min_qty = Math.round(fields.minQty);
    if (fields.notes !== undefined) patch.notes = fields.notes;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
    }

    const prev = await loadRow("inventory", id);
    const { data, error } = await getSupabaseAdmin()
      .from("inventory").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
    const diff = changes(prev, data as Record<string, unknown>);
    if (Object.keys(diff).length) {
      await logActivity({ actor: "Admin", action: "inventory.updated", entity: "inventory", entityId: id, summary: `Updated "${(data as InventoryRow).name}" in inventory: ${listFields(diff)}.`, details: { changes: diff } });
    }

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
    // Soft delete: the table carries deleted_at, so a retired item keeps its
    // history instead of vanishing.
    const { data, error } = await getSupabaseAdmin()
      .from("inventory")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id).select().maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
    await logActivity({ actor: "Admin", action: "inventory.removed", entity: "inventory", entityId: id, summary: `Removed "${(data as InventoryRow).name}" from inventory.` });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/inventory DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove that item." }, { status: 500 });
  }
}
