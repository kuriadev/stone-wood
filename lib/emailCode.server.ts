// ── Email codes: proving a guest can read the address they typed
//
// SERVER ONLY.
//
// Book Now used to accept any address that looked right, so a typo or a
// made-up one went through and the confirmation, the receipt and every
// later notice went nowhere. Before a guest can pay, they now get a
// 6-digit code at that address and type it back.
//
// Nothing is stored. The code is emailed; the browser holds a sealed
// "challenge" with only a keyed hash of it, its address and its expiry.
// A right code is exchanged for a sealed "proof" for that address, which
// the pre-payment check and the QR payment require (lib/bookingQuote.ts,
// requireEmailProof). Both are signed with SESSION_SECRET, so neither can
// be made or edited in the browser.
//
// Wrong tries are counted per challenge by the rate limiter, which lives
// in each server instance's memory (see lib/rateLimit.ts for that caveat).
// A code expires in ten minutes and a new one needs a fresh send, which is
// limited too, so guessing a million combinations is not a practical way in.

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

/** How long a code works. */
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
/** How long a confirmed address stays confirmed: long enough to finish
 *  the payment step, or come back to it after a break. */
export const EMAIL_PROOF_TTL_MS = 3 * 60 * 60 * 1000;
/** Wrong tries one code allows before a new one has to be sent. */
export const EMAIL_CODE_TRIES = 5;
/** Seconds before the same address can be sent another code. */
export const EMAIL_CODE_RESEND_S = 60;

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET is missing or too short.");
  return s;
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function seal(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(`seal:${body}`)}`;
}

function unseal<T>(token: unknown): T | null {
  if (typeof token !== "string" || token.length > 2000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!same(parts[1], sign(`seal:${parts[0]}`))) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

interface Challenge { k: "email-code"; e: string; n: string; exp: number; h: string }
interface Proof { k: "email-ok"; e: string; exp: number }

const codeHash = (n: string, e: string, code: string) => sign(`code:${n}:${e}:${code}`);

/** A new code for `email`: the code (to email) and the sealed challenge
 *  (to the browser), which holds only a keyed hash of the code. */
export function newEmailCode(email: string, now = Date.now()): { code: string; challenge: string; expiresAt: number } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const n = randomBytes(9).toString("base64url");
  const e = normEmail(email);
  const exp = now + EMAIL_CODE_TTL_MS;
  const c: Challenge = { k: "email-code", e, n, exp, h: codeHash(n, e, code) };
  return { code, challenge: seal(c), expiresAt: exp };
}

/** The challenge's own id, when it is a real one: what wrong tries are
 *  counted against. */
export function challengeId(challenge: unknown): string | null {
  const c = unseal<Challenge>(challenge);
  return c && c.k === "email-code" && typeof c.n === "string" ? c.n : null;
}

export type CodeCheck =
  | { ok: true; proof: string; expiresAt: number }
  | { ok: false; reason: "invalid" | "other-email" | "expired" | "wrong" };

/** The code the guest typed, against the challenge they were given. */
export function checkEmailCode(challenge: unknown, email: unknown, code: unknown, now = Date.now()): CodeCheck {
  const c = unseal<Challenge>(challenge);
  if (!c || c.k !== "email-code" || typeof c.n !== "string" || typeof c.h !== "string") return { ok: false, reason: "invalid" };
  const e = normEmail(email);
  if (c.e !== e) return { ok: false, reason: "other-email" };
  if (!(c.exp > now)) return { ok: false, reason: "expired" };
  const typed = String(code ?? "").replace(/\D/g, "");
  if (typed.length !== 6 || !same(c.h, codeHash(c.n, e, typed))) return { ok: false, reason: "wrong" };
  const p: Proof = { k: "email-ok", e, exp: now + EMAIL_PROOF_TTL_MS };
  return { ok: true, proof: seal(p), expiresAt: p.exp };
}

/** Whether `proof` says the guest confirmed `email`, and still does. */
export function emailProofValid(proof: unknown, email: unknown, now = Date.now()): boolean {
  const p = unseal<Proof>(proof);
  return !!p && p.k === "email-ok" && p.e === normEmail(email) && p.exp > now;
}
