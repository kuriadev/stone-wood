// ── Stock that moves by itself (server only)
//
// SERVER ONLY.
//
// Every change to an inventory count goes through recordMovements: a line
// in the append-only stock history (inventory_movements) saying how much,
// why, what caused it and who. A database trigger applies it to
// inventory.qty in the same insert, so the count and its history can never
// disagree. Nobody types a new total any more — the count follows the work:
//
//   Used     an upkeep task or a cleaning, ticked done by a caretaker
//   Broken   a damaged item found at a check-out inspection
//   Bought   a purchase (which is also an expense in Sales)
//   Counted  a physical count, recorded as the difference it found
//
// ── Before the migration ──
//
// Without 20261012130000_tasks_and_stock_movements.sql there is no history
// table. The same call then just adjusts inventory.qty directly, so the
// screens work the same and the count still moves; only the history is
// missing until the partner applies the update.

import { getSupabaseAdmin } from "@/lib/supabase";
import { actingStaff } from "@/lib/staff.server";
import type { MovementReason, StockMovement, SupplyLine } from "@/types/tasks";

export interface MovementInput {
  itemId: number;
  /** + in, − out. */
  delta: number;
  reason: MovementReason;
  refType?: string;
  refId?: string | number;
  bookingId?: string | null;
  unitCost?: number | null;
  expenseId?: number | null;
  note?: string;
}

export interface MovementRow {
  id: number;
  item_id: number;
  delta: number;
  reason: MovementReason;
  ref_type: string | null;
  ref_id: string | null;
  booking_id: string | null;
  unit_cost: number | null;
  expense_id: number | null;
  staff_id: string | null;
  staff_name: string | null;
  note: string;
  at: string;
}

export const rowToMovement = (r: MovementRow): StockMovement => ({
  id: r.id,
  itemId: r.item_id,
  delta: Number(r.delta),
  reason: r.reason,
  refType: r.ref_type,
  refId: r.ref_id,
  bookingId: r.booking_id,
  unitCost: r.unit_cost === null ? null : Number(r.unit_cost),
  expenseId: r.expense_id,
  staffName: r.staff_name,
  note: r.note,
  at: r.at,
});

/** A Supabase error that means a Phase-2 table or column isn't there yet. */
export function missingStockTable(err: { message?: string; code?: string } | null | undefined): boolean {
  const msg = err?.message ?? "";
  return err?.code === "42P01" || err?.code === "PGRST205" || err?.code === "42703" ||
    (/(inventory_movements|upkeep_|facility_cleaning|facility_cleanings|inventory_item_id|photos|inspected_by_name|\bkind\b)/i.test(msg) &&
      /(does not exist|schema cache|could not find)/i.test(msg));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Clean a list of { itemId, qty } from a request: positive quantities,
 *  each item once, at most 30 lines. */
export function parseSupplies(raw: unknown): SupplyLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<number, number>();
  for (const x of raw.slice(0, 30)) {
    const r = (x ?? {}) as Record<string, unknown>;
    const itemId = Number(r.itemId);
    const qty = round2(Number(r.qty));
    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty <= 0 || qty > 100_000) continue;
    seen.set(itemId, round2((seen.get(itemId) ?? 0) + qty));
  }
  return [...seen].map(([itemId, qty]) => ({ itemId, qty }));
}

/**
 * Record stock changes. Returns whether the history table took them
 * (`history: false` = before the migration; the counts moved anyway).
 * Never throws for a missing table; throws for anything else, so the
 * caller's own error handling decides.
 */
export async function recordMovements(list: MovementInput[]): Promise<{ history: boolean }> {
  const lines = list.filter((m) => Number.isFinite(m.delta) && (m.delta !== 0 || m.reason === "Counted"));
  if (lines.length === 0) return { history: true };
  const db = getSupabaseAdmin();
  const by = actingStaff();
  const rows = lines.map((m) => ({
    item_id: m.itemId,
    delta: round2(m.delta),
    reason: m.reason,
    ref_type: m.refType ?? null,
    ref_id: m.refId == null ? null : String(m.refId),
    booking_id: m.bookingId ?? null,
    unit_cost: m.unitCost ?? null,
    expense_id: m.expenseId ?? null,
    staff_id: by?.id ?? null,
    staff_name: by?.name ?? null,
    note: (m.note ?? "").slice(0, 300),
  }));
  const { error } = await db.from("inventory_movements").insert(rows);
  if (!error) return { history: true };
  if (!missingStockTable(error)) throw new Error(error.message);

  // Before the migration: move the counts directly. qty is still a whole
  // number then, so the change is rounded.
  for (const m of lines) {
    if (m.delta === 0) continue;
    const cur = await db.from("inventory").select("qty").eq("id", m.itemId).maybeSingle();
    if (cur.error || !cur.data) continue;
    const next = Math.max(0, Math.round(Number((cur.data as { qty: number }).qty) + m.delta));
    await db.from("inventory").update({ qty: next }).eq("id", m.itemId);
  }
  return { history: false };
}

/** Items by id, for naming them in a log line. */
export async function itemNames(ids: number[]): Promise<Map<number, { name: string; unit: string }>> {
  if (ids.length === 0) return new Map();
  const { data } = await getSupabaseAdmin().from("inventory").select("id, name, unit").in("id", ids);
  return new Map(((data ?? []) as { id: number; name: string; unit: string }[]).map((r) => [r.id, { name: r.name, unit: r.unit }]));
}

/** "2 pcs Chlorine Tablets, 1 kg pH Reducer" */
export function describeSupplies(lines: SupplyLine[], names: Map<number, { name: string; unit: string }>): string {
  return lines.map((l) => {
    const n = names.get(l.itemId);
    return n ? `${l.qty} ${n.unit} ${n.name}` : `${l.qty} × item #${l.itemId}`;
  }).join(", ");
}
