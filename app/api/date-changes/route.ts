// ── PATCH /api/date-changes?id= → approve or decline a guest's request (admin)
//
// Body: { action: "approve" | "decline", note? }
//
// Approve: the new date is checked again (it was held, but the owner may
// have closed it or put the pool under maintenance since), the booking
// moves, its preparation checklist resets, and the guest is told.
// Decline: the booking stays where it was; the note is what the guest reads.
//
// A request whose 48-hour hold ran out can't be approved: the date wasn't
// kept for the guest, so they ask again (it doesn't use up their change).
//
// The same queue holds a REBOOK: the date a guest picked after the resort
// cancelled on them (POST /api/bookings/[id]/rebook). Approving it moves the
// booking AND confirms it again; declining it (or a hold that runs out)
// leaves it cancelled and gives the guest a fresh window to pick another
// date (reopenChoice). Its old date has usually passed, which is fine: the
// visit was called off, so only the new date matters.
//
// The response carries the guest's text message and link, for "Text the
// guest".

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, rowToDateChange } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { cleanText } from "@/lib/money";
import { checkMove, moveBooking, guestLinkFor, reopenChoice } from "@/lib/rebooking.server";
import { holdActive, isRebookRequest, fmtDeadline, REBOOK_NOTE } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmtDate } from "@/lib/utils";
import { manilaDate } from "@/lib/finance";
import type { BookingRow, DateChangeRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A request id is required." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const approve = body.action === "approve";
  if (!approve && body.action !== "decline") return NextResponse.json({ success: false, error: "Approve or decline." }, { status: 400 });
  const note = cleanText(body.note, 300);
  const no = (error: string, status = 409) => NextResponse.json({ success: false, error }, { status });

  try {
    const db = getSupabaseAdmin();
    const r = await db.from("date_change_requests").select("*").eq("id", id).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) return no("That request no longer exists.", 404);
    const request = rowToDateChange(r.data as DateChangeRow);
    if (request.status !== "Pending") return no(`This request is already ${request.status.toLowerCase()}.`);

    const bk = await db.from("bookings").select("*").eq("id", request.bookingId).maybeSingle();
    if (bk.error) throw new Error(bk.error.message);
    if (!bk.data) return no("That booking no longer exists.", 404);
    const b = rowToBooking(bk.data as BookingRow);
    const now = new Date().toISOString();
    const rebook = isRebookRequest(request, b);

    if (approve && !holdActive(request)) {
      await db.from("date_change_requests").update({ status: "Expired", decided_at: now }).eq("id", id).eq("status", "Pending");
      if (rebook) await reopenChoice(b.id);
      return no(rebook
        ? "The 48-hour hold ran out, so the date wasn't kept. The guest can pick a date again from their booking page."
        : "The 48-hour hold ran out, so the date wasn't kept. Ask the guest to request it again.");
    }

    if (!approve && rebook) {
      const done = await db.from("date_change_requests").update({ status: "Declined", decided_at: now, note })
        .eq("id", id).eq("status", "Pending").select("id").maybeSingle();
      if (!done.data) return no("This request just changed. Refresh and try again.");
      const reopened = await reopenChoice(b.id);
      if (!reopened?.choiceDeadline) return no("This booking just changed. Refresh and try again.");
      const link = guestLinkFor(reopened);
      const n = notices.rebookDeclined(reopened, request.toDate, note, reopened.choiceDeadline, link);
      if (reopened.email) await trySendMail({ to: reopened.email, ...buildNoticeEmail(n.email) }, `rebook-declined ${reopened.id}`);
      await logActivity({
        actor: "Admin", action: "date_change.declined", bookingId: b.id, entity: "date_change", entityId: id,
        summary: `Declined ${fmtDate(request.toDate)} for ${b.name} (${b.id}, cancelled by the resort). They can pick another date until ${fmtDeadline(reopened.choiceDeadline)}.${note ? ` Reason: ${note}` : ""}`,
        details: { from: request.fromDate, to: request.toDate, note, rebook: true },
      });
      return NextResponse.json({ success: true, guestLink: link, sms: n.sms });
    }

    if (!approve) {
      const done = await db.from("date_change_requests").update({ status: "Declined", decided_at: now, note })
        .eq("id", id).eq("status", "Pending").select("id").maybeSingle();
      if (!done.data) return no("This request just changed. Refresh and try again.");
      const link = guestLinkFor(b);
      const n = notices.dateChangeDeclined(b, request.toDate, note, link);
      if (b.email) await trySendMail({ to: b.email, ...buildNoticeEmail(n.email) }, `date-change-declined ${b.id}`);
      await logActivity({
        actor: "Admin", action: "date_change.declined", bookingId: b.id, entity: "date_change", entityId: id,
        summary: `Declined ${b.name}'s request to move ${b.id} to ${fmtDate(request.toDate)}.${note ? ` Reason: ${note}` : ""}`,
        details: { from: request.fromDate, to: request.toDate, note },
      });
      return NextResponse.json({ success: true, guestLink: link, sms: n.sms });
    }

    if (rebook) {
      if (b.checkedInAt) return no("This booking can no longer be moved.");
      const check = await checkMove(b, request.toDate);
      if (!check.ok) return no(`${check.error} Decline it and the guest can pick another date.`);
      const saved = await moveBooking(b, request.toDate, { status: "Confirmed", confirmed_at: now, choice_deadline: null, held_amount: 0 });
      if (!saved) return no("This booking just changed. Refresh and try again.");
      await db.from("date_change_requests").update({ status: "Approved", decided_at: now, note: REBOOK_NOTE }).eq("id", id);

      const link = guestLinkFor(saved);
      const n = notices.rebooked(saved, request.fromDate, link);
      if (saved.email) await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `rebooked ${saved.id}`);
      await logActivity({
        actor: "Admin", action: "booking.rebooked", bookingId: saved.id, entity: "date_change", entityId: id,
        summary: `Approved ${saved.name}'s new date after the resort cancelled: ${fmtDate(request.fromDate)} → ${fmtDate(request.toDate)}. ${saved.id} is confirmed again.`,
        details: { from: request.fromDate, to: request.toDate, rebook: true },
      });
      return NextResponse.json({ success: true, booking: saved, guestLink: link, sms: n.sms });
    }

    if (b.status !== "Confirmed" || b.checkedInAt) return no("This booking can no longer be moved.");
    /* The same cut-off the guest route enforces, applied here too.
       A request made the evening before a visit holds its date for 48 hours,
       so the hold can still be live a day AFTER the visit was due. Without
       this, approving such a request would move a booking whose date had
       already come and gone -- a no-show quietly becoming a future booking.
       The guest is told "date changes close on the day of your visit"; this
       makes that true no matter who is clicking. */
    if (b.date <= manilaDate()) {
      return no("That visit date has already passed, so this booking can no longer be moved. Decline the request and book them in again if they still want to come.");
    }
    const check = await checkMove(b, request.toDate);
    if (!check.ok) return no(`${check.error} Decline the request and let the guest pick another date.`);

    const saved = await moveBooking(b, request.toDate);
    if (!saved) return no("This booking just changed. Refresh and try again.");
    await db.from("date_change_requests").update({ status: "Approved", decided_at: now, note }).eq("id", id);

    const link = guestLinkFor(saved);
    const n = notices.dateChangeApproved(saved, request.fromDate, link);
    if (saved.email) await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `date-change-approved ${saved.id}`);
    await logActivity({
      actor: "Admin", action: "date_change.approved", bookingId: saved.id, entity: "date_change", entityId: id,
      summary: `Moved ${saved.id} (${saved.name}) from ${fmtDate(request.fromDate)} to ${fmtDate(request.toDate)}, as the guest asked.`,
      details: { from: request.fromDate, to: request.toDate },
    });
    return NextResponse.json({ success: true, booking: saved, guestLink: link, sms: n.sms });
  } catch (err) {
    console.error("[/api/date-changes PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update the request." }, { status: 500 });
  }
}
