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
//   Admin (Walk-In)   a Booking object, with a valid admin session
//     Staff encode it at the front desk; email is optional.
//
// Reads and writes go through the service-role client, so RLS is bypassed on
// purpose: the guards are the admin session and the PayMongo check.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, bookingToRow } from "@/lib/supabase";
import { isAdminRequest, requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail, isValidPHNumber, sanitizeName, sanitizeNotes, NAME_MIN, NAME_MAX, OVERTIME_MAX } from "@/lib/validators";
import { buildBookingReceivedEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { getPaymentStatus } from "@/lib/paymongo";
import { quoteBooking } from "@/lib/bookingQuote";
import { fmt } from "@/lib/utils";
import type { BookingRow } from "@/types/database";
import type { Booking, BookingResource, BookingSlot, BookingSource, BookingTier } from "@/types/booking";

export const dynamic = "force-dynamic";

const STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"] as const;
const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const TIERS: BookingTier[] = ["Shared", "Exclusive"];
const SOURCES: BookingSource[] = ["Online", "Walk-In"];
const SLOTS: BookingSlot[] = ["Day", "Night", "WholeDay"];

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
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
  if (isAdminRequest(req)) return createWalkIn(body);
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
    if (paidPesos !== quote.price.down) {
      flags.push(`⚠ CHECK: paid ${fmt(paidPesos)} but the down payment is ${fmt(quote.price.down)}.`);
    }

    const d = quote.draft;
    const row = bookingToRow({
      id: "", // ignored; the database assigns the reference
      name: d.name,
      email: d.email,
      contact: d.contact,
      date: d.date,
      guests: d.guests,
      package: quote.packageLabel,
      rooms: d.rooms,
      overtime: d.overtime,
      total: quote.price.total,
      downpayment: paidPesos,
      status: "Pending",
      paymentProof: true, // PayMongo confirmed it; no screenshot needed
      notes: [d.notes, ...flags].filter(Boolean).join(" "),
      source: "Online",
      resource: d.resource,
      tier: d.tier,
      slot: d.slot,
      paymentIntentId,
    });

    const { data, error } = await db.from("bookings").insert(row).select().single();
    if (error) {
      // 23505 on payment_intent_id: a parallel request saved it first.
      if (error.code === "23505") {
        const again = await db.from("bookings").select("*").eq("payment_intent_id", paymentIntentId).maybeSingle();
        if (again.data) return NextResponse.json({ success: true, booking: rowToBooking(again.data as BookingRow), emailed: false });
      }
      throw new Error(error.message);
    }

    const saved = rowToBooking(data as BookingRow);

    // The down payment goes into the sales ledger as received money. The
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
      notes: "Online down payment (PayMongo).",
    });
    if (ledgerRow.error && ledgerRow.error.code !== "23505") {
      console.error(`[/api/bookings POST] booking ${saved.id} saved but its payment was not recorded:`, ledgerRow.error.message);
    }

    // Sent from here rather than the browser: this is the only place that
    // knows the booking reached the database. trySendMail never throws — a
    // slow Gmail must not turn a saved, paid booking into an error.
    const { subject, html } = buildBookingReceivedEmail(saved);
    const emailed = await trySendMail({ to: saved.email, subject, html }, `booking-received ${saved.id}`);

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
async function createWalkIn(body: Record<string, unknown>) {
  const b = body as Partial<Booking>;
  try {
    const name = sanitizeName(String(b.name ?? "")).trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const contact = String(b.contact ?? "").trim();

    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return NextResponse.json({ success: false, error: "A valid name is required." }, { status: 400 });
    }
    // Walk-in guests often have no email, and that's fine. One that IS
    // given must be real, or confirmation emails would bounce.
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ success: false, error: "That email address isn't valid." }, { status: 400 });
    }
    if (!isValidPHNumber(contact)) {
      return NextResponse.json({ success: false, error: "A valid PH contact number is required." }, { status: 400 });
    }
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) {
      return NextResponse.json({ success: false, error: "A valid date is required." }, { status: 400 });
    }
    const guests = Number(b.guests);
    if (!Number.isFinite(guests) || guests < 1) {
      return NextResponse.json({ success: false, error: "Guest count must be at least 1." }, { status: 400 });
    }

    const total = Math.max(0, Math.min(Number(b.total) || 0, 1_000_000));
    const downpayment = Math.ceil(total / 2);
    // The money taken at the desk decides the status: any payment makes it
    // a real reservation (Confirmed); none leaves it Pending until the guest
    // pays. The booking itself stores the REQUIRED down payment (50%); what
    // was actually received goes into the payments ledger below.
    const pay = b.initialPayment;
    const payAmount = pay ? Math.round(Number(pay.amount) * 100) / 100 : 0;
    const payMethods = ["Cash", "GCash", "Bank Transfer"];
    if (pay && (!Number.isFinite(payAmount) || payAmount <= 0 || payAmount > total || !payMethods.includes(pay.method))) {
      return NextResponse.json({ success: false, error: "The payment taken at the desk is not valid." }, { status: 400 });
    }
    if (pay && pay.method !== "Cash" && !String(pay.reference ?? "").trim()) {
      return NextResponse.json({ success: false, error: `Enter the ${pay.method} reference number.` }, { status: 400 });
    }
    const status = pay ? "Confirmed" : "Pending";

    const row = bookingToRow({
      ...(b as Booking),
      id: "",
      name,
      email,
      contact,
      guests: Math.round(guests),
      total,
      downpayment,
      status,
      paymentProof: !!pay,
      arrivalTime: typeof b.arrivalTime === "string" && /^\d{2}:\d{2}$/.test(b.arrivalTime) ? b.arrivalTime : undefined,
      rooms: Array.isArray(b.rooms) ? b.rooms.map(Number).filter(Number.isFinite) : [],
      // Overtime is Day-only and capped (see OVERTIME_MAX).
      overtime: b.slot === "Day" || !b.slot
        ? Math.min(OVERTIME_MAX, Math.max(0, Math.round(Number(b.overtime) || 0)))
        : 0,
      notes: sanitizeNotes(String(b.notes ?? "")),
      source: SOURCES.includes(b.source as BookingSource) ? b.source : "Walk-In",
      resource: RESOURCES.includes(b.resource as BookingResource) ? b.resource : undefined,
      tier: TIERS.includes(b.tier as BookingTier) ? b.tier : undefined,
      slot: SLOTS.includes(b.slot as BookingSlot) ? b.slot : "Day",
      archived: false,
      archivedAt: undefined,
      paymentIntentId: undefined,
      cancelReason: null,
    });

    const db = getSupabaseAdmin();
    const { data, error } = await db.from("bookings").insert(row).select().single();
    if (error) throw new Error(error.message);
    const saved = rowToBooking(data as BookingRow);

    if (pay) {
      const ledgerRow = await db.from("payments").insert({
        booking_id: saved.id,
        guest_name: saved.name,
        type: payAmount >= total ? "Full" : "Downpayment",
        method: pay.method,
        amount: payAmount,
        reference: String(pay.reference ?? "").replace(/[<>]/g, "").trim().slice(0, 80),
        notes: "Collected at the front desk (walk-in).",
      });
      if (ledgerRow.error) {
        // Undo the booking rather than keep a Confirmed walk-in whose money
        // is missing from the ledger.
        await db.from("bookings").delete().eq("id", saved.id);
        throw new Error(ledgerRow.error.message);
      }
    }
    return NextResponse.json({ success: true, booking: saved }, { status: 201 });
  } catch (err) {
    console.error("[/api/bookings POST walk-in]", err);
    return NextResponse.json({ success: false, error: "Could not save the booking." }, { status: 500 });
  }
}
