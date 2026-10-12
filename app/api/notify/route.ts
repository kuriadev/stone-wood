// ── POST /api/notify  →  the resort's daily briefing to its own inbox
//
// The one notification that is not tied to an event. A booking arriving
// and a day being closed both happen AT a moment, so those mail from the
// routes that handle them. "Your reschedule deadline has gone by" happens
// at no moment at all — a date simply passes — so something has to look.
//
// ── Calling it ──
//
// Either as a signed-in admin (the panel can offer a "send it now" button),
// or with `Authorization: Bearer <NOTIFY_SECRET>` so a scheduler can. One
// call a morning is the intended rhythm; Vercel Cron, cron-job.org or a
// phone alarm all work. Nothing breaks if it is never called — the board
// in the admin panel is still the source of truth, this only pushes it.
//
// ── Why it cannot send twice ──
//
// A scheduler that retries, or two of them, must not mail the owner the
// same briefing again. Each send is written to the activity log, and the
// log is checked first: one briefing per Manila date, whoever asks and
// however often. That reuses a table that already exists rather than
// adding one, and it means the sends are visible in Activity like
// everything else.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity.server";
import { trySendMail, isMailConfigured } from "@/lib/mailer";
import { buildMorningBriefing, adminNotifyTo } from "@/lib/adminNotify";
import { manilaDate } from "@/lib/finance";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

const ACTION = "notify.briefing";

/** A scheduler has no session, so it carries a secret instead. Absent or
 *  unset, only a signed-in admin gets in. */
function schedulerAuthorised(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!schedulerAuthorised(req)) {
    const denied = requireAdmin(req);
    if (denied) return denied;
  }

  const limited = rateLimit(req, { name: "notify", limit: 12, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  if (!isMailConfigured()) {
    return NextResponse.json({ success: false, error: "Email is not configured." }, { status: 503 });
  }

  const date = manilaDate();

  try {
    const db = getSupabaseAdmin();

    // Already sent today? Say so and stop — this is what makes a retrying
    // scheduler safe.
    const already = await db
      .from("activity_log")
      .select("id")
      .eq("action", ACTION)
      .eq("entity_id", date)
      .limit(1);
    if (already.error) throw new Error(already.error.message);
    if (already.data && already.data.length > 0) {
      return NextResponse.json({ success: true, sent: false, reason: "Already sent today." });
    }

    const rows = await db.from("bookings").select("*");
    if (rows.error) throw new Error(rows.error.message);
    const bookings = ((rows.data ?? []) as BookingRow[]).map(rowToBooking);

    const mail = buildMorningBriefing({ date, bookings });

    // Nothing worth saying. Logged all the same, so a quiet day cannot be
    // mistaken for a broken scheduler when someone checks Activity.
    if (!mail) {
      await logActivity({
        actor: "System", action: ACTION, entity: "notify", entityId: date,
        summary: `No briefing for ${date}: no arrivals, departures, unconfirmed bookings or lapsed reschedules.`,
        details: { sent: false },
      });
      return NextResponse.json({ success: true, sent: false, reason: "Nothing to report." });
    }

    const to = adminNotifyTo();
    const sent = await trySendMail({ to, subject: mail.subject, html: mail.html }, `briefing ${date}`);

    await logActivity({
      actor: "System", action: ACTION, entity: "notify", entityId: date,
      summary: sent ? `Emailed the daily briefing for ${date} to ${to}.` : `Could not email the briefing for ${date}.`,
      details: { sent, to, subject: mail.subject },
    });

    return NextResponse.json({ success: true, sent });
  } catch (err) {
    console.error("[/api/notify POST]", err);
    return NextResponse.json({ success: false, error: "Could not send the briefing." }, { status: 500 });
  }
}
