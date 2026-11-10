// ── POST /api/auth/reset-password  { resetToken, password }
//
// A new password after a forgotten-password sign-in. The token comes from
// /api/auth/forgot/verify and is good for 15 minutes; no current password.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { readResetToken } from "@/lib/passwordReset.server";
import { passwordProblem, setOwnPassword, findStaffById, enterStaff, identityOf } from "@/lib/staff.server";
import { hashPassword, newSalt } from "@/lib/auth";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { name: "pw-reset", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);
  const body = (await req.json().catch(() => ({}))) as { resetToken?: unknown; password?: unknown };
  const id = readResetToken(body.resetToken);
  if (!id) return NextResponse.json({ success: false, error: "This reset has expired. Sign in again with a new code." }, { status: 401 });
  const password = String(body.password ?? "");
  const bad = passwordProblem(password);
  if (bad) return NextResponse.json({ success: false, error: bad }, { status: 400 });
  try {
    const rec = await findStaffById(id);
    if (!rec || !rec.active) return NextResponse.json({ success: false, error: "That account isn't active." }, { status: 403 });
    await setOwnPassword(id, password, hashPassword, newSalt());
    enterStaff(identityOf(rec));
    await logActivity({ actor: "Admin", action: "security.password_reset", entity: "staff", entityId: id, summary: `${rec.name} set a new password after confirming their email.` });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/auth/reset-password]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "The new password couldn't be saved." }, { status: 500 });
  }
}
