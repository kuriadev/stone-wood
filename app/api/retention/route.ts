// ── GET  /api/retention → the settings, when it last ran, what would be archived / deleted now (settings.manage)
// ── PUT  /api/retention { archiveEnabled, archiveMonths, enabled, schedule, day, month } → save (settings.manage)
// ── POST /api/retention { action: "archive" } → archive old finished bookings now, by hand  (settings.manage)
// ── POST /api/retention { action: "purge" }   → delete archived bookings over a year old now, by hand (settings.manage)
// ── POST /api/retention { action: "auto" }    → the daily run: archive, and delete on the scheduled date (staff, or a scheduler)
//
// Auto-archive and data retention -- lib/retention.ts has the rules.
// The Dashboard calls "auto" the first time it is opened each day, the same
// way it sends tomorrow's reminders; a scheduler can call it with
// `Authorization: Bearer <NOTIFY_SECRET>`.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { actingStaff } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";
import { manilaDate } from "@/lib/finance";
import { validateRetention, monthsLabel, scheduleLabel, nextScheduledOn, purgeDueFor, type RetentionState } from "@/lib/retention";
import { loadRetention, saveRetention, findArchivable, findDeletable, archiveOld, purgeArchive, BackupError } from "@/lib/retention.server";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

function schedulerAuthorised(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_SECRET;
  return !!secret && (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function preview(state: RetentionState) {
  const [arch, del] = await Promise.all([findArchivable(state.archiveMonths), findDeletable()]);
  return {
    wouldArchive: arch.ids.length, archiveCutoff: arch.cutoff,
    wouldDelete: del.ids.length, deleteCutoff: del.cutoff, nextDeleteOn: nextScheduledOn(manilaDate(), state),
  };
}

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "settings.manage");
  if (denied) return denied;
  try {
    const { state, ready } = await loadRetention();
    return NextResponse.json({ success: true, ready, ...state, ...(await preview(state)) });
  } catch (err) {
    console.error("[/api/retention GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the archive settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "settings.manage");
  if (denied) return denied;
  const v = validateRetention(await readJson(req).catch(() => null));
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  try {
    const { state } = await loadRetention();
    const s = v.settings;
    // Switching deletion on starts its clock today, so a scheduled date
    // that already passed doesn't delete the moment it is saved.
    const enabledOn = s.enabled ? (state.enabled ? state.enabledOn ?? manilaDate() : manilaDate()) : null;
    const next: RetentionState = { ...state, ...s, enabledOn };
    const err = await saveRetention(next, actingStaff()?.name ?? null);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 409 });
    await logActivity({
      actor: "Admin", action: "data.retention_settings", entity: "site_content", entityId: "data_retention",
      summary: [
        s.archiveEnabled ? `Auto-archive on: finished bookings move to the archive ${monthsLabel(s.archiveMonths)} after the stay.` : "Auto-archive off.",
        s.enabled ? `Archive deleted ${scheduleLabel(s)}.` : "The archive is kept until deleted by hand.",
      ].join(" "),
      details: { ...s },
    });
    return NextResponse.json({ success: true, ...next, ...(await preview(next)) });
  } catch (err) {
    console.error("[/api/retention PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the archive settings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await readJson(req).catch(() => ({}))) as { action?: string };
  const action = body.action === "run" ? "purge" : body.action;
  if (action === "archive" || action === "purge") {
    const denied = await requirePermission(req, "settings.manage");
    if (denied) return denied;
  } else if (action === "auto") {
    if (!schedulerAuthorised(req)) {
      const denied = await requirePermission(req, "ops.view");
      if (denied) return denied;
    }
  } else {
    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  }
  try {
    const { state, ready } = await loadRetention();
    if (!ready) return NextResponse.json({ success: true, archived: 0, deleted: 0 });
    const today = manilaDate();
    const by = action === "auto" ? null : actingStaff()?.name ?? null;

    if (action === "archive") {
      const { archived } = await archiveOld(state.archiveMonths, "manual");
      await saveRetention({ ...state, lastArchived: archived }, by);
      return NextResponse.json({ success: true, archived });
    }
    if (action === "purge") {
      const { deleted, backupTo } = await purgeArchive("manual");
      await saveRetention({ ...state, lastDeleted: deleted, lastRunAt: new Date().toISOString() }, by);
      return NextResponse.json({ success: true, deleted, backupTo });
    }

    // The daily run: once a day.
    if (state.lastRunAt && manilaDate(new Date(state.lastRunAt)) === today) {
      return NextResponse.json({ success: true, archived: 0, deleted: 0, ranToday: true });
    }
    // Delete before archiving, so this run's newly archived bookings stay
    // until the next scheduled date rather than going the same morning.
    const dueOn = purgeDueFor(today, state);
    const { deleted } = dueOn ? await purgeArchive("auto", dueOn) : { deleted: 0 };
    const { archived } = state.archiveEnabled ? await archiveOld(state.archiveMonths, "auto") : { archived: 0 };
    await saveRetention({
      ...state,
      lastRunAt: new Date().toISOString(),
      lastArchived: state.archiveEnabled ? archived : state.lastArchived ?? null,
      ...(dueOn ? { lastDeleted: deleted, lastPurgeOn: dueOn } : {}),
    }, null);
    return NextResponse.json({ success: true, archived, deleted });
  } catch (err) {
    console.error("[/api/retention POST]", err);
    if (err instanceof BackupError) return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    return NextResponse.json({ success: false, error: "Could not finish. Nothing further was changed." }, { status: 500 });
  }
}
