// ── POST  /api/payments      → record money received        (admin only)
// ── PATCH /api/payments?id=  → void a payment, with a reason (admin only)
//
// Payments are never edited or deleted. A wrong entry is voided and stays
// visible in the ledger with the reason, which is what makes the record
// trustworthy for the owner (and defensible to anyone auditing it).
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
import { fmt } from "@/lib/utils";
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
      if (booking.status === "Cancelled") {
        return NextResponse.json({ success: false, error: "This booking is cancelled. Nothing more is owed on it." }, { status: 409 });
      }
      if (amount > money.balance) {
        return NextResponse.json({ success: false, error: `Only ${fmt(money.balance)} is still owed on this booking.` }, { status: 409 });
      }
    }

    const received = typeof body.receivedAt === "string" && !Number.isNaN(Date.parse(body.receivedAt))
      ? new Date(body.receivedAt).toISOString()
      : new Date().toISOString();

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

    return NextResponse.json({ success: true, payment: rowToPayment(data as PaymentRow) }, { status: 201 });
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
    return NextResponse.json({ success: true, payment: rowToPayment(data as PaymentRow) });
  } catch (err) {
    console.error("[/api/payments PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not void the payment." }, { status: 500 });
  }
}
