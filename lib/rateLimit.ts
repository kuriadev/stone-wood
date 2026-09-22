// ── Fixed-window rate limiting
//
// SERVER ONLY.
//
// Every API route was previously unlimited. The two that send email and the
// one that mints PayMongo payments are the expensive ones: a script hitting
// /api/email in a loop burns the Gmail account's daily send quota and gets it
// flagged for spam, and a loop on /api/payment creates unbounded payment
// intents against the live PayMongo account.
//
// Caveat, deliberately written down rather than hidden: this state lives in
// module memory. On Vercel each serverless instance has its own Map, so the
// effective limit is (limit x instances), and a cold start resets it. That is
// a real weakness against a distributed attacker but still stops the ordinary
// case — one client hammering one endpoint. Moving to Upstash/Redis is the
// upgrade path once Supabase is wired.

import { NextResponse, type NextRequest } from "next/server";

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired entries so a long-running instance cannot grow the Map
 *  without bound — otherwise the limiter becomes its own memory leak. */
function sweep(now: number): void {
  if (windows.size < 5000) return;
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

/** Best-effort client identity.
 *
 *  x-forwarded-for is client-controlled in general, but on Vercel the platform
 *  overwrites it, so the first hop is trustworthy there. Falling back to a
 *  shared bucket is intentional: an unidentifiable caller should be limited
 *  more aggressively, not exempted. */
export function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when ok is false. */
  retryAfter: number;
}

export function rateLimit(
  req: NextRequest,
  opts: { name: string; limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const key = `${opts.name}:${clientKey(req)}`;
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > opts.limit) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/** Clear a caller's window — used after a successful login so a staff member
 *  who mistyped twice is not still counted against the attempt limit. */
export function resetRateLimit(req: NextRequest, name: string): void {
  windows.delete(`${name}:${clientKey(req)}`);
}
