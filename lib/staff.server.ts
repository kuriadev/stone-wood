// ── Staff accounts (server only)
//
// SERVER ONLY — reads the staff table with the service-role key.
//
// Who is signed in, and what they are allowed to be. The session cookie
// (lib/auth.ts) carries the staff id and role from sign-in; every guarded
// request re-reads the row here (cached for a few seconds), so a person the
// owner deactivates or moves to another role is held to that at their next
// click, not when their 8-hour session runs out.
//
// ── Before the migration ──
//
// 20261012120000_staff_and_owner_requests.sql may not be applied yet (the
// database is the partner's to update). Until it is, staffTableReady() is
// false, sign-in works exactly as it always has — the single
// admin_credentials row or the ADMIN_* env vars — and that person is the
// Owner. Nothing here can lock the owner out of their own admin.
//
// ── The first sign-in after it ──
//
// The table starts empty. The first time the existing credentials sign in,
// their Owner row is created from them, so the owner keeps their username
// and password and nobody has to type staff in before work can start.

import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isStaffRole, type StaffRole } from "@/lib/permissions";

/** The person behind a request. `id` is null for the single pre-migration
 *  sign-in, which has no row to point at. */
export interface StaffIdentity {
  id: string | null;
  name: string;
  username: string;
  role: StaffRole;
  mustChangePassword?: boolean;
}

export interface StaffRecord {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** The owner can look this password up (the eye on Staff Accounts). */
  canReveal: boolean;
}

interface StaffRow {
  id: string;
  name: string;
  username: string;
  role: string;
  password_hash: string;
  password_salt: string;
  active: boolean;
  must_change_password: boolean | null;
  created_at: string;
  last_login_at: string | null;
  /** The password, encrypted. Null until saved (older accounts, or the
   *  migration is not applied). See sealPassword. */
  password_reveal?: string | null;
}

const toRecord = (r: StaffRow): StaffRecord => ({
  id: r.id,
  name: r.name,
  username: r.username,
  role: isStaffRole(r.role) ? r.role : "Caretaker",
  active: r.active,
  mustChangePassword: !!r.must_change_password,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
  canReveal: !!r.password_reveal,
});

export const identityOf = (r: StaffRecord): StaffIdentity => ({
  id: r.id, name: r.name, username: r.username, role: r.role, mustChangePassword: r.mustChangePassword,
});

// ── Who is acting, for the length of one request ─────────────────────
//
// requirePermission (lib/auth.ts) puts the signed-in person here, and
// logActivity reads it, so the 48 places that log "Admin did X" record WHICH
// admin without each being changed to pass a name along.
const acting = new AsyncLocalStorage<StaffIdentity>();

/** Mark the rest of this request as done by `who`. Must be called from the
 *  route handler's own synchronous code (requirePermission does), so the
 *  context carries through every await that follows in that handler. */
export function enterStaff(who: StaffIdentity): void {
  acting.enterWith(who);
}

/** The person this request is acting for, or null for guests and the system. */
export function actingStaff(): StaffIdentity | null {
  return acting.getStore() ?? null;
}

// ── Is the table there yet? ──────────────────────────────────────────
/** A Supabase error that means the staff table (or a column of it) doesn't
 *  exist — the migration isn't applied yet. */
export function missingStaffTable(err: { message?: string; code?: string } | null | undefined): boolean {
  const msg = err?.message ?? "";
  return err?.code === "42P01" || err?.code === "PGRST205" ||
    (/staff|owner_requests/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg));
}

let readyCache: { at: number; ready: boolean } | null = null;
const READY_TTL_MS = 60_000;

export async function staffTableReady(): Promise<boolean> {
  if (readyCache && Date.now() - readyCache.at < READY_TTL_MS) return readyCache.ready;
  try {
    const { error } = await getSupabaseAdmin().from("staff").select("id", { head: true, count: "exact" }).limit(1);
    const ready = !error;
    if (error && !missingStaffTable(error)) console.error("[staff] could not check the staff table:", error.message);
    readyCache = { at: Date.now(), ready };
    return ready;
  } catch {
    return false;
  }
}

// ── Lookups ──────────────────────────────────────────────────────────
const byIdCache = new Map<string, { at: number; rec: StaffRecord | null }>();
/** Short, because this is what makes a deactivation take effect. */
const BY_ID_TTL_MS = 10_000;

export function forgetStaff(id?: string): void {
  if (id) byIdCache.delete(id);
  else byIdCache.clear();
}

export async function findStaffById(id: string): Promise<StaffRecord | null> {
  const hit = byIdCache.get(id);
  if (hit && Date.now() - hit.at < BY_ID_TTL_MS) return hit.rec;
  const { data, error } = await getSupabaseAdmin().from("staff").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const rec = data ? toRecord(data as StaffRow) : null;
  byIdCache.set(id, { at: Date.now(), rec });
  return rec;
}

