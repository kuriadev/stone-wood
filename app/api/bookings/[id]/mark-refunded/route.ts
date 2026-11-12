// ── POST /api/bookings/[id]/mark-refunded { method, note? }   (staff: bookings.refunded)
//
// Refunds are not sent through the system. They happen only when the
// RESORT cancelled, and they are agreed between the guest and the owner or
// front desk by call or chat, who then return the money themselves. This
// marks the booking refunded once that is done:
//
//   • a booking the resort cancelled is closed (the guest can no longer pick
//     a new date, and any date they had picked is withdrawn: chooseRefund);
//   • one refund line is saved for what they paid, with how it went back
//     (cash or GCash) and no reference or receipt, so Reports and Sales stop
//     counting that money as kept, and a cash refund comes out of the drawer;
//   • the booking reads "Refunded", and the guest gets a short email.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { chooseRefund, guestLinkFor } from "@/lib/rebooking.server";
import { loadBookingLedger } from "@/lib/ledger.server";
import { cleanText } from "@/lib/money";
import { round2 } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import { logActivity } from "@/lib/activity.server";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { MANUAL_METHODS } from "@/types/finance";
import type { Booking } from "@/types/booking";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Method = (typeof MANUAL_METHODS)[number];

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requirePermission(req, "bookings.refunded");
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const method = body.method as Method;
  if (!MANUAL_METHODS.includes(method)) return NextResponse.json({ success: false, error: "Say how the money went back: cash or an online transaction." }, { status: 400 });
  const note = cleanText(body.note, 300);

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    let booking: Booking = rowToBooking(data as BookingRow);

    // A refund is only ever for a booking the resort cancelled.
    if (booking.status === "ResortCancelled") {
      const chosen = await chooseRefund(booking, { notify: false });
      if (!chosen.ok) return NextResponse.json({ success: false, error: chosen.error }, { status: 409 });
      booking = chosen.booking;
    } else if (booking.refundStatus !== "Owed") {
      return NextResponse.json({
        success: false,
        error: booking.refundStatus === "Sent" ? "This booking is already marked refunded." : "Only a booking the resort cancelled can be refunded.",
      }, { status: 409 });
    }

    const ledger = await loadBookingLedger(booking.id);
    const refunded = (ledger?.payments ?? []).filter((p) => p.type === "Refund" && !p.voided).reduce((s, p) => s + p.amount, 0);
    const amount = round2(Math.max(0, (booking.refundAmount ?? 0) - refunded));
    const now = new Date().toISOString();

    if (amount > 0) {
      const ins = await db.from("payments").insert({
        booking_id: booking.id, guest_name: booking.name, type: "Refund", method, amount,
        reference: "", notes: note || "Refund arranged with the guest (resort cancellation).", received_at: now,
      });
      if (ins.error) throw new Error(ins.error.message);
    }
    const upd = await db.from("bookings").update({ refund_status: amount > 0 || refunded > 0 ? "Sent" : null, refund_sent_at: now })
      .eq("id", booking.id).select().maybeSingle();
    if (upd.error) throw new Error(upd.error.message);
    const saved = upd.data ? rowToBooking(upd.data as BookingRow) : booking;

    if (amount > 0 && saved.email) {
      const n = notices.refundSent(saved, round2(refunded + amount), guestLinkFor(saved));
      await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `refund-marked ${saved.id}`);
    }
    await logActivity({
      actor: "Admin", action: "refund.marked", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: amount > 0
        ? `Marked ${saved.id} refunded: ${fmt(amount)} returned to ${saved.name} ${method === "Cash" ? "in cash" : "by online transaction"}, as agreed with them.${note ? ` Note: ${note}` : ""}`
        : `Marked ${saved.id} refunded. Nothing was paid, so nothing was returned.`,
      details: { amount, method, note },
    });
    return NextResponse.json({ success: true, booking: saved, amount });
  } catch (err) {
    console.error("[/api/bookings/[id]/mark-refunded POST]", err);
    return NextResponse.json({ success: false, error: "Could not mark the booking refunded." }, { status: 500 });
  }
}
