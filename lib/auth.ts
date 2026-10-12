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
import { can, canRequest, isStaffRole, type Permission, type StaffRole } from "@/lib/permissions";
import {
  enterStaff, findStaffById, identityOf, staffTableReady, checkStaffCredentials, bootstrapOwner,
  type StaffIdentity,
} from "@/lib/staff.server";
import { ensureSettings } from "@/lib/settings.server";

export const SESSION_COOKIE = "sw_admin_session";

/** Eight hours: long enough for a shift, short enough that a forgotten
 *  session on a shared front-desk machine expires on its own. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/* ── Idle logout ──────────────────────────────────────────────────────
 *
 * An unattended admin screen in a resort office is the realistic threat
 * here, so a session also dies after 30 minutes of the admin not DOING
 * anything — separately from the 8-hour absolute cap above.
 *
 * "Not doing anything" deliberately does not mean "no HTTP requests". The
 * admin screen polls in the background (OpsContext, useMaintenance), so a
 * timer driven by request traffic would never expire — the tab alone would
 * keep the session alive all night.
 *
 * Instead the clock is reset only by POST /api/auth/touch, which the admin
 * shell calls when it sees a real pointer or key event. Background polling
 * never touches it, so walking away genuinely ends the session, and the
 * check is still made on the SERVER: the browser can fail to log itself
 * out, but it cannot make a stale cookie valid. */
export const IDLE_TTL_MS = 30 * 60 * 1000;

