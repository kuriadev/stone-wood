// ── GET  /api/activity → the activity log, newest first        (admin only)
// ── POST /api/activity → note something done outside the app   (admin only)
//
// GET filters: from, to (YYYY-MM-DD, Manila days), category (the part of
// the action before the dot: booking, payment, room…), actor (Admin, Guest
// or System), booking (a reference), staff (a staff id — owner only), q
// (words in the summary), before (an id, to load older rows), limit (up to
// 200). Only the owner reads the whole log; staff get their own lines and
// any booking's history.
//
// POST accepts only actions the app can't see on its own, such as the
// owner texting a guest from their phone. Everything else is logged by the
// route that did it.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToActivity, rowToBooking } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { cleanText, isDateStr } from "@/lib/money";
import { logActivity } from "@/lib/activity.server";
import { actingStaff } from "@/lib/staff.server";
import { can } from "@/lib/permissions";
import { fmt } from "@/lib/utils";
import type { ActivityRow, BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "ops.view");
  if (denied) return denied;

  const p = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(p.get("limit")) || 100));
  try {
    let q = getSupabaseAdmin().from("activity_log").select("*").order("id", { ascending: false }).limit(limit + 1);
    const booking = p.get("booking")?.trim();
    const category = p.get("category")?.trim();
    const actor = p.get("actor");
    const from = p.get("from");
    const to = p.get("to");
    const words = cleanText(p.get("q"), 80).replace(/[%,()]/g, " ").trim();
    const before = Number(p.get("before"));
    if (booking) q = q.eq("booking_id", booking);
    if (category && /^[a-z_]+$/.test(category)) q = q.like("action", `${category}.%`);
    if (actor === "Admin" || actor === "Guest" || actor === "System") q = q.eq("actor", actor);
    if (isDateStr(from)) q = q.gte("at", `${from}T00:00:00+08:00`);
    if (isDateStr(to)) q = q.lt("at", new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86_400_000).toISOString());
    if (words) q = q.ilike("summary", `%${words}%`);
    if (Number.isFinite(before) && before > 0) q = q.lt("id", before);
    // The owner reads everyone's lines and can pick one person's. Staff read
    // their own — except a booking's history, which everyone at the counter
    // needs whole to answer the guest.
    const me = actingStaff();
    const staffFilter = p.get("staff")?.trim();
    if (can(me?.role, "activity.viewAll")) {
      if (staffFilter && /^[0-9a-f-]{36}$/i.test(staffFilter)) q = q.eq("staff_id", staffFilter);
    } else if (!booking) {
      if (!me?.id) return NextResponse.json({ success: true, activity: [], more: false });
      q = q.eq("staff_id", me.id);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data as ActivityRow[]);
    return NextResponse.json({ success: true, activity: rows.slice(0, limit).map(rowToActivity), more: rows.length > limit });
  } catch (err) {
    console.error("[/api/activity GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the audit log. Has the latest migration been run?" }, { status: 500 });
  }
}

const OUTSIDE_ACTIONS = new Set(["guest.texted", "day.count_reviewed"]);

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "ops.view");
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (!OUTSIDE_ACTIONS.has(action)) return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  const bookingId = cleanText(body.bookingId, 40);
  const about = cleanText(body.about, 120);

  // The owner looked into a day whose cash count was short or over and
  // accepts the difference as it stands (components/admin/CashCountReview).
  // On the record, so the task clears and anyone can see who decided.
  if (action === "day.count_reviewed") {
    if (!can(actingStaff()?.role, "activity.viewAll")) {
      return NextResponse.json({ success: false, error: "Only the super admin can accept a cash difference." }, { status: 403 });
    }
    if (!isDateStr(body.date)) return NextResponse.json({ success: false, error: "Which day?" }, { status: 400 });
    const note = cleanText(body.note, 300);
    const diff = Number(body.difference) || 0;
    await logActivity({
      actor: "Admin", action, entity: "daily_closing", entityId: body.date,
      summary: `Reviewed the cash count for ${body.date}: accepted ${diff >= 0 ? "over" : "short"} by ${fmt(Math.abs(diff))}${note ? `. Note: ${note}` : "."}`,
      details: { difference: diff, note },
    });
    return NextResponse.json({ success: true });
  }

  try {
    const { data } = await getSupabaseAdmin().from("bookings").select("*").eq("id", bookingId).maybeSingle();
    const b = data ? rowToBooking(data as BookingRow) : null;
    await logActivity({
      actor: "Admin", action, bookingId: b?.id ?? null, entity: "booking", entityId: bookingId,
      summary: `Opened a text message to ${b ? `${b.name} (${b.contact})` : bookingId}${about ? ` about ${about}` : ""}.`,
      details: { about },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/activity POST]", err);
    return NextResponse.json({ success: false, error: "Could not record it." }, { status: 500 });
  }
}
