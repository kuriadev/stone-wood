// ── POST /api/bookings/[id]/resort-cancel → the resort can't host it  (admin)
//
// Body: { reason }
//
// For an emergency, bad weather, a repair: any time until the group checks
// in, whatever the guest has paid. The booking becomes "ResortCancelled":
// its date is freed at once, what the guest paid stays with the booking,
// and the guest has GUEST_CHOICE_DAYS to pick a new date (confirmed at
// once, no approval) or ask for a refund. No answer by then means a refund
// is owed (see sweepExpired). The guest is never simply told "rejected".
//
// The guest is emailed here. The response also carries the text message
// and the link to their booking page, so the owner can text them with one
// tap from the admin.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { cleanText } from "@/lib/money";
import { guestLinkFor } from "@/lib/rebooking.server";
import { GUEST_CHOICE_DAYS } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmt, fmtDate } from "@/lib/utils";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = cleanText(body.reason, 300) || "Due to circumstances at the resort, we can no longer host your booking on that date.";

  try {
    const ledger = await loadBookingLedger(id);
    if (!ledger) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    const { booking: b, money } = ledger;
    if (b.status !== "Pending" && b.status !== "Confirmed") {
      return NextResponse.json({ success: false, error: b.status === "ResortCancelled" ? "This booking is already cancelled and waiting for the guest." : `This booking is already ${b.status.toLowerCase()}.` }, { status: 409 });
    }
    if (b.checkedInAt) {
      return NextResponse.json({ success: false, error: "This group is already checked in. Check them out instead of cancelling." }, { status: 409 });
    }

    const held = Math.max(0, money.paid);
    const now = new Date();
    const deadline = new Date(now.getTime() + GUEST_CHOICE_DAYS * 86_400_000).toISOString();
    const db = getSupabaseAdmin();

    const { data, error } = await db.from("bookings").update({
      status: "ResortCancelled",
      cancel_reason: reason,
      cancelled_at: now.toISOString(),
      choice_deadline: deadline,
      held_amount: held,
    }).eq("id", b.id).eq("status", b.status).is("checked_in_at", null).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "This booking just changed. Refresh and try again." }, { status: 409 });
    const saved = rowToBooking(data as BookingRow);

    // A date change the guest had asked for no longer applies.
    await db.from("date_change_requests")
      .update({ status: "Declined", decided_at: now.toISOString(), note: "The resort cancelled the booking." })
      .eq("booking_id", b.id).eq("status", "Pending");

    const link = guestLinkFor(saved);
    const n = notices.resortCancelled(saved, reason, link, deadline, held);
    const emailed = saved.email
      ? await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `resort-cancel ${saved.id}`)
      : false;

    await logActivity({
      actor: "Admin", action: "booking.cancelled_by_resort", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: `Cancelled ${saved.id} (${saved.name}, ${fmtDate(b.date)}): the resort can't host it. ${held > 0 ? `${fmt(held)} held while the guest chooses a new date or a refund.` : "Nothing was paid; the guest can still pick a new date."}`,
      details: { reason, held, deadline, emailed, previousStatus: b.status },
    });

    return NextResponse.json({ success: true, booking: saved, guestLink: link, sms: n.sms, emailed });
  } catch (err) {
    console.error("[/api/bookings/[id]/resort-cancel POST]", err);
    return NextResponse.json({ success: false, error: "Could not cancel the booking." }, { status: 500 });
  }
}
