// ── POST /api/email-code/verify  → the code the guest typed, checked
//
// Takes { email, challenge, code }. A right code returns a sealed proof
// for that address, which Book Now sends with the booking; the
// pre-payment check and the QR payment refuse a booking without it
// (lib/bookingQuote.ts). See lib/emailCode.server.ts.

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { challengeId, checkEmailCode, EMAIL_CODE_TRIES } from "@/lib/emailCode.server";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest) {
  const all = rateLimit(req, { name: "email-code-verify", limit: 40, windowMs: 60 * 60 * 1000 });
  if (!all.ok) return tooManyRequests(all.retryAfter);

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; challenge?: unknown; code?: unknown };
  const id = challengeId(body.challenge);
  if (!id) return no("Send yourself a code first.");

  // Every try counts, right or wrong: a code allows EMAIL_CODE_TRIES.
  const tries = rateLimit(req, { name: `email-code-try:${id}`, limit: EMAIL_CODE_TRIES, windowMs: 15 * 60 * 1000 });
  if (!tries.ok) return no("That code has had too many tries. Send a new one.", 429);

  const r = checkEmailCode(body.challenge, body.email, body.code);
  if (r.ok) return NextResponse.json({ success: true, proof: r.proof, expiresAt: r.expiresAt });
  switch (r.reason) {
    case "other-email": return no("That code was sent to a different address. Send a code to this one.");
    case "expired": return no("That code has expired. Send a new one.");
    case "wrong": return no("That code isn't right. If you asked for more than one, use the code in the newest email.");
    default: return no("Send yourself a code first.");
  }
}
