// ── Admin session
//
// SERVER ONLY. Never import this from a "use client" component.
//
// The app previously compared the admin username and password inside
// AdminLogin, a client component, against ADMIN_CREDS in lib/constants.ts.
// That put the real password into the JavaScript bundle: anyone could open
// DevTools, search the bundle, and read it. Worse, the check itself ran in the
// browser, so even without the password an attacker could flip the result.
//
// Credentials now live in env vars and are compared here. The browser gets a
// signed, httpOnly cookie it cannot read or forge, and the API routes that do
// privileged work require that cookie.

import { createHmac, timingSafeEqual, createHash, randomBytes, scryptSync } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "sw_admin_session";

/** Eight hours: long enough for a shift, short enough that a forgotten
 *  session on a shared front-desk machine expires on its own. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface SessionPayload {
  /** Username the session was issued to. */
  u: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** Nonce, so two sessions issued in the same millisecond differ. */
  n: string;
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  // Fail closed and loudly. A default secret would be worse than no secret:
  // it would look like it works while anyone who has read this file could
  // mint themselves an admin cookie.
  if (s.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Add a random 32+ character " +
        "value to .env.local (and to the Vercel environment). Generate one " +
        'with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return s;
}

const sign = (payload: string): string =>
  createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

/** Constant-time string comparison.
 *
 *  Both sides are hashed first so the buffers are always 32 bytes —
 *  timingSafeEqual throws on a length mismatch, and that throw would itself
 *  leak the length of the real password. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Derive a password hash. scrypt is deliberately slow and memory-hard, so a
 *  stolen table cannot be run through a dictionary at speed. Node ships it —
 *  no dependency, nothing to keep patched. */
export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("base64");
}

export function newSalt(): string {
  return randomBytes(16).toString("base64");
}

/** The credentials in force: the stored row if there is one, otherwise the
 *  env vars. The table starts empty, so a deployment that never opens the
 *  Admin account screen keeps behaving exactly as before. */
async function currentCredentials(): Promise<
  { username: string; hash: string; salt: string } | { username: string; plain: string } | null
> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("admin_credentials")
      .select("username, password_hash, password_salt")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data?.username) {
      return { username: data.username, hash: data.password_hash, salt: data.password_salt };
    }
  } catch {
    // The table may not exist yet (migration not applied). Fall through to
    // the env vars rather than locking the owner out of their own admin.
  }
  const u = process.env.ADMIN_USERNAME ?? "";
  const p = process.env.ADMIN_PASSWORD ?? "";
  return u && p ? { username: u, plain: p } : null;
}

/** Check a submitted username/password.
 *
 *  Returns false when nothing is configured, so a misconfigured deploy
 *  refuses everyone rather than accepting empty credentials. */
export async function checkAdminCredentials(username: string, password: string): Promise<boolean> {
  const creds = await currentCredentials();
  if (!creds) return false;

  // Both comparisons always run: returning early on a wrong username would
  // make a wrong-username response measurably faster than a wrong-password
  // one, which tells an attacker when they have found a valid username.
  const userOk = safeEqual(username, creds.username);
  const passOk = "hash" in creds
    ? safeEqual(hashPassword(password, creds.salt), creds.hash)
    : safeEqual(password, creds.plain);
  return userOk && passOk;
}

/** The username currently in force, for showing on the account screen. */
export async function currentAdminUsername(): Promise<string> {
  const creds = await currentCredentials();
  return creds?.username ?? "";
}

export function createSessionToken(username: string): string {
  const payload: SessionPayload = {
    u: username,
    exp: Date.now() + SESSION_TTL_MS,
    n: randomBytes(9).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(encoded);
  } catch {
    // SESSION_SECRET is unset. No session can be valid.
    return null;
  }
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;
    if (typeof payload?.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload?.u !== "string" || !payload.u) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAdminRequest(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value) !== null;
}

/** Guard for a route handler. Returns a 401 response to return as-is, or
 *  null when the caller is a signed-in admin.
 *
 *      const denied = requireAdmin(req);
 *      if (denied) return denied;
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  if (isAdminRequest(req)) return null;
  return NextResponse.json(
    { success: false, error: "Not authorised." },
    { status: 401 }
  );
}

export const sessionCookie = (token: string) =>
  ({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,           // JavaScript, including any injected script, cannot read it
    sameSite: "lax" as const, // not sent on cross-site POSTs, which blocks CSRF
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

export const clearedSessionCookie = () => ({ ...sessionCookie(""), maxAge: 0 });
