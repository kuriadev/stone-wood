// ── POST   /api/payment/desk { amount, description } → a QR Ph code for a walk-in   (staff: payments.record)
// ── GET    /api/payment/desk?id=                      → has it been paid?
// ── DELETE /api/payment/desk?id=                      → cancel it (the code stops working)
//
// The front desk's QR Ph code: the guest scans it with any QR Ph e-wallet and
// the walk-in saves itself once PayMongo says it was paid. The walk-in
// route checks the payment again with PayMongo before it records anything
// (lib/walkIn.server.ts), so the amount on screen is the amount received.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { requirePermission } from "@/lib/auth";
import { createQrPayment, getPaymentStatus, cancelPayment, MIN_AMOUNT_CENTAVOS } from "@/lib/paymongo";

export const dynamic = "force-dynamic";

const isIntent = (v: string) => /^pi_[A-Za-z0-9]+$/.test(v);

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "payments.record");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { amount?: unknown; description?: unknown };
  const amount = Math.round(Number(body.amount) * 100);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_CENTAVOS) {
    return NextResponse.json({ success: false, error: `A QR payment has to be at least ₱${MIN_AMOUNT_CENTAVOS / 100}.` }, { status: 400 });
  }
  if (amount > 100_000_000) return NextResponse.json({ success: false, error: "That amount is too large." }, { status: 400 });
  try {
    const payment = await createQrPayment({
      amountCentavos: amount,
      referenceId: `DESK-${randomBytes(4).toString("hex").toUpperCase()}`,
      description: `Stonewood Garden walk-in — ${String(body.description ?? "").replace(/[<>]/g, "")}`.slice(0, 255),
    });
    return NextResponse.json({ success: true, payment });
  } catch (err) {
    console.error("[/api/payment/desk POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Couldn't make a QR code right now. Use the reference number instead, or try again." }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "payments.record");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isIntent(id)) return NextResponse.json({ success: false, error: "Which payment?" }, { status: 400 });
  try {
    const s = await getPaymentStatus(id);
    return NextResponse.json({ success: true, status: s.status, paid: s.status === "succeeded", amount: s.amountCentavos / 100 });
  } catch (err) {
    console.error("[/api/payment/desk GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Couldn't check the payment." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "payments.record");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isIntent(id)) return NextResponse.json({ success: false, error: "Which payment?" }, { status: 400 });
  const ok = await cancelPayment(id);
  return NextResponse.json({ success: true, cancelled: ok });
}
