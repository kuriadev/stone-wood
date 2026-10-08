// ── POST  /api/payments      → record money received        (admin only)
// ── PATCH /api/payments?id=  → void a payment, with a reason (admin only)
//
// Payments are never edited or deleted. A wrong entry is voided and stays
// visible in the ledger with the reason, which is what makes the record
// trustworthy for the owner (and defensible to anyone auditing it).
//
// A Refund on a booking whose refund is OWED (the resort cancelled and the
// guest chose a refund, or didn't choose in time) completes that refund
// once the full amount is sent: the booking shows "Refund sent" with the
// date, reference and an optional receipt photo (`receipt`, a data URL) on
// the guest's own page, and the guest is emailed. The response carries the
// text message and link for "Text the guest".
//
// Every amount is checked against the booking's real balance, loaded here
// from the database: a balance payment cannot exceed what is still owed, a
// penalty payment cannot exceed the unpaid penalty, and a refund cannot
// exceed what was paid.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToPayment } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { parseAmount, cleanText } from "@/lib/money";
import { fmt, fmtDate } from "@/lib/utils";
import { logActivity } from "@/lib/activity.server";
import { guestLinkFor, chooseRefund } from "@/lib/rebooking.server";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { MANUAL_METHODS, type PaymentType } from "@/types/finance";
import type { PaymentRow } from "@/types/database";

export const dynamic = "force-dynamic";

