// ── A forgotten staff password (server only)
//
// 1. POST /api/auth/forgot          a username or email → a 6-digit code to
//                                   the account's confirmed email
// 2. POST /api/auth/forgot/verify   the code → signed in, plus a short-lived
//                                   reset token
// 3. POST /api/auth/reset-password  the token + a new password
//
// The reset token is a signed note "this staff id may set a new password
// until …", so step 3 needs no current password and works only for the
// person who just proved they own the email.

import { createHmac, timingSafeEqual } from "crypto";

export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET is missing or too short.");
  return s;
}
const sign = (body: string) => createHmac("sha256", secret()).update(`pw-reset:${body}`).digest("base64url");

export function newResetToken(staffId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ id: staffId, exp: now + RESET_TOKEN_TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The staff id the token is for, or null when it is forged or expired. */
export function readResetToken(token: unknown, now = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { id?: unknown; exp?: unknown };
    return typeof p.id === "string" && typeof p.exp === "number" && p.exp > now ? p.id : null;
  } catch {
    return null;
  }
}

/** "an••••@gmail.com", so the person knows which inbox to check. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "your email";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(2, user.length - 2))}@${domain}`;
}
