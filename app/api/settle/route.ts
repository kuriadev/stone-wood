// ── POST /api/settle → per-booking liquidation + final payment   (admin only)
//
// Step 2 of the end of a stay, after /api/checkout has inspected the
// facilities. Body:
//
//   { bookingId,
//     payment?:     { amount, method, reference },   money handed over now
//     closeUnpaid?: boolean,                          settle anyway…
//     note?:        string }                          …and say why
//
// The payment is split on the server: the stay balance is paid first, then
// the damage penalties, each as its own ledger row so Sales reports them
// apart. The booking is then Completed when nothing is owed, or when the
// owner closes it with the unpaid amount written down (it stays a
// receivable in Sales). Otherwise the payment is kept and the booking
// waits in "To settle" for the rest.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { cleanText, parseAmount } from "@/lib/money";
import { round2 } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import { MANUAL_METHODS } from "@/types/finance";

export const dynamic = "force-dynamic";

type Method = (typeof MANUAL_METHODS)[number];

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bookingId = cleanText(b?.bookingId, 40);
  if (!b || !bookingId) return NextResponse.json({ success: false, error: "Choose a booking." }, { status: 400 });

  let pay: { amount: number; method: Method; reference: string } | null = null;
  if (b.payment && typeof b.payment === "object") {
    const x = b.payment as Record<string, unknown>;
    const amount = parseAmount(x.amount);
    if (amount !== null) {
      if (!MANUAL_METHODS.includes(x.method as Method)) {
        return NextResponse.json({ success: false, error: "Choose Cash, GCash or Bank Transfer." }, { status: 400 });
      }
      const reference = cleanText(x.reference, 80);
      if (x.method !== "Cash" && !reference) {
        return NextResponse.json({ success: false, error: `Enter the ${x.method} reference number.` }, { status: 400 });
      }
      pay = { amount, method: x.method as Method, reference };
    }
  }
  const closeUnpaid = !!b.closeUnpaid;
  const note = cleanText(b.note, 300);

  try {
    const db = getSupabaseAdmin();
    const ledger = await loadBookingLedger(bookingId);
    if (!ledger) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    const { booking, money } = ledger;
    if (booking.status !== "Confirmed") {
      return NextResponse.json({ success: false, error: `This booking is already ${booking.status.toLowerCase()}.` }, { status: 409 });
    }
    if (!booking.checkedOutAt) {
      return NextResponse.json({ success: false, error: "Check the group out (inspect the facilities) before settling." }, { status: 409 });
    }

    const owed = round2(money.balance + money.penaltyDue);
    if (pay && pay.amount > owed) {
      return NextResponse.json({ success: false, error: `Only ${fmt(owed)} is owed on this booking.` }, { status: 409 });
    }
    const paidNow = pay?.amount ?? 0;
    const leftOwing = round2(owed - paidNow);
    const completing = leftOwing <= 0 || closeUnpaid;
    if (leftOwing > 0 && closeUnpaid && note.length < 3) {
      return NextResponse.json({ success: false, error: "Say why the booking is being settled with money still owed." }, { status: 400 });
    }
    if (!pay && !completing) {
      return NextResponse.json({ success: false, error: `${fmt(leftOwing)} is still owed. Record a payment, or settle it as unpaid with a reason.` }, { status: 400 });
    }

    // ── Writes ───────────────────────────────────────────────────────
    const now = new Date().toISOString();
    let paymentIds: number[] = [];
    try {
      if (pay) {
        const toBalance = round2(Math.min(pay.amount, money.balance));
        const toPenalty = round2(pay.amount - toBalance);
        const rows = [];
        if (toBalance > 0) {
          rows.push({
            booking_id: booking.id, guest_name: booking.name,
            type: money.paid <= 0 && toBalance >= money.balance ? "Full" : "Balance",
            method: pay.method, amount: toBalance, reference: pay.reference,
            notes: "Final payment at settlement.", received_at: now,
          });
        }
        if (toPenalty > 0) {
          rows.push({
            booking_id: booking.id, guest_name: booking.name, type: "Penalty",
            method: pay.method, amount: toPenalty, reference: pay.reference,
            notes: "Damage penalty paid at settlement.", received_at: now,
          });
        }
        const p = await db.from("payments").insert(rows).select("id");
        if (p.error) throw new Error(p.error.message);
        paymentIds = (p.data as { id: number }[]).map((x) => x.id);
      }

      if (completing) {
        const done = await db.from("bookings")
          .update({ status: "Completed", payment_proof: true, settled_at: now, settlement_note: leftOwing > 0 ? note : "" })
          .eq("id", booking.id).eq("status", "Confirmed").select("id").maybeSingle();
        if (done.error) throw new Error(done.error.message);
        if (!done.data) throw new Error("booking changed while settling");
      }
    } catch (writeErr) {
      // The booking update is the last write: if it failed, take this
      // settlement's payments back out so a retry doesn't record them twice.
      if (paymentIds.length) await db.from("payments").delete().in("id", paymentIds);
      throw writeErr;
    }

    await logActivity({
      actor: "Admin", action: completing ? "stay.settled" : "payment.recorded", bookingId: booking.id, entity: "booking", entityId: booking.id,
      summary: completing
        ? `Settled ${booking.name} (${booking.id})${paidNow > 0 ? `, collecting ${fmt(paidNow)} by ${pay?.method}` : ""}. ${leftOwing > 0 ? `Completed with ${fmt(leftOwing)} unpaid: ${note}` : "Completed, fully paid."}`
        : `Collected ${fmt(paidNow)} from ${booking.name} (${booking.id}) by ${pay?.method}; ${fmt(leftOwing)} still owed.`,
      details: { collected: paidNow, method: pay?.method ?? null, reference: pay?.reference ?? "", leftOwing: Math.max(0, leftOwing), note },
    });
    return NextResponse.json({ success: true, completed: completing, collected: round2(paidNow), leftOwing: Math.max(0, leftOwing) });
  } catch (err) {
    console.error("[/api/settle POST]", err);
    return NextResponse.json({ success: false, error: "Could not settle the booking. Nothing was recorded — try again." }, { status: 500 });
  }
}
