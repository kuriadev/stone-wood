// ── POST /api/email-code  → email a 6-digit code to the address Book Now has
//
// Public: a guest has no account. Returns a sealed challenge the browser
// sends back with the code (/api/email-code/verify). See
// lib/emailCode.server.ts for how the code is checked without storing it.

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail } from "@/lib/validators";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { buildEmailCodeEmail } from "@/lib/emailTemplate";
import { newEmailCode, EMAIL_CODE_TTL_MS, EMAIL_CODE_RESEND_S } from "@/lib/emailCode.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; purpose?: unknown };
  // Only changes the email's wording (lib/emailTemplate.ts).
  const purpose = body.purpose === "manage" || body.purpose === "staff" ? body.purpose : "booking";
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid email address first." }, { status: 400 });
  }

  // Each send spends the resort's Gmail quota, so: one per address per
  // minute (the button counts down the same minute), and a few an hour
  // from one connection, whatever the address.
  const wait = rateLimit(req, { name: `email-code-wait:${email}`, limit: 1, windowMs: EMAIL_CODE_RESEND_S * 1000 });
  if (!wait.ok) {
    return NextResponse.json(
      { success: false, error: `A code was just sent. You can ask for another in ${wait.retryAfter} seconds.`, retryAfter: wait.retryAfter },
      { status: 429, headers: { "Retry-After": String(wait.retryAfter) } },
    );
  }
  const hourly = rateLimit(req, { name: "email-code-send", limit: 8, windowMs: 60 * 60 * 1000 });
  if (!hourly.ok) return tooManyRequests(hourly.retryAfter);

  // Without mail there is no way to confirm an address, so no online
  // booking can go ahead: say so plainly rather than time out.
  if (!isMailConfigured()) {
    console.error("[/api/email-code] GMAIL_USER / GMAIL_APP_PASSWORD are not set.");
    return NextResponse.json(
      { success: false, error: "We can't send email right now, so online booking is paused. Please message the resort to book." },
      { status: 503 },
    );
  }

  const { code, challenge, expiresAt } = newEmailCode(email);
  try {
    await sendMail({ to: email, ...buildEmailCodeEmail(code, Math.round(EMAIL_CODE_TTL_MS / 60000), purpose) });
  } catch (err) {
    console.error("[/api/email-code] send failed:", err);
    return NextResponse.json(
      { success: false, error: "We couldn't send a code to that address. Check it for typos and try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true, challenge, expiresAt, resendIn: EMAIL_CODE_RESEND_S });
}
