// ── POST /api/auth/forgot/verify  { login, challenge, code }
//
// The code from /api/auth/forgot. Right: the person is signed in (the same
// session cookie as a normal sign-in) and gets a 15-minute reset token for
// /api/auth/reset-password, so the page can suggest a new password.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, tooManyRequests, resetRateLimit } from "@/lib/rateLimit";
import { challengeId, checkEmailCode, EMAIL_CODE_TRIES } from "@/lib/emailCode.server";
import { findStaffForReset, identityOf, enterStaff, staffTableReady } from "@/lib/staff.server";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { newResetToken } from "@/lib/passwordReset.server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin } from "@/lib/supabase";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest) {
  const all = rateLimit(req, { name: "pw-forgot-verify", limit: 30, windowMs: 60 * 60 * 1000 });
  if (!all.ok) return tooManyRequests(all.retryAfter);
  const body = (await readJson(req).catch(() => ({}))) as { login?: unknown; challenge?: unknown; code?: unknown };
  const id = challengeId(body.challenge);
  if (!id) return no("Ask for a code first.");
  const tries = rateLimit(req, { name: `pw-forgot-try:${id}`, limit: EMAIL_CODE_TRIES, windowMs: 15 * 60 * 1000 });
  if (!tries.ok) return no("That code has had too many tries. Ask for a new one.", 429);

  try {
    const found = (await staffTableReady()) ? await findStaffForReset(String(body.login ?? "")) : null;
    const r = found ? checkEmailCode(body.challenge, found.email, body.code) : { ok: false as const, reason: "wrong" as const };
    if (!found || !r.ok) {
      return no(!r.ok && r.reason === "expired" ? "That code has expired. Ask for a new one." : "That code isn't right. Use the code in the newest email.");
    }
    const who = identityOf(found.rec);
    const token = createSessionToken(who);
    await getSupabaseAdmin().from("staff").update({ last_login_at: new Date().toISOString() }).eq("id", found.rec.id);
    enterStaff(who);
    await logActivity({ actor: "Admin", action: "security.login_reset", entity: "admin", summary: `${who.name} signed in with a code sent to their email (forgotten password).` });
    const res = NextResponse.json({
      success: true,
      resetToken: newResetToken(found.rec.id),
      staff: { id: who.id, name: who.name, username: who.username, role: who.role },
    });
    res.cookies.set(sessionCookie(token));
    resetRateLimit(req, "login");
    return res;
  } catch (err) {
    console.error("[/api/auth/forgot/verify]", err instanceof Error ? err.message : err);
    return no("Couldn't check the code. Try again.", 500);
  }
}
