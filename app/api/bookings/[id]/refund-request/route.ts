// ── POST /api/bookings/[id]/refund-request → refund, not a new date   (guest)
//
// Body: { email? | t? }
//
// For a booking the resort cancelled, while the guest's choice is open. The
// booking is cancelled and a refund of what they paid is OWED: it shows on
// the guest's booking page and on the owner's Daily Operations until the
// owner sends it and records the reference (see /api/payments, Refund).

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { loadGuestBooking, guestLinkFor, sweepExpired } from "@/lib/rebooking.server";
import { choiceOpen } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmt } from "@/lib/utils";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = rateLimit(req, { name: "booking-refund-request", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    await sweepExpired(true);
    const b = await loadGuestBooking(id, { email: body.email as string, token: body.t as string });
    if (!b) return NextResponse.json({ success: false, error: "No booking found for those details." }, { status: 404 });
    if (!choiceOpen(b)) return NextResponse.json({ success: false, error: "There's no open choice on this booking." }, { status: 409 });

    const held = b.heldAmount ?? 0;
    const { data, error } = await getSupabaseAdmin().from("bookings").update({
      status: "Cancelled", refund_status: held > 0 ? "Owed" : null, refund_amount: held, held_amount: 0,
    }).eq("id", b.id).eq("status", "ResortCancelled").select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Your booking just changed. Refresh and try again." }, { status: 409 });
    const saved = rowToBooking(data as BookingRow);

    if (held > 0 && saved.email) {
      const n = notices.refundRequested(saved, held, guestLinkFor(saved));
      await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `refund-requested ${saved.id}`);
    }
    await logActivity({
      actor: "Guest", action: "booking.refund_chosen", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: held > 0
        ? `${saved.name} chose a refund instead of a new date. ${fmt(held)} is owed.`
        : `${saved.name} chose not to rebook. Nothing was paid, so nothing is owed.`,
      details: { amount: held },
    });

    return NextResponse.json({ success: true, booking: saved });
  } catch (err) {
    console.error("[/api/bookings/[id]/refund-request POST]", err);
    return NextResponse.json({ success: false, error: "Could not record your choice. Please try again." }, { status: 500 });
  }
}
