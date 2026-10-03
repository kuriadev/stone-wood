// ── POST /api/bookings/[id]/rebook → the guest picks a new date      (guest)
//
// Body: { date, email? | t? }
//
// Only for a booking the RESORT cancelled, while the guest's choice is
// still open. The resort caused it, so there is no approval step: if the
// date is free the booking moves there and is confirmed at once, with the
// payment carried over.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { loadGuestBooking, checkMove, moveBooking, guestLinkFor, sweepExpired } from "@/lib/rebooking.server";
import { choiceOpen } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = rateLimit(req, { name: "booking-rebook", limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = String(body.date ?? "");

  try {
    await sweepExpired(true);
    const b = await loadGuestBooking(id, { email: body.email as string, token: body.t as string });
    if (!b) return NextResponse.json({ success: false, error: "No booking found for those details." }, { status: 404 });
    if (!choiceOpen(b)) {
      return NextResponse.json({
        success: false,
        error: b.status === "Cancelled" && b.refundStatus
          ? "The time to choose a new date has passed, so your refund is being arranged."
          : "This booking can't be moved this way.",
      }, { status: 409 });
    }

    const check = await checkMove(b, date);
    if (!check.ok) return NextResponse.json({ success: false, error: check.error }, { status: 409 });

    const now = new Date().toISOString();
    const oldDate = b.date;
    const saved = await moveBooking(b, date, { status: "Confirmed", confirmed_at: now, choice_deadline: null, held_amount: 0 });
    if (!saved) return NextResponse.json({ success: false, error: "Your booking just changed. Refresh and try again." }, { status: 409 });

    await getSupabaseAdmin().from("date_change_requests").insert({
      booking_id: saved.id, from_date: oldDate, to_date: date, requested_by: "Resort",
      status: "Approved", decided_at: now, note: "Picked by the guest after the resort cancelled.",
    });

    const link = guestLinkFor(saved);
    const n = notices.rebooked(saved, oldDate, link);
    if (saved.email) await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `rebooked ${saved.id}`);
    await logActivity({
      actor: "Guest", action: "booking.rebooked", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: `${saved.name} picked a new date after the resort cancelled: ${fmtDate(oldDate)} → ${fmtDate(date)}. Confirmed.`,
      details: { from: oldDate, to: date },
    });

    return NextResponse.json({ success: true, booking: saved });
  } catch (err) {
    console.error("[/api/bookings/[id]/rebook POST]", err);
    return NextResponse.json({ success: false, error: "Could not move your booking. Please try again." }, { status: 500 });
  }
}