interface SessionPayload {
  /** Username the session was issued to. */
  u: string;
  /** Expiry, epoch ms. The absolute cap: 8 hours, whatever happens. */
  exp: number;
  /** Nonce, so two sessions issued in the same millisecond differ. */
  n: string;
  /** Last time the ADMIN did something, epoch ms. Absent on tokens issued
   *  before idle logout existed; those fall back to their issue time. */
  s?: number;
  /** Staff id (lib/staff.server.ts). Absent for the single pre-staff
   *  sign-in and for tokens issued before staff accounts existed. */
  sid?: string;
  /** Role at sign-in. The server re-reads the current role on each guarded
   *  request; this is what a token without a staff row falls back to. */
  r?: StaffRole;
  /** Display name at sign-in, for the activity log. */
  nm?: string;
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

function encodeSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** A signed session for this person. A bare username is the single
 *  pre-staff sign-in, which is the Owner. */
export function createSessionToken(who: string | StaffIdentity): string {
  const now = Date.now();
  const id: StaffIdentity = typeof who === "string" ? legacyOwner(who) : who;
  return encodeSession({
    u: id.username,
    exp: now + SESSION_TTL_MS,
    n: randomBytes(9).toString("base64url"),
    s: now,
    ...(id.id ? { sid: id.id } : {}),
    r: id.role,
    nm: id.name,
  });
}

/** The one admin there was before staff accounts: the owner. */
export const legacyOwner = (username: string): StaffIdentity => ({ id: null, name: username, username, role: "Owner" });

/**
 * Sign-in for anyone: a staff account once the staff table has rows, and
 * otherwise the single pre-staff sign-in — which, the first time it
 * succeeds after the migration, becomes the Owner's staff row.
 */
export async function authenticate(username: string, password: string): Promise<StaffIdentity | null> {
  const staff = await checkStaffCredentials(username, password, hashPassword);
  if (staff !== "legacy") return staff ? identityOf(staff) : null;
  if (!(await checkAdminCredentials(username, password))) return null;
  const owner = await bootstrapOwner(username, password, hashPassword, newSalt());
  return owner ? identityOf(owner) : legacyOwner(username);
}

/** Restart the idle clock after real admin activity. The absolute expiry is
 *  carried over untouched, so this can never extend a session past its
 *  8 hours. */
export function touchSessionToken(payload: SessionPayload, now = Date.now()): string {
  return encodeSession({ ...payload, s: now, n: randomBytes(9).toString("base64url") });
}

/** @param now  Injectable clock. Production never passes it; it exists so
 *  the expiry rules can actually be tested without waiting 30 minutes. */
export function verifySessionToken(token: string | undefined, now = Date.now()): SessionPayload | null {
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
    if (typeof payload?.exp !== "number" || now > payload.exp) return null;
    if (typeof payload?.u !== "string" || !payload.u) return null;
    // Idle expiry. A token minted before `s` existed is judged from when it
    // was issued, so the rule applies to sessions already open at deploy.
    const seen = typeof payload.s === "number" ? payload.s : payload.exp - SESSION_TTL_MS;
    if (now - seen > IDLE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAdminRequest(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value) !== null;
}

/** The live session on a request, or null. */
export function sessionOf(req: NextRequest): SessionPayload | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Guard for a route handler. Returns a 401 response to return as-is, or
 *  null when the caller is signed in (any role).
 *
 *      const denied = requireAdmin(req);
 *      if (denied) return denied;
 *
 *  Most routes want requirePermission instead, which also checks the role.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const s = sessionOf(req);
  if (s) {
    enterStaff(identityFromSession(s));
    return null;
  }
  return NextResponse.json(
    { success: false, error: "Not authorised." },
    { status: 401 }
  );
}

/** Who a session says it is, without a database read. */
export function identityFromSession(s: SessionPayload): StaffIdentity {
  return {
    id: s.sid ?? null,
    name: s.nm || s.u,
    username: s.u,
    role: isStaffRole(s.r) ? s.r : "Owner",
  };
}

/**
 * Who the session belongs to NOW: the staff row re-read (a few seconds'
 * cache), so a deactivated person is out at their next click and a changed
 * role applies at once. Null when the account is gone or deactivated.
 *
 * A token with no staff id is the single pre-staff sign-in (or one issued
 * before the migration): the Owner, until it expires.
 */
export async function currentIdentity(s: SessionPayload): Promise<StaffIdentity | null> {
  const fromToken = identityFromSession(s);
  if (!s.sid) return fromToken;
  if (!(await staffTableReady())) return fromToken;
  try {
    const row = await findStaffById(s.sid);
    return row && row.active ? identityOf(row) : null;
  } catch (err) {
    // The database is unreachable: the route itself will fail on its own
    // query in a moment. Judge by the token rather than lock everyone out.
    console.error("[auth] could not re-read staff:", err);
    return fromToken;
  }
}

const unauthorised = (error = "Not authorised.") =>
  NextResponse.json({ success: false, error }, { status: 401 });

const forbidden = () =>
  NextResponse.json({ success: false, error: "Your role can't do this. Ask the owner." }, { status: 403 });

/**
 * The guard every admin route uses: is this person signed in, still
 * active, and allowed to do `perm`?
 *
 *     const denied = await requirePermission(req, "payments.void");
 *     if (denied) return denied;
 *
 * When they can't but may ASK (front desk voiding a payment), the call is
 * recorded as a request to the owner and answered with 202
 * `{ success: false, requested: true }` — nothing happens until the owner
 * approves it (lib/ownerRequests.server.ts).
 *
 * Deliberately not an `async function`: the part that marks who is acting
 * (enterStaff) has to run in the route handler's own synchronous code for
 * the activity log to see it through every later await. Only the checks
 * after it are async.
 */
export function requirePermission(req: NextRequest, perm: Permission): Promise<NextResponse | null> {
  const s = sessionOf(req);
  if (!s) return Promise.resolve(unauthorised());
  const acting = identityFromSession(s);
  enterStaff(acting);
  return (async () => {
    const [who] = await Promise.all([currentIdentity(s), ensureSettings()]);
    if (!who) return unauthorised("Your account is no longer active. Ask the owner.");
    // The store holds the object enterStaff was given; refreshing it in
    // place keeps the log's name and role current without a new context.
    Object.assign(acting, who);
    if (can(who.role, perm)) return null;
    if (!canRequest(who.role, perm)) return forbidden();
    return askOwner(req, perm, who, undefined);
  })();
}

/**
 * The same decision part-way through a route, once it knows what the call
 * really is — a booking PATCH that turns out to be a cancellation, a
 * payment that is a refund. `body` is what the route already parsed.
 */
export async function ownerGate(req: NextRequest, perm: Permission, body: unknown): Promise<NextResponse | null> {
  const s = sessionOf(req);
  if (!s) return unauthorised();
  const who = await currentIdentity(s);
  if (!who) return unauthorised("Your account is no longer active. Ask the owner.");
  if (can(who.role, perm)) return null;
  if (!canRequest(who.role, perm)) return forbidden();
  return askOwner(req, perm, who, body);
}

async function askOwner(req: NextRequest, perm: Permission, who: StaffIdentity, body: unknown): Promise<NextResponse> {
  // Loaded only when a request is actually made, so the guard on every
  // other call stays light.
  const { createOwnerRequest, peekBody, pathOf } = await import("@/lib/ownerRequests.server");
  const r = await createOwnerRequest({
    perm, method: req.method, path: pathOf(req), who,
    body: body === undefined ? await peekBody(req) : body,
  });
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.missingTable ? 403 : 500 });
  return NextResponse.json({
    success: false,
    requested: true,
    requestId: r.id,
    error: r.duplicate
      ? "This is already waiting for the owner's approval."
      : "Sent to the owner for approval. It goes through once they approve it.",
  }, { status: 202 });
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

/** Re-issued on activity: same cookie settings, a freshly stamped token. */
export const refreshedSessionCookie = (payload: SessionPayload) =>
  sessionCookie(touchSessionToken(payload));

export const clearedSessionCookie = () => ({ ...sessionCookie(""), maxAge: 0 });