async function findRowByUsername(username: string): Promise<StaffRow | null> {
  const { data, error } = await getSupabaseAdmin().from("staff").select("*").ilike("username", escapeLike(username)).limit(1);
  if (error) throw new Error(error.message);
  return ((data as StaffRow[] | null) ?? [])[0] ?? null;
}

/** ilike with the wildcards escaped, so "a_b" matches only "a_b". */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listStaff(): Promise<StaffRecord[]> {
  const { data, error } = await getSupabaseAdmin().from("staff").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data as StaffRow[]).map(toRecord);
}

async function staffCount(): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("staff").select("id", { head: true, count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ── Passwords ────────────────────────────────────────────────────────
/** Constant-time comparison of two strings of any length. */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const STAFF_PASSWORD_MIN = 8;
export const STAFF_PASSWORD_MAX = 128;
export const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

export function passwordProblem(pw: string): string | null {
  if (pw.length < STAFF_PASSWORD_MIN) return `The password must be at least ${STAFF_PASSWORD_MIN} characters.`;
  if (pw.length > STAFF_PASSWORD_MAX) return "That password is too long.";
  return null;
}

export function usernameProblem(u: string): string | null {
  return USERNAME_RE.test(u) ? null : "Usernames are 3 to 32 letters, numbers, dots, dashes or underscores — no spaces.";
}

// ── Looking a password up (the owner's eye) ──────────────────────────
//
// Sign-in checks the scrypt hash and never reads this. The copy exists only
// so the owner can read a password back to someone who forgot it, so it is
// ENCRYPTED, not stored as text: AES-256-GCM with a key derived from
// SESSION_SECRET, which lives in the server's environment and not in the
// database. If that secret is ever changed the copies stop opening, and the
// screen says so ("reset it to see one") instead of showing rubbish.

function revealKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) return null;
  return createHash("sha256").update(`sw-staff-reveal:${secret}`).digest();
}

