// ── POST /api/bookings/[id]/proof → the guest's GCash receipt, on their booking page   (public)
//
// Body: { email | t | ep, action?: "status" | "upload", proof?, ocr? }
//
//   status  where the latest receipt stands: being checked, confirmed, or
//           turned down (with the reason staff gave)
//   upload  "Change payment picture": a new receipt for a booking still
//           waiting on its payment. The one it replaces is kept, marked
//           Replaced, and staff check the new one.
//
// Public, so it proves ownership like the other guest routes.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadGuestBooking } from "@/lib/rebooking.server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { checkProofImage, cleanOcr, saveProofImage, senderProblem, proofsTableMissing, type ProofRow } from "@/lib/paymentProofs.server";
import { buildProofAlert } from "@/lib/adminNotify";
import { notifyStaff } from "@/lib/staffNotify.server";
import { logActivity } from "@/lib/activity.server";
import { fmt } from "@/lib/utils";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = rateLimit(req, { name: "booking-proof", limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);
  const { id } = await params;
  const body = (await readJson(req).catch(() => null)) as Record<string, unknown> | null;
  if (!body) return no("Invalid request.");
  const email = String(body.email ?? "").trim().toLowerCase();
  const token = String(body.t ?? "").trim();
  if (!email && !token) return no("An email address is required.");

  try {
    const b = await loadGuestBooking(id, { email, token, emailProof: String(body.ep ?? "") });
    if (!b) return no("No booking found for those details.", 404);
    const db = getSupabaseAdmin();
    const got = await db.from("payment_proofs").select("*").eq("booking_id", b.id).order("submitted_at", { ascending: false }).limit(1);
    if (got.error) {
      if (proofsTableMissing(got.error.message)) return NextResponse.json({ success: true, proof: null });
      throw new Error(got.error.message);
    }
    const last = (got.data?.[0] ?? null) as ProofRow | null;

    if (body.action !== "upload") {
      return NextResponse.json({
        success: true,
        proof: last ? { status: last.status, submittedAt: last.submitted_at, reviewedAt: last.reviewed_at, reason: last.reject_reason, amountDue: Number(last.amount_due), payChoice: last.pay_choice } : null,
      });
    }

    // ── A new receipt ────────────────────────────────────────────────
    if (!last) return no("This booking wasn't paid by GCash receipt.", 409);
    if (b.status !== "Pending" || last.status === "Approved") return no("Your payment is already confirmed.", 409);
    const img = checkProofImage(body.proof);
    if (!img.ok) return no(img.error);
    const ocr = cleanOcr(body.ocr);
    const missing = senderProblem(ocr);
    if (missing || !ocr.reference) return no(missing ?? "Enter the reference number from your receipt.");
    const used = await db.from("payment_proofs").select("booking_id").ilike("reference", ocr.reference).not("status", "in", "(Rejected,Replaced)").neq("booking_id", b.id).limit(1);
    if (used.error) throw new Error(used.error.message);
    if (used.data?.length) return no(`This receipt (reference ${ocr.reference}) was already used for another booking.`, 409);

    const path = await saveProofImage(b.id, img);
    if (last.status === "Submitted") await db.from("payment_proofs").update({ status: "Replaced" }).eq("id", last.id).eq("status", "Submitted");
    const ins = await db.from("payment_proofs").insert({
      booking_id: b.id, path, status: "Submitted", pay_choice: last.pay_choice, amount_due: last.amount_due, ocr, reference: ocr.reference,
    });
    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) return no(`This receipt (reference ${ocr.reference}) was already used.`, 409);
      throw new Error(ins.error.message);
    }
    void notifyStaff(["Owner", "FrontDesk"], buildProofAlert(b, Number(last.amount_due), last.pay_choice, ocr.reference), `proof-again ${b.id}`);
    await logActivity({
      actor: "Guest", action: "booking.proof_submitted", bookingId: b.id, entity: "booking", entityId: b.id,
      summary: `${b.name} sent a new GCash receipt for ${b.id} (${fmt(Number(last.amount_due))}) to be checked.`,
      details: { reference: ocr.reference, replaced: last.id },
    });
    return NextResponse.json({ success: true, proof: { status: "Submitted", submittedAt: new Date().toISOString(), reason: null, amountDue: Number(last.amount_due), payChoice: last.pay_choice } });
  } catch (err) {
    console.error("[/api/bookings/[id]/proof POST]", err);
    return no("Could not save your receipt. Please try again.", 500);
  }
}
