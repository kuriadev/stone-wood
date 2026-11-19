// ── POST /api/payment-proofs/[id] → staff decide on a GCash receipt   (payments.record)
//
// Body: { action: "Downpayment" | "Full" | "Reject", reason? }
//
//   Downpayment  "Confirm partial payment": the 50% down payment arrived;
//                the rest is collected on arrival.
//   Full         "Confirm full payment": the whole total arrived.
//   Reject       the money can't be found or the receipt isn't right; the
//                guest is emailed to upload a new one, and the date stays
//                held while they do.
//
// Confirming records the money in the payments ledger (method GCash, the
// receipt's reference), confirms the booking and emails the guest their
// confirmation with the Booking ID.
//
// When the guest cancelled before staff checked the receipt, the booking
// stays Cancelled and only the money is settled (owner's rule, 2026-11-19):
//
//   Kept         the money arrived: it is recorded as received and kept
//                under the no-refund policy (the booking reads "Forfeited")
//   NoPayment    nothing arrived: the receipt is closed, nothing recorded

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requirePermission, sessionOf, currentIdentity } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { buildNoticeEmail, buildReceiptEmail } from "@/lib/emailTemplate";
import { notices } from "@/lib/notices";
import { guestLinkFor, checkFits, confirmedOrHeld } from "@/lib/rebooking.server";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { alertCaretakerIfSoon } from "@/lib/staffNotify.server";
import { remindGuestIfTomorrow } from "@/lib/guestReminder.server";
import { fmt } from "@/lib/utils";
import type { ProofRow } from "@/lib/paymentProofs.server";
import type { BookingRow } from "@/types/database";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requirePermission(req, "payments.record");
  if (denied) return denied;
  const { id } = await params;
  const body = (await readJson(req).catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  if (!["Downpayment", "Full", "Reject", "Kept", "NoPayment"].includes(action)) return no("Choose confirm partial, confirm full or reject.");
  const reason = String(body?.reason ?? "").replace(/[<>]/g, "").trim().slice(0, 300);
  if (action === "Reject" && reason.length < 3) return no("Tell the guest why the payment couldn't be verified.");

  const s = sessionOf(req);
  const me = s ? await currentIdentity(s) : null;
  const by = me?.name ?? "Admin";

  const db = getSupabaseAdmin();
  try {
    const got = await db.from("payment_proofs").select("*").eq("id", Number(id)).maybeSingle();
    if (got.error) throw new Error(got.error.message);
    const proof = got.data as ProofRow | null;
    if (!proof) return no("That receipt wasn't found.", 404);
    if (proof.status !== "Submitted") return no("Someone already decided on this receipt.", 409);
    const bRow = await db.from("bookings").select("*").eq("id", proof.booking_id).maybeSingle();
    if (bRow.error) throw new Error(bRow.error.message);
    if (!bRow.data) return no("The booking for this receipt no longer exists.", 404);
    const b = rowToBooking(bRow.data as BookingRow);
    const now = new Date().toISOString();

    // ── The guest cancelled before the receipt was checked ──
    if (action === "Kept" || action === "NoPayment") {
      if (b.status !== "Cancelled") return no("Only a receipt for a booking the guest cancelled is settled this way.", 409);
      const kept = action === "Kept";
      const claim = await db.from("payment_proofs")
        .update({ status: kept ? "Approved" : "Rejected", reviewed_at: now, reviewed_by: by, approved_as: kept ? proof.pay_choice : null, reject_reason: kept ? null : "Guest cancelled; no payment found in GCash." })
        .eq("id", proof.id).eq("status", "Submitted").select("id").maybeSingle();
      if (claim.error) throw new Error(claim.error.message);
      if (!claim.data) return no("Someone already decided on this receipt.", 409);
      const amount = round2(Number(proof.amount_due));
      if (kept && amount > 0) {
        const pay = await db.from("payments").insert({
          booking_id: b.id, guest_name: b.name,
          type: proof.pay_choice === "Full" ? "Full" : "Downpayment",
          method: "GCash", amount,
          reference: proof.reference ?? `proof-${proof.id}`,
          notes: `GCash receipt checked by ${by}. The guest cancelled, so it is kept under the no-refund policy.`,
        });
        if (pay.error) {
          await db.from("payment_proofs").update({ status: "Submitted", reviewed_at: null, reviewed_by: null, approved_as: null, reject_reason: null }).eq("id", proof.id);
          throw new Error(pay.error.message);
        }
      }
      await logActivity({
        actor: "Admin", action: kept ? "booking.proof_kept_after_cancel" : "booking.proof_none_after_cancel", bookingId: b.id, entity: "booking", entityId: b.id,
        summary: kept
          ? `${by} found ${fmt(amount)} by GCash for ${b.id}, which the guest cancelled. Recorded as received and kept (no refund).`
          : `${by} found no GCash payment for ${b.id}, which the guest cancelled. Nothing recorded.`,
        details: { proofId: proof.id, amount: kept ? amount : 0, reference: proof.reference },
      });
      return NextResponse.json({ success: true, amount: kept ? amount : 0 });
    }

    if (b.status === "Cancelled" || b.status === "ResortCancelled") return no("This booking was cancelled.", 409);

    // Confirming must not put this booking on top of one already confirmed
    // (a private pool sold twice, a full shared pool, a taken room).
    // Rejecting is always allowed.
    if (action !== "Reject" && b.status === "Pending") {
      const fits = await checkFits(b, [], { only: confirmedOrHeld });
      if (!fits.ok) return no(`Can't confirm: ${fits.error} Another confirmed booking already holds this. Reject this receipt, or move the booking to a free date first.`, 409);
    }

    // Claim it, so two staff can't both decide.
    const claim = await db.from("payment_proofs")
      .update({ status: action === "Reject" ? "Rejected" : "Approved", reviewed_at: now, reviewed_by: by, approved_as: action === "Reject" ? null : action, reject_reason: action === "Reject" ? reason : null })
      .eq("id", proof.id).eq("status", "Submitted").select("id").maybeSingle();
    if (claim.error) throw new Error(claim.error.message);
    if (!claim.data) return no("Someone already decided on this receipt.", 409);

    const link = guestLinkFor(b);

    if (action === "Reject") {
      const { subject, html } = buildNoticeEmail(notices.proofRejected(b, reason, link).email);
      const emailed = await trySendMail({ to: b.email, subject, html }, `proof-rejected ${b.id}`);
      await logActivity({
        actor: "Admin", action: "booking.proof_rejected", bookingId: b.id, entity: "booking", entityId: b.id,
        summary: `${by} couldn't verify the GCash receipt for ${b.id}: ${reason}`, details: { proofId: proof.id, reason, emailed },
      });
      return NextResponse.json({ success: true, emailed });
    }

    // What arrives in the ledger: the down payment asked for, or whatever
    // completes the total.
    const ledger = await loadBookingLedger(b.id);
    const paidBefore = ledger ? Math.max(0, ledger.money.paid) : 0;
    const amount = action === "Full"
      ? round2(Math.max(0, b.total - paidBefore))
      : round2(Math.min(proof.pay_choice === "Downpayment" ? Number(proof.amount_due) : Math.ceil(b.total / 2), Math.max(0, b.total - paidBefore)));
    if (amount > 0) {
      const pay = await db.from("payments").insert({
        booking_id: b.id, guest_name: b.name,
        type: amount + paidBefore >= b.total ? "Full" : "Downpayment",
        method: "GCash", amount,
        reference: proof.reference ?? `proof-${proof.id}`,
        notes: `GCash receipt checked by ${by}${action === "Full" ? " (paid in full)" : " (50% down payment)"}.`,
      });
      if (pay.error) {
        // Put the receipt back so it can be decided again.
        await db.from("payment_proofs").update({ status: "Submitted", reviewed_at: null, reviewed_by: null, approved_as: null }).eq("id", proof.id);
        throw new Error(pay.error.message);
      }
    }
    // downpayment = what has been paid: the confirmation email reads it.
    const up = await db.from("bookings").update({ status: "Confirmed", payment_proof: true, confirmed_at: now, downpayment: round2(paidBefore + amount) }).eq("id", b.id).select().single();
    if (up.error) throw new Error(up.error.message);
    const confirmed = rowToBooking(up.data as BookingRow);

    // The confirmation, with the Booking ID and what was paid.
    const { subject, html } = buildReceiptEmail(confirmed);
    const emailed = await trySendMail({ to: confirmed.email, subject, html }, `proof-approved ${b.id}`);
    void alertCaretakerIfSoon(confirmed);
    void remindGuestIfTomorrow(confirmed);
    await logActivity({
      actor: "Admin", action: "booking.proof_approved", bookingId: b.id, entity: "booking", entityId: b.id,
      summary: `${by} confirmed ${fmt(amount)} by GCash for ${b.id} (${action === "Full" ? "paid in full" : "50% down; the rest on arrival"}). Booking confirmed.`,
      details: { proofId: proof.id, amount, approvedAs: action, reference: proof.reference, emailed },
    });
    return NextResponse.json({ success: true, booking: confirmed, amount, emailed });
  } catch (err) {
    console.error("[/api/payment-proofs/[id] POST]", err);
    return no("Could not save the decision. Please try again.", 500);
  }
}
