// ── POST /api/payment      → create a QRPh payment, return its unique QR
// ── GET  /api/payment?id=  → poll that payment's status
//
// The secret key stays on this side of the wire. The browser only ever sees
// the QR image, the expiry, and a status string.

import { NextRequest, NextResponse } from "next/server";
import {
  createQrPayment,
  getPaymentStatus,
  cancelPayment,
  MIN_AMOUNT_CENTAVOS,
} from "@/lib/paymongo";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

/** Upper bound on a single payment. The amount arrives from the browser, so
 *  without a ceiling a caller could mint a QR for any figure they liked
 *  against the live PayMongo account. ₱500,000 is far above any real booking
 *  here and still low enough to make abuse obvious. */
const MAX_AMOUNT_CENTAVOS = 500_000_00;

// Talks to a third party and must never be prerendered or cached.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Creating payment intents is the expensive call — it hits a third party and
  // leaves records on the merchant account. Ten per hour per IP.
  const limited = rateLimit(req, { name: "payment-create", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const body = await req.json().catch(() => ({}));
    const { amount, referenceId, description } = body as {
      amount?: number;
      referenceId?: string;
      description?: string;
    };

    // The amount is recomputed from the booking on the client, but it still
    // arrives over the wire, so it gets validated here rather than trusted.
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return NextResponse.json(
        { success: false, error: "A numeric amount (in centavos) is required." },
        { status: 400 }
      );
    }
    if (amount > MAX_AMOUNT_CENTAVOS) {
      return NextResponse.json(
        { success: false, error: "That amount is too large to process online." },
        { status: 400 }
      );
    }
    if (amount < MIN_AMOUNT_CENTAVOS) {
      return NextResponse.json(
        {
          success: false,
          error: `Minimum payment is ₱${MIN_AMOUNT_CENTAVOS / 100}.`,
        },
        { status: 400 }
      );
    }
    if (!referenceId || typeof referenceId !== "string") {
      return NextResponse.json(
        { success: false, error: "A booking referenceId is required." },
        { status: 400 }
      );
    }

    const payment = await createQrPayment({
      amountCentavos: Math.round(amount),
      referenceId: referenceId.slice(0, 64),
      description: (description ?? `StoneWood booking ${referenceId}`).slice(0, 255),
    });

    return NextResponse.json({ success: true, payment });
  } catch (err) {
    // Logged in full; returned generically. The upstream message can quote
    // PayMongo's response, which names the merchant account and the state of
    // the key — useful in a log, not something to hand to a caller.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/payment POST]", message);
    return NextResponse.json(
      { success: false, error: "Could not start the payment. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/payment?id=…  → void the QR so it can no longer be paid.
 *
 * Called when the countdown runs out, and when the guest retries. Hiding an
 * expired QR in the UI is not enough on its own: the intent would stay live,
 * and a late scan could still charge someone for a booking the site had
 * already abandoned.
 */
export async function DELETE(req: NextRequest) {
  const limited = rateLimit(req, { name: "payment-cancel", limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing payment intent id." },
        { status: 400 }
      );
    }

    // Check first: if the guest paid in the final seconds, honour the payment
    // instead of cancelling it out from under them.
    const current = await getPaymentStatus(id);
    if (current.status === "succeeded") {
      return NextResponse.json({
        success: true,
        cancelled: false,
        paid: true,
        status: current.status,
      });
    }

    const cancelled = await cancelPayment(id);
    return NextResponse.json({ success: true, cancelled, paid: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/payment DELETE]", message);
    return NextResponse.json(
      { success: false, error: "Payment service is unavailable. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { name: "payment-poll", limit: 240, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing payment intent id." },
        { status: 400 }
      );
    }

    const result = await getPaymentStatus(id);
    return NextResponse.json({
      success: true,
      status: result.status,
      paid: result.status === "succeeded",
      paidAt: result.paidAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/payment GET]", message);
    return NextResponse.json(
      { success: false, error: "Payment service is unavailable. Please try again." },
      { status: 500 }
    );
  }
}
