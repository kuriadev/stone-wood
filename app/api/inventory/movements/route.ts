// ── GET  /api/inventory/movements?item=&limit= → stock history     (staff)
// ── POST /api/inventory/movements             → record a change    (by role)
//
// POST body: { itemId, kind, ... }
//
//   kind "Used"     { qty, note? }                      caretaker / owner
//   kind "Broken"   { qty, note? }                      caretaker / owner
//   kind "Counted"  { counted, note? }                  caretaker / owner
//   kind "Bought"   { qty, cost?, method?, reference?, note? } front desk / owner
//                   ("Add" on screen; with a cost it is also an expense)
//
// The count is never typed over: each of these writes a line in the stock
// history and the database applies it to the count (lib/stock.server.ts).
// A count records the DIFFERENCE it found ("system 22, counted 20: −2"),
// so drift shows up instead of disappearing.
//
// Adding stock with a cost is two records in one step: the stock goes up,
// and the cost is an expense in Sales (Pool Maintenance for pool chemicals,
// Supplies for the rest), linked to each other — so a bag of chlorine
// bought for cash is in the drawer count without anyone entering it twice.
// Without a cost (a delivery already paid for, a donation, stock found in
// the storeroom) only the count goes up.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin, rowToInventoryItem } from "@/lib/supabase";
import { recordMovements, rowToMovement, missingStockTable, type MovementRow } from "@/lib/stock.server";
import { logActivity } from "@/lib/activity.server";
import { cleanText, parseAmount } from "@/lib/money";
import { fmt } from "@/lib/utils";
import { manilaDate } from "@/lib/finance";
import type { InventoryRow, ExpenseRow } from "@/types/database";

export const dynamic = "force-dynamic";

const METHODS = ["Cash", "GCash", "Bank Transfer"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "inventory.view");
  if (denied) return denied;
  const item = Number(req.nextUrl.searchParams.get("item"));
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));
  const since = req.nextUrl.searchParams.get("since");
  try {
    let q = getSupabaseAdmin().from("inventory_movements").select("*").order("at", { ascending: false }).limit(limit);
    if (Number.isInteger(item) && item > 0) q = q.eq("item_id", item);
    if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) q = q.gte("at", `${since}T00:00:00+08:00`);
    const { data, error } = await q;
    if (error) {
      if (missingStockTable(error)) return NextResponse.json({ success: true, movements: [], enabled: false });
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true, movements: (data as MovementRow[]).map(rowToMovement), enabled: true });
  } catch (err) {
    console.error("[/api/inventory/movements GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the stock history." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const peek = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(peek.kind ?? "");
  if (!["Used", "Broken", "Counted", "Bought"].includes(kind)) {
    return NextResponse.json({ success: false, error: "Use, breakage, a count or a purchase?" }, { status: 400 });
  }
  const denied = await requirePermission(req, kind === "Bought" ? "inventory.buy" : "inventory.use");
  if (denied) return denied;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const itemId = Number(b.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ success: false, error: "Choose the item." }, { status: 400 });
  const note = cleanText(b.note, 300);

  try {
    const db = getSupabaseAdmin();
    const cur = await db.from("inventory").select("*").eq("id", itemId).is("deleted_at", null).maybeSingle();
    if (cur.error) throw new Error(cur.error.message);
    if (!cur.data) return NextResponse.json({ success: false, error: "That item is no longer in the inventory." }, { status: 404 });
    const item = rowToInventoryItem(cur.data as InventoryRow);

    let delta = 0;
    let summary = "";
    let expenseId: number | null = null;
    let unitCost: number | null = null;

    if (kind === "Counted") {
      const counted = round2(Number(b.counted));
      if (!Number.isFinite(counted) || counted < 0 || counted > 1_000_000) {
        return NextResponse.json({ success: false, error: "Enter how many you counted (0 or more)." }, { status: 400 });
      }
      delta = round2(counted - item.qty);
      summary = delta === 0
        ? `Counted ${item.name}: ${counted} ${item.unit}, matching the records.`
        : `Counted ${item.name}: ${counted} ${item.unit} on hand, records said ${item.qty} (${delta > 0 ? "+" : ""}${delta}).`;
    } else {
      const qty = round2(Number(b.qty));
      if (!Number.isFinite(qty) || qty <= 0 || qty > 100_000) {
        return NextResponse.json({ success: false, error: "Enter a quantity greater than zero." }, { status: 400 });
      }
      if (kind === "Used") {
        delta = -qty;
        summary = `Used ${qty} ${item.unit} of ${item.name}.`;
      } else if (kind === "Broken") {
        delta = -qty;
        summary = `${qty} ${item.unit} of ${item.name} broken or lost.`;
      } else {
        // ── Added: with a cost, the expense first, then the stock that
        //    points at it; without one, just the stock ──
        delta = qty;
        const costGiven = b.cost !== undefined && b.cost !== null && b.cost !== "" && Number(b.cost) !== 0;
        if (!costGiven) {
          summary = `Added ${qty} ${item.unit} of ${item.name}.`;
        } else {
          const cost = parseAmount(b.cost);
          if (cost === null) return NextResponse.json({ success: false, error: "The cost should be an amount greater than zero, or left blank." }, { status: 400 });
          if (!METHODS.includes(b.method as (typeof METHODS)[number])) return NextResponse.json({ success: false, error: "Choose how it was paid." }, { status: 400 });
          const reference = cleanText(b.reference, 80);
          const description = `Bought ${qty} ${item.unit} ${item.name}${reference ? ` (ref ${reference})` : ""}`.slice(0, 200);
          const exp = await db.from("expenses").insert({
            category: item.category === "Pool & Chemicals" ? "Pool Maintenance" : "Supplies",
            description, amount: cost, method: b.method, spent_on: manilaDate(),
          }).select().single();
          if (exp.error) throw new Error(exp.error.message);
          expenseId = (exp.data as ExpenseRow).id;
          unitCost = round2(cost / qty);
          summary = `Added ${qty} ${item.unit} of ${item.name}, bought for ${fmt(cost)} (${b.method}); recorded as an expense.`;
        }
      }
    }

    try {
      await recordMovements([{
        itemId, delta, reason: kind as "Used" | "Broken" | "Counted" | "Bought",
        refType: kind === "Bought" ? "expense" : kind === "Counted" ? "count" : "manual",
        refId: expenseId ?? undefined, expenseId, unitCost, note,
      }]);
    } catch (moveErr) {
      // A purchase whose stock line failed must not leave the expense
      // behind on its own — the two are one action.
      if (expenseId !== null) await db.from("expenses").delete().eq("id", expenseId);
      throw moveErr;
    }

    await logActivity({
      actor: "Admin", action: `inventory.${kind.toLowerCase()}`, entity: "inventory", entityId: itemId,
      summary: note ? `${summary} Note: ${note}` : summary,
      details: { delta, expenseId },
    });

    const after = await db.from("inventory").select("*").eq("id", itemId).maybeSingle();
    return NextResponse.json({
      success: true,
      item: after.data ? rowToInventoryItem(after.data as InventoryRow) : item,
      expenseId,
    }, { status: 201 });
  } catch (err) {
    console.error("[/api/inventory/movements POST]", err);
    return NextResponse.json({ success: false, error: "Could not record that. Nothing was changed — try again." }, { status: 500 });
  }
}
