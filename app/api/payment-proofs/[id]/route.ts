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

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requirePermission, sessionOf, currentIdentity } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { buildNoticeEmail, buildReceiptEmail } from "@/lib/emailTemplate";
import { notices } from "@/lib/notices";
import { guestLinkFor } from "@/lib/rebooking.server";
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
  if (!["Downpayment", "Full", "Reject"].includes(action)) return no("Choose confirm partial, confirm full or reject.");
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
    if (b.status === "Cancelled" || b.status === "ResortCancelled") return no("This booking was cancelled.", 409);

    const now = new Date().toISOString();
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
