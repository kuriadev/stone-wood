// ── GET   /api/upkeep      → the schedule, recent runs, cleaning supplies (staff)
// ── POST  /api/upkeep      → add a repeating task                         (owner)
// ── PATCH /api/upkeep?id=  → change or pause one                          (owner)
//
// The owner writes down once what the caretakers do on a schedule —
// "Pool cleaning, every 7 days, uses 2 chlorine tablets and 1 kg pH
// reducer" — and it appears on My Tasks on each due day by itself
// (lib/tasks.ts). Ticking it done records a run and takes the supplies off
// the stock (/api/upkeep/run).
//
// Nothing is deleted: a task that is no longer done is paused (active =
// false), so its past runs still explain past stock movements.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { missingStockTable, parseSupplies } from "@/lib/stock.server";
import { logActivity } from "@/lib/activity.server";
import { cleanText } from "@/lib/money";
import type { SupplyLine, UpkeepData, UpkeepRun, UpkeepTask } from "@/types/tasks";

export const dynamic = "force-dynamic";

interface TaskRow { id: number; title: string; facility_id: number | null; every_days: number; start_date: string; notes: string; active: boolean }
interface SupplyRow { task_id: number; item_id: number; qty: number }
interface RunRow { id: number; task_id: number; due_date: string; done_at: string; done_by_name: string | null; note: string }
interface CleanRow { facility_id: number; item_id: number; qty: number }

const EMPTY: UpkeepData = { tasks: [], runs: [], cleaningSupplies: {}, enabled: false };

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "facilities.view");
  if (denied) return denied;
  try {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const [tasks, supplies, runs, cleaning] = await Promise.all([
      db.from("upkeep_tasks").select("*").order("title"),
      db.from("upkeep_task_supplies").select("*"),
      db.from("upkeep_runs").select("id, task_id, due_date, done_at, done_by_name, note").gte("due_date", since).order("done_at", { ascending: false }),
      db.from("facility_cleaning_supplies").select("*"),
    ]);
    const firstErr = [tasks, supplies, runs, cleaning].find((r) => r.error)?.error;
    if (firstErr) {
      if (missingStockTable(firstErr)) return NextResponse.json({ success: true, ...EMPTY });
      throw new Error(firstErr.message);
    }
    const byTask = new Map<number, SupplyLine[]>();
    for (const s of supplies.data as SupplyRow[]) {
      byTask.set(s.task_id, [...(byTask.get(s.task_id) ?? []), { itemId: s.item_id, qty: Number(s.qty) }]);
    }
    const cleaningSupplies: Record<number, SupplyLine[]> = {};
    for (const c of cleaning.data as CleanRow[]) {
      (cleaningSupplies[c.facility_id] ??= []).push({ itemId: c.item_id, qty: Number(c.qty) });
    }
    const data: UpkeepData = {
      enabled: true,
      tasks: (tasks.data as TaskRow[]).map((t): UpkeepTask => ({
        id: t.id, title: t.title, facilityId: t.facility_id, everyDays: t.every_days, startDate: t.start_date,
        notes: t.notes, active: t.active, supplies: byTask.get(t.id) ?? [],
      })),
      runs: (runs.data as RunRow[]).map((r): UpkeepRun => ({
        id: r.id, taskId: r.task_id, dueDate: r.due_date, doneAt: r.done_at, doneByName: r.done_by_name, note: r.note,
      })),
      cleaningSupplies,
    };
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error("[/api/upkeep GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the upkeep schedule." }, { status: 500 });
  }
}

/** Validate the editable fields; null fields are left as they are. */
function parseTask(b: Record<string, unknown>, creating: boolean):
  { ok: true; row: Record<string, unknown>; supplies: SupplyLine[] | null } | { ok: false; error: string } {
  const row: Record<string, unknown> = {};
  if (creating || b.title !== undefined) {
    const title = cleanText(b.title, 80);
    if (title.length < 2) return { ok: false, error: "Give the task a name, e.g. Pool cleaning." };
    row.title = title;
  }
  if (creating || b.everyDays !== undefined) {
    const every = Math.round(Number(b.everyDays));
    if (!Number.isFinite(every) || every < 1 || every > 365) return { ok: false, error: "How often: every 1 to 365 days." };
    row.every_days = every;
  }
  if (creating || b.startDate !== undefined) {
    if (typeof b.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)) return { ok: false, error: "Choose the first day it's due." };
    row.start_date = b.startDate;
  }
  if (b.facilityId !== undefined) {
    const f = b.facilityId === null || b.facilityId === "" ? null : Number(b.facilityId);
    if (f !== null && (!Number.isInteger(f) || f <= 0)) return { ok: false, error: "Unknown facility." };
    row.facility_id = f;
  }
  if (b.notes !== undefined) row.notes = cleanText(b.notes, 300);
  if (b.active !== undefined) row.active = !!b.active;
  return { ok: true, row, supplies: b.supplies === undefined ? null : parseSupplies(b.supplies) };
}

async function saveSupplies(taskId: number, supplies: SupplyLine[]) {
  const db = getSupabaseAdmin();
  const del = await db.from("upkeep_task_supplies").delete().eq("task_id", taskId);
  if (del.error) throw new Error(del.error.message);
  if (supplies.length) {
    const ins = await db.from("upkeep_task_supplies").insert(supplies.map((s) => ({ task_id: taskId, item_id: s.itemId, qty: s.qty })));
    if (ins.error) throw new Error(ins.error.message);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "inventory.manage");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTask(b, true);
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  try {
    const { data, error } = await getSupabaseAdmin().from("upkeep_tasks").insert(parsed.row).select().single();
    if (error) {
      if (missingStockTable(error)) return NextResponse.json({ success: false, error: "The upkeep schedule switches on once the database update (20261012130000_tasks_and_stock_movements.sql) is applied." }, { status: 409 });
      throw new Error(error.message);
    }
    const t = data as TaskRow;
    await saveSupplies(t.id, parsed.supplies ?? []);
    await logActivity({
      actor: "Admin", action: "upkeep.created", entity: "upkeep_task", entityId: t.id,
      summary: `Scheduled "${t.title}" every ${t.every_days === 1 ? "day" : `${t.every_days} days`} from ${t.start_date}.`,
    });
    return NextResponse.json({ success: true, id: t.id }, { status: 201 });
  } catch (err) {
    console.error("[/api/upkeep POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the task." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "inventory.manage");
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "Which task?" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTask(b, false);
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  try {
    const db = getSupabaseAdmin();
    let title = "";
    if (Object.keys(parsed.row).length) {
      const { data, error } = await db.from("upkeep_tasks").update(parsed.row).eq("id", id).select().maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ success: false, error: "That task no longer exists." }, { status: 404 });
      title = (data as TaskRow).title;
    }
    if (parsed.supplies) await saveSupplies(id, parsed.supplies);
    await logActivity({
      actor: "Admin", action: "upkeep.updated", entity: "upkeep_task", entityId: id,
      summary: b.active === false ? `Paused the upkeep task "${title || id}".` : `Updated the upkeep task "${title || id}".`,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/upkeep PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not save the task." }, { status: 500 });
  }
}
