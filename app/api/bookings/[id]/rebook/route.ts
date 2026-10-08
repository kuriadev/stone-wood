// ── POST /api/bookings/[id]/rebook → the guest picks a new date      (guest)
//
// Body: { date, email? | t? }
//
// Only for a booking the RESORT cancelled, while the guest's choice is
// still open. The pick is a REQUEST, not a move: the date is held for
// HOLD_HOURS and lands in Daily Operations → Reschedules for the owner to
// approve (PATCH /api/date-changes), so the owner always knows what is
// moving where. This used to confirm the new date at once, which put
// bookings on the calendar that the owner had never seen.
//
// While the request waits the guest's choice deadline is cleared, so the
// sweep can't cancel the booking under them; a decline or an unanswered
// hold gives them a fresh window (reopenChoice).

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, rowToDateChange } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { loadGuestBooking, checkMove, guestLinkFor, sweepExpired } from "@/lib/rebooking.server";
import { choiceOpen, HOLD_HOURS, REBOOK_NOTE } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmtDate } from "@/lib/utils";
import type { BookingRow, DateChangeRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = rateLimit(req, { name: "booking-rebook", limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = String(body.date ?? "");
  const no = (error: string, status = 409) => NextResponse.json({ success: false, error }, { status });

  try {
    await sweepExpired(true);
    const b = await loadGuestBooking(id, { email: body.email as string, token: body.t as string });
    if (!b) return no("No booking found for those details.", 404);
    if (!choiceOpen(b)) {
      if (b.status !== "ResortCancelled") return no("This booking can't be moved this way.");
      // Paused while a pick waits for the owner; otherwise the time ran out.
      const picked = await getSupabaseAdmin().from("date_change_requests").select("id")
        .eq("booking_id", b.id).eq("status", "Pending").maybeSingle();
      return no(picked.data
        ? "You've already picked a date. The resort will confirm it soon."
        : "The time to pick a date here has passed. Please call or message the resort and they'll set a new date with you.");
    }

    const check = await checkMove(b, date);
    if (!check.ok) return no(check.error);

    const db = getSupabaseAdmin();
    const holdUntil = new Date(Date.now() + HOLD_HOURS * 3_600_000).toISOString();
    const { data, error } = await db.from("date_change_requests").insert({
      booking_id: b.id, from_date: b.date, to_date: date, requested_by: "Resort",
      status: "Pending", hold_until: holdUntil, note: REBOOK_NOTE,
    }).select().single();
    if (error) {
      if (error.code === "23505") return no("You've already picked a date. The resort will confirm it soon.");
      throw new Error(error.message);
    }
    const request = rowToDateChange(data as DateChangeRow);

    // Pause the deadline. If the booking changed meanwhile (the owner moved
    // or closed it), withdraw the request rather than leave it orphaned.
    const paused = await db.from("bookings").update({ choice_deadline: null })
      .eq("id", b.id).eq("status", "ResortCancelled").select().maybeSingle();
    if (paused.error || !paused.data) {
      await db.from("date_change_requests").delete().eq("id", request.id);
      if (paused.error) throw new Error(paused.error.message);
      return no("Your booking just changed. Refresh and try again.");
    }
    const saved = rowToBooking(paused.data as BookingRow);

    if (saved.email) {
      const n = notices.rebookRequested(saved, date, holdUntil, guestLinkFor(saved));
      await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `rebook-requested ${saved.id}`);
    }
    await logActivity({
      actor: "Guest", action: "date_change.requested", bookingId: saved.id, entity: "date_change", entityId: request.id,
      summary: `${saved.name} picked ${fmtDate(date)} for ${saved.id} after the resort cancelled ${fmtDate(saved.date)}. Held for ${HOLD_HOURS} hours until you approve it.`,
      details: { from: saved.date, to: date, holdUntil, rebook: true },
    });

    return NextResponse.json({ success: true, request, booking: saved }, { status: 201 });
  } catch (err) {
    console.error("[/api/bookings/[id]/rebook POST]", err);
    return NextResponse.json({ success: false, error: "Could not send your new date. Please try again." }, { status: 500 });
  }
}