const TYPES: PaymentType[] = ["Downpayment", "Balance", "Full", "Penalty", "Refund"];

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });

  const bookingId = cleanText(body.bookingId, 40);
  const type = body.type as PaymentType;
  const method = body.method as (typeof MANUAL_METHODS)[number];
  const amount = parseAmount(body.amount);

  if (!bookingId) return NextResponse.json({ success: false, error: "Choose the booking this payment is for." }, { status: 400 });
  if (!TYPES.includes(type)) return NextResponse.json({ success: false, error: "Unknown payment type." }, { status: 400 });
  if (!MANUAL_METHODS.includes(method)) return NextResponse.json({ success: false, error: "Choose Cash, GCash or Bank Transfer." }, { status: 400 });
  if (amount === null) return NextResponse.json({ success: false, error: "Enter an amount greater than zero." }, { status: 400 });
  if (method !== "Cash" && !cleanText(body.reference, 80)) {
    return NextResponse.json({ success: false, error: `Enter the ${method} reference number.` }, { status: 400 });
  }

  try {
    const ledger = await loadBookingLedger(bookingId);
    if (!ledger) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    const { booking, money } = ledger;

    if (type === "Penalty") {
      if (amount > money.penaltyDue) {
        return NextResponse.json({ success: false, error: `Only ${fmt(money.penaltyDue)} in penalties is unpaid.` }, { status: 409 });
      }
    } else if (type === "Refund") {
      if (amount > money.paid) {
        return NextResponse.json({ success: false, error: `Only ${fmt(money.paid)} has been paid, so that is the most that can be refunded.` }, { status: 409 });
      }
    } else {
      if (booking.status === "Cancelled" || booking.status === "ResortCancelled") {
        return NextResponse.json({ success: false, error: "This booking is cancelled. Nothing more is owed on it." }, { status: 409 });
      }
      if (amount > money.balance) {
        return NextResponse.json({ success: false, error: `Only ${fmt(money.balance)} is still owed on this booking.` }, { status: 409 });
      }
    }

    const received = typeof body.receivedAt === "string" && !Number.isNaN(Date.parse(body.receivedAt))
      ? new Date(body.receivedAt).toISOString()
      : new Date().toISOString();
    // Money can't arrive on a day that hasn't happened: it would sit in a
    // future day's report and cash count. (A few minutes' leeway covers a
    // device clock that runs slightly fast.)
    if (Date.parse(received) > Date.now() + 10 * 60_000) {
      return NextResponse.json({ success: false, error: "A payment can't be dated in the future." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin().from("payments").insert({
      booking_id: booking.id,
      guest_name: booking.name,
      type,
      method,
      amount,
      reference: cleanText(body.reference, 80),
      notes: cleanText(body.notes, 300),
      received_at: received,
    }).select().single();
    if (error) throw new Error(error.message);

    // A walk-in saved as "not yet paid" becomes a real reservation once
    // money is in: the same rule the old checkbox applied, now driven by
    // the ledger instead of a flag.
    if (booking.status === "Pending" && booking.source === "Walk-In" && type !== "Refund" && type !== "Penalty") {
      await getSupabaseAdmin().from("bookings")
        .update({ status: "Confirmed", payment_proof: true })
        .eq("id", booking.id).eq("status", "Pending");
    }

    // A group already checked out that pays off the rest here (from Sales →
    // Receivables or Bookings) is done: complete it, as Settle would have,
    // rather than leave it under "To settle" with nothing owed.
    let completed = false;
    if (booking.status === "Confirmed" && booking.checkedOutAt && type !== "Refund") {
      const after = await loadBookingLedger(booking.id);
      if (after && after.money.due <= 0) {
        const done = await getSupabaseAdmin().from("bookings")
          .update({ status: "Completed", payment_proof: true, settled_at: new Date().toISOString(), settlement_note: "" })
          .eq("id", booking.id).eq("status", "Confirmed").select("id").maybeSingle();
        completed = !!done.data;
      }
    }

    // ── A refund the resort owed ───────────────────────────────────
    const reference = cleanText(body.reference, 80);
    let refundDone = false;
    let guestLink: string | undefined;
    let sms: string | undefined;
    /* A refund recorded straight onto a booking the resort cancelled means
       the guest chose a refund: close the booking first (chooseRefund), so
       it stops saying the money is held and stops offering a new date, then
       finish it below like any refund owed. */
    let refundOf = booking;
    if (type === "Refund" && booking.status === "ResortCancelled") {
      const chosen = await chooseRefund(booking, { notify: false });
      if (chosen.ok) refundOf = chosen.booking;
    }
    if (type === "Refund" && refundOf.refundStatus === "Owed") {
      const after = await loadBookingLedger(refundOf.id);
      const refunded = (after?.payments ?? []).filter((p) => p.type === "Refund" && !p.voided).reduce((s, p) => s + p.amount, 0);
      const receipt = typeof body.receipt === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(body.receipt) && body.receipt.length <= 2_000_000
        ? body.receipt : null;
      refundDone = refunded >= (refundOf.refundAmount ?? 0);
      const patch: Record<string, unknown> = {};
      if (refundDone) Object.assign(patch, { refund_status: "Sent", refund_sent_at: new Date().toISOString() });
      if (receipt) patch.refund_receipt = receipt;
      if (Object.keys(patch).length) await getSupabaseAdmin().from("bookings").update(patch).eq("id", refundOf.id);
      if (refundDone) {
        guestLink = guestLinkFor(refundOf);
        const n = notices.refundSent(refundOf, refunded, method, reference, guestLink);
        sms = n.sms;
        if (refundOf.email) await trySendMail({ to: refundOf.email, ...buildNoticeEmail(n.email) }, `refund-sent ${refundOf.id}`);
      }
    }

    await logActivity({
      actor: "Admin",
      action: type === "Refund" ? (refundDone ? "refund.sent" : "payment.refund") : "payment.recorded",
      bookingId: booking.id, entity: "payment", entityId: (data as PaymentRow).id,
      summary: type === "Refund"
        ? `Refunded ${fmt(amount)} to ${booking.name} (${booking.id}) by ${method}${reference ? `, ref ${reference}` : ""}.${refundDone ? " The refund owed is now fully sent." : ""}`
        : `Recorded ${fmt(amount)} ${type.toLowerCase()} from ${booking.name} (${booking.id}, ${fmtDate(booking.date)}) by ${method}${reference ? `, ref ${reference}` : ""}.${completed ? " Nothing is owed now, so the booking is completed." : ""}`,
      details: { type, method, amount, reference, completed },
    });

    return NextResponse.json({ success: true, payment: rowToPayment(data as PaymentRow), completed, refundDone, guestLink, sms }, { status: 201 });
  } catch (err) {
    console.error("[/api/payments POST]", err);
    return NextResponse.json({ success: false, error: "Could not record the payment." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A payment id is required." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = cleanText(body.reason, 300);
  if (reason.length < 3) return NextResponse.json({ success: false, error: "Say why this payment is being voided." }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin().from("payments")
      .update({ voided: true, void_reason: reason, voided_at: new Date().toISOString() })
      .eq("id", id).eq("voided", false)
      .select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That payment is already voided or does not exist." }, { status: 409 });
    const p = rowToPayment(data as PaymentRow);
    await logActivity({
      actor: "Admin", action: "payment.voided", bookingId: p.bookingId ?? null, entity: "payment", entityId: p.id,
      summary: `Voided a ${fmt(p.amount)} ${p.type.toLowerCase()} (${p.method}) from ${p.guestName || "a guest"}. Reason: ${reason}`,
      details: { amount: p.amount, type: p.type, method: p.method, reference: p.reference, reason },
    });
    return NextResponse.json({ success: true, payment: p });
  } catch (err) {
    console.error("[/api/payments PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not void the payment." }, { status: 500 });
  }
}
