// ── POST /api/auth/forgot  { login } → a sign-in code to the account's email
//
// `login` is a username or a staff email. When it matches an active account
// with a confirmed email, a 6-digit code goes to that email. The answer is
// the same either way, with a challenge in both cases, so this can't be used
// to find out which usernames or emails exist.
// lib/passwordReset.server.ts has the whole flow.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { buildEmailCodeEmail } from "@/lib/emailTemplate";
import { newEmailCode, EMAIL_CODE_TTL_MS, EMAIL_CODE_RESEND_S } from "@/lib/emailCode.server";
import { findStaffForReset, staffTableReady } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const hourly = rateLimit(req, { name: "pw-forgot", limit: 6, windowMs: 60 * 60 * 1000 });
  if (!hourly.ok) return tooManyRequests(hourly.retryAfter);
  const body = (await readJson(req).catch(() => ({}))) as { login?: unknown };
  const login = String(body.login ?? "").trim().toLowerCase().slice(0, 120);
  if (!login) return NextResponse.json({ success: false, error: "Enter your username or email." }, { status: 400 });

  const wait = rateLimit(req, { name: `pw-forgot-wait:${login}`, limit: 1, windowMs: EMAIL_CODE_RESEND_S * 1000 });
  if (!wait.ok) {
    return NextResponse.json({ success: false, error: `A code was just sent. You can ask for another in ${wait.retryAfter} seconds.`, retryAfter: wait.retryAfter }, { status: 429 });
  }
  if (!isMailConfigured()) {
    return NextResponse.json({ success: false, error: "Email isn't set up on the server, so a code can't be sent. Ask the resort owner to reset your password." }, { status: 503 });
  }

  try {
    const found = (await staffTableReady()) ? await findStaffForReset(login) : null;
    // No account: a challenge for an address nobody owns, which no code fits.
    const target = found?.email ?? `nobody-${randomBytes(6).toString("hex")}@invalid.local`;
    const { code, challenge } = newEmailCode(target);
    if (found) {
      await sendMail({ to: found.email, ...buildEmailCodeEmail(code, Math.round(EMAIL_CODE_TTL_MS / 60000), "reset") });
      await logActivity({ actor: "Guest", action: "security.reset_code_sent", entity: "staff", entityId: found.rec.id, summary: `A password-reset code was emailed to ${found.rec.name}.` });
    }
    return NextResponse.json({ success: true, challenge, resendIn: EMAIL_CODE_RESEND_S });
  } catch (err) {
    console.error("[/api/auth/forgot]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "The code couldn't be sent. Try again in a moment." }, { status: 502 });
  }
}
