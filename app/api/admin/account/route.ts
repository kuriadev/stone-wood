// ── GET   /api/admin/account  → the username currently in force (admin only)
// ── PATCH /api/admin/account  → change the username and/or password (admin only)
//
// Changing a password is the most attractive single request in the app: it
// hands over the account. So on top of the session cookie every call must
// carry the CURRENT password. A stolen or left-open session can then browse
// the admin, but it cannot lock the owner out of it.
//
// The new password is hashed with scrypt and a fresh random salt before it
// is written. The plaintext never reaches the database, the logs or the
// response, and the activity entry records only that a change happened.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  requireAdmin, checkAdminCredentials, hashPassword, newSalt,
  currentAdminUsername, SESSION_COOKIE,
} from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

/** Long enough to be worth hashing. Short minimums are the reason admin
 *  passwords end up being the resort's name and a digit. */
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;
const MIN_USERNAME = 3;
const MAX_USERNAME = 64;

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ success: true, username: await currentAdminUsername() });
  } catch (err) {
    console.error("[/api/admin/account GET]", err);
    return NextResponse.json({ success: false, error: "Could not read the account." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  // Slow down guessing of the current password. Keyed per client, same as
  // the login route.
  const limit = rateLimit(req, { name: "admin-account", limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  try {
    const b = await req.json().catch(() => ({}));
    const currentPassword = String(b.currentPassword ?? "");
    const username = String(b.username ?? "").trim();
    const newPassword = String(b.newPassword ?? "");

    if (username.length < MIN_USERNAME || username.length > MAX_USERNAME) {
      return NextResponse.json({ success: false, error: `The username must be ${MIN_USERNAME} to ${MAX_USERNAME} characters.` }, { status: 400 });
    }
    if (/\s/.test(username)) {
      return NextResponse.json({ success: false, error: "The username cannot contain spaces." }, { status: 400 });
    }
    // An empty newPassword means "keep the current one".
    if (newPassword && (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD)) {
      return NextResponse.json({ success: false, error: `The new password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
    }
    if (newPassword && newPassword === currentPassword) {
      return NextResponse.json({ success: false, error: "The new password is the same as the current one." }, { status: 400 });
    }

    // The gate. Proving the session is not enough; prove the password.
    const who = await currentAdminUsername();
    if (!currentPassword || !(await checkAdminCredentials(who, currentPassword))) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
      await logActivity({
        actor: "Admin", action: "security.account_change_denied", entity: "admin",
        summary: `An admin account change was refused: the current password did not match (from ${ip}).`,
        details: { ip },
      });
      return NextResponse.json({ success: false, error: "That is not the current password." }, { status: 401 });
    }

    const salt = newSalt();
    const effective = newPassword || currentPassword;
    const { error } = await getSupabaseAdmin()
      .from("admin_credentials")
      .upsert({
        id: 1,
        username,
        password_hash: hashPassword(effective, salt),
        password_salt: salt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) {
      // The most likely cause by far is the migration not being applied.
      console.error("[/api/admin/account PATCH]", error.message);
      return NextResponse.json({
        success: false,
        error: /admin_credentials/i.test(error.message)
          ? "The admin_credentials table is missing. Apply the 20261004120000 migration and try again."
          : "Could not save the account.",
      }, { status: 500 });
    }

    await logActivity({
      actor: "Admin", action: "security.account_changed", entity: "admin",
      summary: newPassword
        ? `The admin sign-in was changed (username "${username}", new password).`
        : `The admin username was changed to "${username}".`,
      details: { usernameChanged: username !== who, passwordChanged: !!newPassword },
    });

    // Sign the session out. The credentials behind it have just changed, so
    // the right next step is to prove the new ones — and any OTHER session
    // on this account stops being useful at its next sign-in too.
    const res = NextResponse.json({ success: true, signedOut: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[/api/admin/account PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not save the account." }, { status: 500 });
  }
}