/** "v1.<iv>.<tag>.<ciphertext>", or null when there is no key to seal with. */
export function sealPassword(password: string): string | null {
  const key = revealKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The password inside a sealed copy, or null when it can't be opened. */
export function openPassword(sealed: string | null | undefined): string | null {
  const key = revealKey();
  if (!key || !sealed) return null;
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Run a write with the sealed copy attached. If the column isn't there yet
 *  (the migration is the partner's to apply) the same write runs without it,
 *  so adding people and changing passwords never breaks over this. */
async function withReveal<R extends { error: { message: string } | null }>(
  password: string,
  run: (extra: Record<string, unknown>) => PromiseLike<R>,
): Promise<R> {
  const sealed = sealPassword(password);
  if (!sealed) return run({});
  const res = await run({ password_reveal: sealed });
  if (res.error && /password_reveal/i.test(res.error.message)) return run({});
  return res;
}

/** The owner's eye: what this person's password is, or null when none is
 *  saved (or it can't be opened). */
export async function revealStaffPassword(id: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("staff").select("password_reveal").eq("id", id).maybeSingle();
  if (error) {
    if (/password_reveal/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return openPassword((data as { password_reveal?: string | null } | null)?.password_reveal);
}

// ── Sign-in ──────────────────────────────────────────────────────────
export type Hasher = (password: string, salt: string) => string;

/**
 * Check a username and password against the staff table.
 *
 * Returns the person, null for a wrong pair, or "legacy" when the staff
 * table is missing or still empty — the caller then checks the single
 * pre-migration sign-in, and bootstrapOwner turns a success into a row.
 */
export async function checkStaffCredentials(
  username: string,
  password: string,
  hash: Hasher,
): Promise<StaffRecord | null | "legacy"> {
  if (!(await staffTableReady())) return "legacy";
  if ((await staffCount()) === 0) return "legacy";

  const row = await findRowByUsername(username.trim());
  // Hash either way, so a wrong username takes as long as a wrong password
  // and can't be told apart by timing.
  const computed = hash(password, row?.password_salt ?? "no-such-user-salt");
  if (!row || !row.active) return null;
  if (!sameSecret(computed, row.password_hash)) return null;

  void getSupabaseAdmin().from("staff").update({ last_login_at: new Date().toISOString() }).eq("id", row.id)
    .then(({ error }) => { if (error) console.error("[staff] last_login_at:", error.message); });
  // An account made before the owner's eye existed has no copy yet. This is
  // the one moment the password is in hand, so save it now.
  if (!row.password_reveal) {
    void withReveal(password, (extra) => getSupabaseAdmin().from("staff").update(extra).eq("id", row.id))
      .then(({ error }) => { if (error && !/password_reveal/i.test(error.message)) console.error("[staff] reveal copy:", error.message); });
  }
  return toRecord(row);
}

/**
 * The first sign-in after the migration: the owner's existing credentials
 * become the Owner row. Only ever runs while the table is empty. If two
 * sign-ins race, the unique username index lets one win and the other
 * reads the row it made.
 */
export async function bootstrapOwner(username: string, password: string, hash: Hasher, salt: string): Promise<StaffRecord | null> {
  if (!(await staffTableReady())) return null;
  try {
    if ((await staffCount()) > 0) {
      const existing = await findRowByUsername(username.trim());
      return existing ? toRecord(existing) : null;
    }
    const { data, error } = await withReveal(password, (extra) => getSupabaseAdmin().from("staff").insert({
      name: username.trim().slice(0, 60).padEnd(2, "."),
      username: username.trim(),
      role: "Owner",
      password_hash: hash(password, salt),
      password_salt: salt,
      last_login_at: new Date().toISOString(),
      ...extra,
    }).select().single());
    if (error) {
      const existing = await findRowByUsername(username.trim());
      return existing ? toRecord(existing) : null;
    }
    return toRecord(data as StaffRow);
  } catch (err) {
    console.error("[staff] could not create the owner row:", err);
    return null;
  }
}

// ── The owner's Staff screen ─────────────────────────────────────────
export interface NewStaff {
  name: string;
  username: string;
  role: StaffRole;
  password: string;
}

export async function createStaff(input: NewStaff, hash: Hasher, salt: string): Promise<StaffRecord> {
  const existing = await findRowByUsername(input.username);
  if (existing) throw new StaffError(`The username "${input.username}" is already taken.`);
  const { data, error } = await withReveal(input.password, (extra) => getSupabaseAdmin().from("staff").insert({
    name: input.name,
    username: input.username,
    role: input.role,
    password_hash: hash(input.password, salt),
    password_salt: salt,
    // Whoever the owner set up picks their own password at first sign-in.
    must_change_password: true,
    ...extra,
  }).select().single());
  if (error) {
    if (error.code === "23505") throw new StaffError(`The username "${input.username}" is already taken.`);
    throw new Error(error.message);
  }
  return toRecord(data as StaffRow);
}

export interface StaffPatch {
  name?: string;
  role?: StaffRole;
  active?: boolean;
  /** A new password set by the owner (a reset). */
  password?: string;
}

/** A refusal to show the owner as-is ("can't remove the last owner"). */
export class StaffError extends Error {}

export async function updateStaff(id: string, patch: StaffPatch, hash: Hasher, salt: string): Promise<StaffRecord> {
  const all = await listStaff();
  const cur = all.find((s) => s.id === id);
  if (!cur) throw new StaffError("That person is no longer on the staff list.");

  // There must always be an active Owner, or nobody could approve anything
  // or fix the accounts again.
  const otherOwners = all.filter((s) => s.id !== id && s.role === "Owner" && s.active).length;
  const staysOwner = (patch.role ?? cur.role) === "Owner" && (patch.active ?? cur.active);
  if (cur.role === "Owner" && cur.active && !staysOwner && otherOwners === 0) {
    throw new StaffError("This is the only active owner. Make someone else an owner first.");
  }

  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.password !== undefined) {
    row.password_hash = hash(patch.password, salt);
    row.password_salt = salt;
    row.must_change_password = true;
  }
  if (Object.keys(row).length === 0) return cur;

  const { data, error } = await withReveal(patch.password ?? "", (extra) =>
    getSupabaseAdmin().from("staff").update(patch.password === undefined ? row : { ...row, ...extra }).eq("id", id).select().single());
  if (error) throw new Error(error.message);
  forgetStaff(id);
  return toRecord(data as StaffRow);
}

/** A person changing their OWN username and/or password (Account screen). */
export async function updateOwnLogin(id: string, input: { username: string; password: string }, hash: Hasher, salt: string): Promise<StaffRecord> {
  const clash = await findRowByUsername(input.username);
  if (clash && clash.id !== id) throw new StaffError(`The username "${input.username}" is already taken.`);
  const { data, error } = await withReveal(input.password, (extra) => getSupabaseAdmin().from("staff").update({
    username: input.username,
    password_hash: hash(input.password, salt),
    password_salt: salt,
    must_change_password: false,
    ...extra,
  }).eq("id", id).select().single());
  if (error) throw new Error(error.message);
  forgetStaff(id);
  return toRecord(data as StaffRow);
}

/** Check a staff member's current password (Account screen). */
export async function checkOwnPassword(id: string, password: string, hash: Hasher): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("staff").select("password_hash, password_salt").eq("id", id).maybeSingle();
  if (error || !data) return false;
  const row = data as Pick<StaffRow, "password_hash" | "password_salt">;
  return sameSecret(hash(password, row.password_salt), row.password_hash);
}
