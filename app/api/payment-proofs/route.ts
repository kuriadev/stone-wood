// ── POST /api/payment-proofs → a guest books and sends their GCash receipt   (public)
// ── GET  /api/payment-proofs → receipts waiting to be checked               (ops.view)
//
// Online bookings are paid by GCash to the resort's own account, then
// proven with a screenshot of the receipt (supabase/migrations/
// 20261115120000_payment_proofs.sql). The browser has already read it
// (lib/receiptOcr.ts) and turned away pictures that aren't receipts; here
// the booking is saved as Pending, holding its date, until staff confirm
// the money arrived (POST /api/payment-proofs/[id]).
//
// POST body: { draft, proof: data:image/…, ocr: {…} }
//   The server re-prices the draft itself (lib/bookingQuote.ts): what the
//   guest owes is never taken from the browser. A date that filled up while
//   they were paying is still saved, flagged for staff, because the guest
//   has already sent the money.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, bookingToRow, missingNewColumn, withoutNewColumns } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { quoteBooking } from "@/lib/bookingQuote";
import { checkProofImage, cleanOcr, saveProofImage, proofUrl, proofsTableMissing, type ProofRow } from "@/lib/paymentProofs.server";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { notices } from "@/lib/notices";
import { guestLinkFor } from "@/lib/rebooking.server";
import { buildProofAlert } from "@/lib/adminNotify";
import { notifyStaff } from "@/lib/staffNotify.server";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmt, fmtDate } from "@/lib/utils";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { name: "proof-booking", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return no("Invalid request.");

  const img = checkProofImage(body.proof);
  if (!img.ok) return no(img.error);
  const ocr = cleanOcr(body.ocr);
  if (!ocr.reference) return no("We couldn't find the reference number on your receipt. Please upload a clear screenshot that shows it.");

  const db = getSupabaseAdmin();
  try {
    // The same receipt can't pay for two bookings.
    const used = await db.from("payment_proofs").select("booking_id").ilike("reference", ocr.reference).not("status", "in", "(Rejected,Replaced)").limit(1);
    if (used.error) {
      if (proofsTableMissing(used.error.message)) return no("Online booking is being set up. Please message the resort to book.", 503);
      throw new Error(used.error.message);
    }
    if (used.data?.length) return no(`This receipt (reference ${ocr.reference}) was already used for another booking. Please upload the receipt for this payment.`, 409);

    const result = await quoteBooking(body.draft, { requireEmailProof: true });
    if (!result.ok) return no(result.error, result.status);
    const { quote } = result;
    const d = quote.draft;
    const due = quote.dueNow;
    const payChoice = d.payFull ? "Full" as const : "Downpayment" as const;

    // Saved even when something is off, flagged for staff: the guest has
    // already sent the money (lib/reviewReasons.ts reads these lines).
    const flags: string[] = [];
    if (!quote.available) flags.push(`⚠ CHECK: ${quote.unavailableReason ?? "date no longer available"} (taken while the guest was paying).`);
    if (quote.splitWarning) flags.push(`⚠ CHECK: ${quote.splitWarning}`);

    const row = bookingToRow({
      id: "",
      name: d.name, email: d.email, contact: d.contact,
      date: d.date, endDate: d.endDate, guests: d.guests,
      ...(d.children ? { children: d.children } : {}),
      package: quote.packageLabel,
      rooms: d.rooms, overtime: d.overtime,
      total: quote.price.total,
      // Nothing is counted as paid until staff confirm the receipt; then
      // this becomes what was received (and the ledger gets the payment).
      downpayment: 0,
      status: "Pending",
      paymentProof: false,
      notes: [d.notes, ...flags].filter(Boolean).join(" "),
      source: "Online",
      resource: d.resource, tier: d.tier, slot: d.slot,
    });
    let ins = await db.from("bookings").insert(row).select().single();
    if (ins.error && missingNewColumn(ins.error)) ins = await db.from("bookings").insert(withoutNewColumns(row)).select().single();
    if (ins.error) throw new Error(ins.error.message);
    const saved = rowToBooking(ins.data as BookingRow);

    let path: string;
    try {
      path = await saveProofImage(saved.id, img);
      const proof = await db.from("payment_proofs").insert({
        booking_id: saved.id, path, status: "Submitted", pay_choice: payChoice, amount_due: due, ocr, reference: ocr.reference,
      });
      if (proof.error) throw new Error(proof.error.message);
    } catch (err) {
      // No receipt on record: don't leave a booking holding the date.
      await db.from("bookings").delete().eq("id", saved.id);
      const msg = err instanceof Error ? err.message : "";
      if (/duplicate|unique/i.test(msg)) return no(`This receipt (reference ${ocr.reference}) was already used for another booking.`, 409);
      throw err;
    }

    const link = guestLinkFor(saved);
    const { subject, html } = buildNoticeEmail(notices.proofReceived(saved, due, payChoice, link).email);
    const emailed = await trySendMail({ to: saved.email, subject, html }, `proof-received ${saved.id}`);
    void notifyStaff(["Owner", "FrontDesk"], buildProofAlert(saved, due, payChoice, ocr.reference), `proof ${saved.id}`);
    await logActivity({
      actor: "Guest", action: "booking.proof_submitted", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: `${saved.name} booked ${saved.id} for ${fmtDate(saved.date)} and sent a GCash receipt for ${fmt(due)} (${payChoice === "Full" ? "in full" : "50% down"}) to be checked.`,
      details: { due, payChoice, reference: ocr.reference, flags },
    });
    return NextResponse.json({ success: true, booking: saved, emailed }, { status: 201 });
  } catch (err) {
    console.error("[/api/payment-proofs POST]", err);
    return no("We couldn't save your booking. Please try again, or message the resort with your receipt.", 500);
  }
}

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "ops.view");
  if (denied) return denied;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("payment_proofs").select("*").eq("status", "Submitted").order("submitted_at", { ascending: true }).limit(50);
    if (error) {
      if (proofsTableMissing(error.message)) return NextResponse.json({ success: true, proofs: [], enabled: false });
      throw new Error(error.message);
    }
    const rows = (data ?? []) as ProofRow[];
    const ids = [...new Set(rows.map((r) => r.booking_id))];
    const books = ids.length ? await db.from("bookings").select("*").in("id", ids) : { data: [], error: null };
    if (books.error) throw new Error(books.error.message);
    const byId = new Map((books.data as BookingRow[]).map((b) => [b.id, rowToBooking(b)]));
    // Earlier receipts for the same booking that were turned down, for context.
    const history = ids.length ? await db.from("payment_proofs").select("booking_id, status, reject_reason, submitted_at").in("booking_id", ids).eq("status", "Rejected") : { data: [] };
    const proofs = await Promise.all(rows.filter((r) => byId.has(r.booking_id)).map(async (r) => ({
      id: r.id,
      bookingId: r.booking_id,
      booking: byId.get(r.booking_id)!,
      payChoice: r.pay_choice,
      amountDue: Number(r.amount_due),
      ocr: r.ocr ?? {},
      reference: r.reference,
      submittedAt: r.submitted_at,
      imageUrl: await proofUrl(r.path),
      rejectedBefore: ((history.data ?? []) as { booking_id: string; reject_reason: string | null }[]).filter((h) => h.booking_id === r.booking_id).map((h) => h.reject_reason ?? ""),
    })));
    return NextResponse.json({ success: true, proofs, enabled: true });
  } catch (err) {
    console.error("[/api/payment-proofs GET]", err);
    return no("Could not load the receipts.", 500);
  }
}
