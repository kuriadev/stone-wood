// ── GET  /api/bookings  → list bookings          (admin only)
// ── POST /api/bookings  → create a booking
//
// Two ways in:
//
//   Guest (Book Now)  { draft, paymentIntentId }
//     Only after PayMongo says the payment succeeded. The server re-prices
//     the draft itself, stores the amount PayMongo actually received, and
//     lets the database assign the reference. One payment = one booking:
//     sending the same paymentIntentId twice returns the booking that
//     already exists instead of creating another.
//
//     The booking is CONFIRMED at once: the payment is verified with
//     PayMongo and the date is checked here, which is everything the owner
//     used to check by hand. Only a booking with something wrong (the date
//     taken while the guest was paying, the wrong amount) waits as Pending
//     for the owner, flagged in its notes.
//
//   Admin (Walk-In)   a Booking object, with a valid admin session
//     Staff encode it at the front desk; email is optional.
//
// Reads and writes go through the service-role client, so RLS is bypassed on
// purpose: the guards are the admin session and the PayMongo check.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, bookingToRow, missingNewColumn, withoutNewColumns } from "@/lib/supabase";
import { requirePermission, isAdminRequest } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { buildBookingReceivedEmail, buildReceiptEmail } from "@/lib/emailTemplate";
import { buildNewBookingAlert, adminNotifyTo } from "@/lib/adminNotify";
import { logActivity } from "@/lib/activity.server";
import { fmtDate } from "@/lib/utils";
import { packageAvailed } from "@/lib/pricing";
import { trySendMail } from "@/lib/mailer";
import { getPaymentStatus } from "@/lib/paymongo";
import { quoteBooking } from "@/lib/bookingQuote";
import { checkWalkIn, saveWalkIn } from "@/lib/walkIn.server";
import { fmt } from "@/lib/utils";
import type { BookingRow } from "@/types/database";
import type { Booking } from "@/types/booking";

export const dynamic = "force-dynamic";

const STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"] as const;

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "bookings.view");
  if (denied) return denied;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, bookings: (data as BookingRow[]).map(rowToBooking) });
  } catch (err) {
    console.error("[/api/bookings GET]", err);
    return NextResponse.json({ success: false, error: "Could not load bookings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  // A payment reference always means the guest path, even from a browser
  // that happens to hold an admin session.
  if (typeof body.paymentIntentId === "string") return createGuestBooking(req, body);
  if (isAdminRequest(req)) {
    const denied = await requirePermission(req, "bookings.edit");
    if (denied) return denied;
    return createWalkIn(body);
  }
  return NextResponse.json(
    { success: false, error: "Bookings are created through the payment step." },
    { status: 401 }
  );
}

// ── Guest: after a successful PayMongo payment ──────────────────────
async function createGuestBooking(req: NextRequest, body: Record<string, unknown>) {
  const limited = rateLimit(req, { name: "booking-create", limit: 12, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const paymentIntentId = String(body.paymentIntentId).slice(0, 100);
  const db = getSupabaseAdmin();

  try {
    // Already recorded? Return it. This is what makes a retry after a
    // dropped connection safe: the guest paid once and gets one booking.
    const existing = await db
      .from("bookings").select("*").eq("payment_intent_id", paymentIntentId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      const b = rowToBooking(existing.data as BookingRow);
      const email = String((body.draft as Record<string, unknown> | undefined)?.email ?? "").trim().toLowerCase();
      // Only hand it back to whoever made it.
      if (b.email !== email) {
        return NextResponse.json({ success: false, error: "That payment is already linked to a booking." }, { status: 409 });
      }
      return NextResponse.json({ success: true, booking: b, emailed: false });
    }

    // The payment must really have gone through.
    const payment = await getPaymentStatus(paymentIntentId);
    if (payment.status !== "succeeded") {
      return NextResponse.json(
        { success: false, error: "We haven't received that payment yet." },
        { status: 402 }
      );
    }

    const result = await quoteBooking(body.draft);
    if (!result.ok) {
      // Money has moved but the details are unusable — only possible with a
      // tampered request. Logged with the payment id so staff can refund.
      console.error(`[/api/bookings POST] paid intent ${paymentIntentId} with an invalid draft: ${result.error}`);
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    const { quote } = result;
    const paidPesos = payment.amountCentavos / 100;

    // From here on the guest HAS paid, so the booking is always stored —
    // turning a paying guest away with nothing on record would be the worst
    // outcome. Anything wrong is written into the notes for staff instead.
    const flags: string[] = [];
    if (!quote.available) {
      flags.push(`⚠ CHECK: ${quote.unavailableReason ?? "date no longer available"} (taken while the guest was paying).`);
    }
    if (quote.splitWarning) flags.push(`⚠ CHECK: ${quote.splitWarning}`);
    if (paidPesos !== quote.dueNow) {
      flags.push(`⚠ CHECK: paid ${fmt(paidPesos)} but ${quote.draft.payFull ? "the full total" : "the down payment"} is ${fmt(quote.dueNow)}.`);
    }

    const d = quote.draft;
    const row = bookingToRow({
      id: "", // ignored; the database assigns the reference
      name: d.name,
      email: d.email,
      contact: d.contact,
      date: d.date,
      endDate: d.endDate,
      guests: d.guests,
      package: quote.packageLabel,
      rooms: d.rooms,
      overtime: d.overtime,
      total: quote.price.total,
      downpayment: paidPesos,
      status: flags.length ? "Pending" : "Confirmed",
      paymentProof: true, // PayMongo confirmed it; no screenshot needed
      notes: [d.notes, ...flags].filter(Boolean).join(" "),
      source: "Online",
      resource: d.resource,
      tier: d.tier,
      slot: d.slot,
      paymentIntentId,
    });

    const confirmedNow = flags.length === 0;
    const full = { ...row, confirmed_at: confirmedNow ? new Date().toISOString() : null };
    let { data, error } = await db.from("bookings").insert(full).select().single();
    if (error && missingNewColumn(error)) ({ data, error } = await db.from("bookings").insert(withoutNewColumns(full)).select().single());
    if (error) {
      // 23505 on payment_intent_id: a parallel request saved it first.
      if (error.code === "23505") {
        const again = await db.from("bookings").select("*").eq("payment_intent_id", paymentIntentId).maybeSingle();
        if (again.data) return NextResponse.json({ success: true, booking: rowToBooking(again.data as BookingRow), emailed: false });
      }
      throw new Error(error.message);
    }

    const saved = rowToBooking(data as BookingRow);

    // The online payment (the down payment, or the whole total when the
    // guest paid in full) goes into the sales ledger as received money. The
    // unique index on PayMongo references means a retry cannot record it
    // twice. A failure here must not fail the booking: the guest has paid
    // and the booking exists, so it is logged for staff to add by hand.
    const ledgerRow = await db.from("payments").insert({
      booking_id: saved.id,
      guest_name: saved.name,
      type: paidPesos >= saved.total ? "Full" : "Downpayment",
      method: "PayMongo",
      amount: paidPesos,
      reference: paymentIntentId,
      notes: paidPesos >= saved.total ? "Paid in full online (PayMongo)." : "Online down payment (PayMongo).",
    });
    if (ledgerRow.error && ledgerRow.error.code !== "23505") {
      console.error(`[/api/bookings POST] booking ${saved.id} saved but its payment was not recorded:`, ledgerRow.error.message);
    }

    // Sent from here rather than the browser: this is the only place that
    // knows the booking reached the database. trySendMail never throws — a
    // slow Gmail must not turn a saved, paid booking into an error.
    // Confirmed: the confirmation itself. Flagged: the "received, being
    // reviewed" email, since the owner still has to look at it.
    const { subject, html } = confirmedNow ? buildReceiptEmail(saved) : buildBookingReceivedEmail(saved);
    const emailed = await trySendMail({ to: saved.email, subject, html }, `${confirmedNow ? "booking-confirmed" : "booking-received"} ${saved.id}`);

    /* And the desk's own copy. One per booking — a rate that matches how
       often it really happens — and it says whether anything is needed:
       a booking the system already confirmed asks nothing of the owner,
       one held for review does. trySendMail, so a slow Gmail cannot turn a
       saved, paid booking into an error. */
    const alert = buildNewBookingAlert(saved, paidPesos);
    void trySendMail({ to: adminNotifyTo(), subject: alert.subject, html: alert.html }, `admin-new-booking ${saved.id}`);

    await logActivity([
      {
        actor: "Guest", action: "booking.created", bookingId: saved.id, entity: "booking", entityId: saved.id,
        summary: `${saved.name} booked ${packageAvailed(saved)} for ${fmtDate(saved.date)} online and paid ${fmt(paidPesos)}${paidPesos >= saved.total ? " (in full)" : ""} by PayMongo.`,
        details: { total: saved.total, paid: paidPesos, paymentIntentId, emailed },
      },
      confirmedNow
        ? { actor: "System", action: "booking.confirmed", bookingId: saved.id, entity: "booking", entityId: saved.id, summary: `Confirmed ${saved.id} automatically: payment verified with PayMongo and the date was free.` }
        : { actor: "System", action: "booking.needs_review", bookingId: saved.id, entity: "booking", entityId: saved.id, summary: `${saved.id} needs the super admin's review: ${flags.join(" ")}`, details: { flags } },
    ]);

    return NextResponse.json({ success: true, booking: saved, emailed }, { status: 201 });
  } catch (err) {
    console.error(`[/api/bookings POST] intent ${paymentIntentId}:`, err);
    return NextResponse.json(
      { success: false, error: "Your payment went through, but we couldn't save the booking. Please try again." },
      { status: 500 }
    );
  }
}

// ── Admin: walk-in encoded at the front desk ────────────────────────
// The rules live in lib/walkIn.server.ts, shared with the import of
// bookings taken while offline (/api/bookings/import).
async function createWalkIn(body: Record<string, unknown>) {
  try {
    const checked = await checkWalkIn(body);
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: checked.status });
    const saved = await saveWalkIn(checked.plan);
    return NextResponse.json({ success: true, booking: saved }, { status: 201 });
  } catch (err) {
    console.error("[/api/bookings POST walk-in]", err);
    return NextResponse.json({ success: false, error: "Could not save the booking." }, { status: 500 });
  }
}
