// ── GET    /api/inventory      → list items            (admin only)
// ── POST   /api/inventory      → add an item           (admin only)
// ── PATCH  /api/inventory?id=  → update an item; a new qty is a COUNT;
//                                 { restore: true } takes it out of the archive
// ── DELETE /api/inventory?id=  → soft-delete an item   (admin only)
//
// Replaces the Mongoose placeholder. Inventory has no anon RLS policy at
// all, so it is unreachable with the publishable key by design — every read
// and write here goes through the service role behind the admin session.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity, changes, listFields, loadRow } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToInventoryItem } from "@/lib/supabase";
import { requirePermission, ownerGate } from "@/lib/auth";
import { inventoryItemInput, inventoryItemPatch, parseInput } from "@/lib/schemas";
import { recordMovements, missingStockTable } from "@/lib/stock.server";
import { guessKind } from "@/types/inventory";
import type { InventoryRow } from "@/types/database";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "inventory.view");
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
  const denied = await requirePermission(req, "inventory.manage");
  if (denied) return denied;
  try {
    const parsed = parseInput(inventoryItemInput, await req.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    const item = parsed.data;

    // The starting amount goes in as the item's first count, so its
    // history begins with where the stock started (lib/stock.server.ts).
    const startQty = round2(item.qty);
    const row = {
      category: item.category,
      name: item.name,
      qty: 0,
      unit: item.unit,
      min_qty: round2(item.minQty),
      notes: item.notes,
      kind: item.kind ?? guessKind(item),
    };
    let { data, error } = await getSupabaseAdmin().from("inventory").insert(row).select().single();
    if (error && missingStockTable(error)) {
      // Before the stock migration: whole numbers and no kind column.
      ({ data, error } = await getSupabaseAdmin().from("inventory").insert({
        category: row.category, name: row.name, qty: 0, unit: row.unit,
        min_qty: Math.round(row.min_qty), notes: row.notes,
      }).select().single());
    }

    if (error) throw new Error(error.message);
    let added = data as InventoryRow;
    if (startQty !== 0) {
      await recordMovements([{ itemId: added.id, delta: startQty, reason: "Counted", refType: "count", note: "Starting stock" }]);
      const again = await getSupabaseAdmin().from("inventory").select("*").eq("id", added.id).maybeSingle();
      if (again.data) added = again.data as InventoryRow;
    }
    await logActivity({ actor: "Admin", action: "inventory.added", entity: "inventory", entityId: added.id, summary: `Added "${added.name}" to inventory (${added.qty} ${added.unit}).` });
    return NextResponse.json({ success: true, item: rowToInventoryItem(added) }, { status: 201 });
  } catch (err) {
    console.error("[/api/inventory POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that item." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "inventory.use");
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "A numeric item id is required." }, { status: 400 });
  }
  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // { restore: true } brings an archived item back: the owner's call, like
    // archiving it was.
    if (raw.restore === true) {
      const gate = await ownerGate(req, "inventory.manage", raw);
      if (gate) return gate;
      const { data, error } = await getSupabaseAdmin().from("inventory")
        .update({ deleted_at: null }).eq("id", id).not("deleted_at", "is", null)
        .select().maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ success: false, error: "That item isn't in the archive." }, { status: 404 });
      await logActivity({ actor: "Admin", action: "inventory.restored", entity: "inventory", entityId: id, summary: `Restored "${(data as InventoryRow).name}" from the archive.` });
      return NextResponse.json({ success: true, item: rowToInventoryItem(data as InventoryRow) });
    }

    const parsed = parseInput(inventoryItemPatch, raw);
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    const fields = parsed.data;

    // Only the keys the caller actually sent: `.partial()` leaves the rest
    // undefined, so an omitted field is never written as null.
    const patch: Partial<InventoryRow> = {};
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.unit !== undefined) patch.unit = fields.unit;
    if (fields.minQty !== undefined) patch.min_qty = round2(fields.minQty);
    if (fields.notes !== undefined) patch.notes = fields.notes;
    if (fields.kind !== undefined) patch.kind = fields.kind;

    const prev = await loadRow("inventory", id);
    if (!prev) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
    // Caretakers update how many there are; what an item is (its name,
    // unit, category, kind and the minimum that triggers "buy more") is the
    // owner's.
    // The kind before the stock migration is the guessed one, which is what
    // the screen sends back unchanged.
    const before: Record<string, unknown> = { ...prev, kind: prev.kind ?? guessKind({ category: String(prev.category), name: String(prev.name) }) };
    const ownerChange = (["category", "name", "unit", "min_qty", "notes", "kind"] as const).some((k) =>
      k in patch && JSON.stringify(patch[k]) !== JSON.stringify(before[k] ?? null));
    if (ownerChange) {
      const gate = await ownerGate(req, "inventory.manage", fields);
      if (gate) return gate;
    }

    // A new quantity (the + / − in Supplies & Equipment, or one typed in) is
    // recorded as the difference, in the stock history with the person's
    // name, never written over the old number.
    const newQty = fields.qty !== undefined ? round2(fields.qty) : null;
    const diffQty = newQty === null ? 0 : round2(newQty - Number(prev.qty));
    if (Object.keys(patch).length === 0 && diffQty === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
    }

    let data: InventoryRow = prev as unknown as InventoryRow;
    if (Object.keys(patch).length) {
      const update = (p: Partial<InventoryRow>) => getSupabaseAdmin().from("inventory").update(p).eq("id", id).select().maybeSingle();
      let res = await update(patch);
      if (res.error && "kind" in patch && missingStockTable(res.error)) {
        // Before the stock migration: no kind column yet.
        const rest: Partial<InventoryRow> = { ...patch };
        delete rest.kind;
        if (Object.keys(rest).length) res = await update(rest);
        else res = await getSupabaseAdmin().from("inventory").select("*").eq("id", id).maybeSingle();
      }
      if (res.error) throw new Error(res.error.message);
      if (!res.data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
      data = res.data as InventoryRow;
    }
    const diff = changes(prev, data as unknown as Record<string, unknown>);
    if (Object.keys(diff).length) {
      await logActivity({ actor: "Admin", action: "inventory.updated", entity: "inventory", entityId: id, summary: `Updated "${data.name}" in inventory: ${listFields(diff)}.`, details: { changes: diff } });
    }
    if (diffQty !== 0) {
      await recordMovements([{ itemId: id, delta: diffQty, reason: "Adjusted", refType: "manual", note: "Changed in Supplies & Equipment" }]);
      await logActivity({ actor: "Admin", action: "inventory.adjusted", entity: "inventory", entityId: id, summary: `${data.name}: ${diffQty > 0 ? "+" : ""}${diffQty} ${data.unit} (now ${newQty}).` });
      const after = await getSupabaseAdmin().from("inventory").select("*").eq("id", id).maybeSingle();
      if (after.data) data = after.data as InventoryRow;
    }

    return NextResponse.json({ success: true, item: rowToInventoryItem(data) });
  } catch (err) {
    console.error("[/api/inventory PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that item." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // Others' removals go to the super admin as a request.
  const denied = await requirePermission(req, "inventory.delete");
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
