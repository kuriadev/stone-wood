// ── GET  /api/retention → the settings, when it last ran, and how many bookings would go now (settings.manage)
// ── PUT  /api/retention { enabled, months } → save                                          (settings.manage)
// ── POST /api/retention { action: "run" }  → delete now, by hand                            (settings.manage)
// ── POST /api/retention { action: "auto" } → the daily run: only when switched on, once a day (staff, or a scheduler)
//
// How long guests' bookings are kept -- lib/retention.ts has the rules.
// The Dashboard calls "auto" the first time it is opened each day, the same
// way it sends tomorrow's reminders; a scheduler can call it with
// `Authorization: Bearer <NOTIFY_SECRET>`.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { actingStaff } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";
import { manilaDate } from "@/lib/finance";
import { validateRetention, monthsLabel } from "@/lib/retention";
import { loadRetention, saveRetention, findPurgeable, purgeBookings } from "@/lib/retention.server";

export const dynamic = "force-dynamic";

function schedulerAuthorised(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_SECRET;
  return !!secret && (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "settings.manage");
  if (denied) return denied;
  try {
    const { state, ready } = await loadRetention();
    const preview = await findPurgeable(state.months);
    return NextResponse.json({ success: true, ready, ...state, wouldDelete: preview.ids.length, cutoff: preview.cutoff });
  } catch (err) {
    console.error("[/api/retention GET]", err);
    return NextResponse.json({ success: false, error: "Could not load data retention." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "settings.manage");
  if (denied) return denied;
  const v = validateRetention(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  try {
    const { state } = await loadRetention();
    const err = await saveRetention({ ...state, ...v.settings }, actingStaff()?.name ?? null);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 409 });
    await logActivity({
      actor: "Admin", action: "data.retention_settings", entity: "site_content", entityId: "data_retention",
      summary: v.settings.enabled
        ? `Turned on data retention: finished bookings are deleted ${monthsLabel(v.settings.months)} after the stay.`
        : `Turned off data retention: bookings are kept until deleted by hand.`,
      details: { ...v.settings },
    });
    const preview = await findPurgeable(v.settings.months);
    return NextResponse.json({ success: true, ...v.settings, wouldDelete: preview.ids.length, cutoff: preview.cutoff });
  } catch (err) {
    console.error("[/api/retention PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save data retention." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "run") {
    const denied = await requirePermission(req, "settings.manage");
    if (denied) return denied;
  } else if (body.action === "auto") {
    if (!schedulerAuthorised(req)) {
      const denied = await requirePermission(req, "ops.view");
      if (denied) return denied;
    }
  } else {
    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  }
  try {
    const { state, ready } = await loadRetention();
    if (!ready) return NextResponse.json({ success: true, deleted: 0, enabled: false });
    const today = manilaDate();
    if (body.action === "auto") {
      // Switched off, or already ran today: nothing to do.
      if (!state.enabled) return NextResponse.json({ success: true, deleted: 0, enabled: false });
      if (state.lastRunAt && manilaDate(new Date(state.lastRunAt)) === today) return NextResponse.json({ success: true, deleted: 0, ranToday: true });
    }
    const { deleted, cutoff } = await purgeBookings(state.months, body.action === "auto" ? "auto" : "manual");
    await saveRetention({ ...state, lastRunAt: new Date().toISOString(), lastDeleted: deleted }, body.action === "run" ? actingStaff()?.name ?? null : null);
    return NextResponse.json({ success: true, deleted, cutoff });
  } catch (err) {
    console.error("[/api/retention POST]", err);
    return NextResponse.json({ success: false, error: "Could not delete the old bookings. Nothing further was removed." }, { status: 500 });
  }
}
