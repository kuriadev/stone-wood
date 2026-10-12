// ── POST /api/upkeep/run → an upkeep task is done        (caretaker / owner)
//
// Body: { taskId, dueDate, supplies: [{ itemId, qty }], note? }
//
// The caretaker taps Done on "Pool cleaning". The screen pre-filled the
// task's standard supplies; what arrives here is what they say they really
// used. One run per task per scheduled day (a unique index), then each
// supply comes off the stock as a "Used" movement pointing at this run —
// which is how the chlorine count stays true without anyone counting it
// after every cleaning.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { actingStaff } from "@/lib/staff.server";
import { recordMovements, parseSupplies, missingStockTable, itemNames, describeSupplies } from "@/lib/stock.server";
import { upkeepStatus } from "@/lib/tasks";
import { logActivity } from "@/lib/activity.server";
import { cleanText } from "@/lib/money";
import { manilaDate } from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "facilities.clean");
  if (denied) return denied;
  const who = actingStaff();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = Number(b.taskId);
  const dueDate = String(b.dueDate ?? "");
  if (!Number.isInteger(taskId) || taskId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ success: false, error: "Which task, for which day?" }, { status: 400 });
  }
  const supplies = parseSupplies(b.supplies);
  const note = cleanText(b.note, 300);

  try {
    const db = getSupabaseAdmin();
    const t = await db.from("upkeep_tasks").select("id, title, every_days, start_date, active").eq("id", taskId).maybeSingle();
    if (t.error) {
      if (missingStockTable(t.error)) return NextResponse.json({ success: false, error: "The upkeep schedule needs the database update first." }, { status: 409 });
      throw new Error(t.error.message);
    }
    if (!t.data) return NextResponse.json({ success: false, error: "That task no longer exists." }, { status: 404 });
    const task = t.data as { id: number; title: string; every_days: number; start_date: string; active: boolean };

    // Only the day the schedule says is owed, so a stale screen can't record
    // a run for a day that isn't (or isn't yet) due.
    const today = manilaDate();
    const status = upkeepStatus({ id: task.id, everyDays: task.every_days, startDate: task.start_date }, [], today);
    if (status.state === "upcoming" || status.dueDate !== dueDate) {
      return NextResponse.json({ success: false, error: "That day isn't the one due. Refresh your task list." }, { status: 409 });
    }

    const run = await db.from("upkeep_runs").insert({
      task_id: taskId, due_date: dueDate, done_by: who?.id ?? null, done_by_name: who?.name ?? null, note,
    }).select("id").single();
    if (run.error) {
      if (run.error.code === "23505") return NextResponse.json({ success: false, error: "Someone already marked this done." }, { status: 409 });
      throw new Error(run.error.message);
    }
    const runId = (run.data as { id: number }).id;

    try {
      await recordMovements(supplies.map((s) => ({ itemId: s.itemId, delta: -s.qty, reason: "Used" as const, refType: "upkeep_run", refId: runId, note: task.title })));
    } catch (moveErr) {
      // The run and its supplies are one thing: without the stock lines the
      // run would claim work whose supplies nobody can account for.
      await db.from("upkeep_runs").delete().eq("id", runId);
      throw moveErr;
    }

    const names = await itemNames(supplies.map((s) => s.itemId));
    await logActivity({
      actor: "Admin", action: "upkeep.done", entity: "upkeep_task", entityId: taskId,
      summary: `Did "${task.title}" (due ${dueDate})${supplies.length ? `, using ${describeSupplies(supplies, names)}` : ""}.${note ? ` Note: ${note}` : ""}`,
      details: { dueDate, supplies },
    });
    return NextResponse.json({ success: true, runId }, { status: 201 });
  } catch (err) {
    console.error("[/api/upkeep/run POST]", err);
    return NextResponse.json({ success: false, error: "Could not record it. Try again." }, { status: 500 });
  }
}
