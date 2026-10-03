// ── POST /api/bookings/[id]/date-change → the guest asks to move     (guest)
//
// Body: { date, email? | t? }
//
// The guest picks a free date themselves; the owner approves or declines
// it (PATCH /api/date-changes). Until then the booking stays on its date
// and the new one is HELD for HOLD_HOURS, so nobody else can take it while
// the owner decides. Rules:
//
//   • a confirmed booking, not checked in, before the day of the visit
//   • one change per booking (GUEST_CHANGES_ALLOWED), one request at a time
//   • the new date must be free under the same rules as a new booking

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToDateChange } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { loadGuestBooking, checkMove, guestLinkFor, sweepExpired } from "@/lib/rebooking.server";
import { HOLD_HOURS, GUEST_CHANGES_ALLOWED } from "@/lib/rebooking";
import { manilaDate } from "@/lib/finance";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmtDate } from "@/lib/utils";
import type { DateChangeRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = rateLimit(req, { name: "booking-date-change", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = String(body.date ?? "");
  const no = (error: string, status = 409) => NextResponse.json({ success: false, error }, { status });

  try {
    await sweepExpired(true);
    const b = await loadGuestBooking(id, { email: body.email as string, token: body.t as string });
    if (!b) return no("No booking found for those details.", 404);
    if (b.status !== "Confirmed") return no("Only a confirmed booking can be moved.");
    if (b.checkedInAt || b.date <= manilaDate()) return no("Date changes close on the day of your visit. Please contact the resort.");

    const db = getSupabaseAdmin();
    const { data: past, error: pastErr } = await db.from("date_change_requests").select("*").eq("booking_id", b.id);
    if (pastErr) throw new Error(pastErr.message);
    const requests = (past as DateChangeRow[]).map(rowToDateChange);
    if (requests.some((r) => r.status === "Pending")) return no("You already have a date change waiting for the resort's answer.");
    const used = requests.filter((r) => r.requestedBy === "Guest" && r.status === "Approved").length;
    if (used >= GUEST_CHANGES_ALLOWED) return no("This booking's date has already been changed once. Please contact the resort.");

    const check = await checkMove(b, date);
    if (!check.ok) return no(check.error);

    const holdUntil = new Date(Date.now() + HOLD_HOURS * 3_600_000).toISOString();
    const { data, error } = await db.from("date_change_requests").insert({
      booking_id: b.id, from_date: b.date, to_date: date, requested_by: "Guest", status: "Pending", hold_until: holdUntil,
    }).select().single();
    if (error) {
      if (error.code === "23505") return no("You already have a date change waiting for the resort's answer.");
      throw new Error(error.message);
    }
    const request = rowToDateChange(data as DateChangeRow);

    if (b.email) {
      const n = notices.dateChangeRequested(b, date, holdUntil, guestLinkFor(b));
      await trySendMail({ to: b.email, ...buildNoticeEmail(n.email) }, `date-change-requested ${b.id}`);
    }
    await logActivity({
      actor: "Guest", action: "date_change.requested", bookingId: b.id, entity: "date_change", entityId: request.id,
      summary: `${b.name} asked to move ${b.id} from ${fmtDate(b.date)} to ${fmtDate(date)}. Date held for ${HOLD_HOURS} hours.`,
      details: { from: b.date, to: date, holdUntil },
    });

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (err) {
    console.error("[/api/bookings/[id]/date-change POST]", err);
    return NextResponse.json({ success: false, error: "Could not send your request. Please try again." }, { status: 500 });
  }
}
