// ── PayMongo (server-side only)
//
// SERVER ONLY. Every function here uses PAYMONGO_SECRET_KEY, which must never
// reach the browser — import this from route handlers, never from a component.
//
// Why QRPh and not "gcash":
//   PayMongo's `gcash` method is a REDIRECT flow — attaching it fails with
//   "return_url is required" and yields a URL to send the customer to. It
//   never produces a QR code.
//   `qrph` returns next_action.type === "consume_qr" with a unique QR image
//   per payment intent, which is what the booking screen displays. QRPh is
//   the Philippine national QR standard, so the GCash app scans it — as do
//   Maya and the banks.
//
// Amounts are in CENTAVOS: ₱100.00 === 10000. PayMongo's minimum is ₱20.00.

const API = "https://api.paymongo.com/v1";

/** PayMongo's documented minimum charge, in centavos (₱20.00). */
export const MIN_AMOUNT_CENTAVOS = 2000;

export interface QrPayment {
  paymentIntentId: string;
  clientKey: string;
  /** base64 PNG data URI — render directly in an <img src>. */
  qrImageUrl: string;
  /** ISO timestamp, or null when PayMongo did not supply one. */
  expiresAt: string | null;
  /**
   * Seconds remaining, measured on the SERVER at creation time.
   * The countdown runs off this rather than off expiresAt, because a
   * browser clock that is wrong by minutes would otherwise show a wrong
   * countdown — or expire the QR instantly — through no fault of the guest.
   */
  expiresInSeconds: number;
  amountCentavos: number;
  /** Test-mode only: opening this simulates a successful scan. */
  testUrl: string | null;
}

export type PaymentStatus =
  | "awaiting_payment_method"
  | "awaiting_next_action"
  | "processing"
  | "succeeded"
  | "cancelled"
  | "unknown";

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY ?? "";
  if (!key || key.includes("REPLACE_ME")) {
    throw new Error(
      "PAYMONGO_SECRET_KEY is not set. Add the sk_test_… key to .env.local " +
        "(PayMongo dashboard → Developers, with the Test/Live toggle on Test)."
    );
  }
  if (!key.startsWith("sk_")) {
    // pk_ and sk_ are easy to mix up, and the resulting 401 is opaque.
    throw new Error(
      "PAYMONGO_SECRET_KEY looks like a public key. The secret key starts " +
        "with sk_, not pk_."
    );
  }
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail ?? `HTTP ${res.status}`;
    throw new Error(`PayMongo: ${detail}`);
  }
  return body as T;
}

/**
 * Create a QRPh payment and return its unique QR.
 *
 * Three calls, in order — PayMongo has no single-shot endpoint for this:
 *   1. create the intent (how much is owed)
 *   2. create a qrph payment method
 *   3. attach the method, which is what mints the QR
 */
export async function createQrPayment(opts: {
  amountCentavos: number;
  description: string;
  referenceId: string;
}): Promise<QrPayment> {
  const amount = Math.round(opts.amountCentavos);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_CENTAVOS) {
    throw new Error(
      `Amount must be at least ${MIN_AMOUNT_CENTAVOS} centavos (₱${MIN_AMOUNT_CENTAVOS / 100}).`
    );
  }

  const intent = await call<any>("/payment_intents", {
    method: "POST",
    body: JSON.stringify({
      data: {
        attributes: {
          amount,
          currency: "PHP",
          payment_method_allowed: ["qrph"],
          capture_type: "automatic",
          description: opts.description,
          // Survives the round trip, so a webhook added later can tie the
          // payment back to the booking without extra bookkeeping.
          metadata: { reference_id: opts.referenceId },
        },
      },
    }),
  });

  const method = await call<any>("/payment_methods", {
    method: "POST",
    body: JSON.stringify({ data: { attributes: { type: "qrph" } } }),
  });

  const attached = await call<any>(
    `/payment_intents/${intent.data.id}/attach`,
    {
      method: "POST",
      body: JSON.stringify({
        data: { attributes: { payment_method: method.data.id } },
      }),
    }
  );

  const next = attached.data.attributes.next_action;
  const code = next?.code;
  if (next?.type !== "consume_qr" || !code?.image_url) {
    throw new Error(
      `Expected a QR from PayMongo but got next_action "${next?.type ?? "none"}". ` +
        "QRPh may not be available on this account."
    );
  }

  const expiresAt: string | null = code.expires_at ?? null;
  // Measured here, on the server, so the client never has to trust its own
  // clock. PayMongo currently gives QRPh codes about 30 minutes; the 600s
  // floor is only a guard for a missing or nonsensical expiry.
  const expiresInSeconds = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : 600;

  return {
    paymentIntentId: intent.data.id,
    clientKey: intent.data.attributes.client_key,
    qrImageUrl: code.image_url,
    expiresAt,
    expiresInSeconds,
    amountCentavos: amount,
    testUrl: code.test_url ?? null,
  };
}

/**
 * Void a payment intent so its QR can no longer be paid.
 *
 * This is what makes expiry real rather than cosmetic. Without it, hiding
 * the QR behind an "expired" overlay only stops the guest *seeing* it — the
 * intent stays live and a late scan could still take their money for a
 * booking the site has already given up on.
 *
 * Returns false rather than throwing: cancelling is cleanup, and failing to
 * cancel should never take down the screen that called it.
 */
export async function cancelPayment(paymentIntentId: string): Promise<boolean> {
  try {
    await call(`/payment_intents/${paymentIntentId}/cancel`, { method: "POST" });
    return true;
  } catch (err) {
    // Already paid or already cancelled both land here, and both are fine.
    console.warn("[paymongo] cancel failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Current status of a payment intent, read straight from PayMongo. */
export async function getPaymentStatus(
  paymentIntentId: string
): Promise<{ status: PaymentStatus; paidAt: number | null }> {
  const res = await call<any>(`/payment_intents/${paymentIntentId}`);
  const attrs = res.data.attributes;
  const payment = attrs.payments?.[0];

  return {
    status: (attrs.status ?? "unknown") as PaymentStatus,
    paidAt: payment?.attributes?.paid_at
      ? payment.attributes.paid_at * 1000
      : null,
  };
}
