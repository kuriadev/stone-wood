// ── Admin sign-in: a few tries, then a short pause (server only)
//
// LOGIN_TRIES wrong passwords in a row from one address pause sign-in there
// for LOGIN_PAUSE_SECONDS. The login card shows the tries left and counts
// the pause down. A correct sign-in clears the count.
//
// Like lib/rateLimit.ts this lives in module memory: per server instance,
// reset by a cold start. It stops the ordinary case (someone guessing at
// the desk); the hourly rate limit in the route stays as the outer guard.

export const LOGIN_TRIES = 5;
export const LOGIN_PAUSE_SECONDS = 60;

const state = new Map<string, { fails: number; lockedUntil: number }>();

/** Seconds still to wait, or 0 when this address may try. */
export function lockedFor(key: string, now = Date.now()): number {
  const s = state.get(key);
  if (!s || s.lockedUntil <= now) return 0;
  return Math.ceil((s.lockedUntil - now) / 1000);
}

/** A wrong password. Returns the tries left, or the pause it started. */
export function recordFailure(key: string, now = Date.now()): { triesLeft: number; lockedFor: number } {
  if (state.size > 5000) for (const [k, v] of state) if (v.lockedUntil <= now && v.fails === 0) state.delete(k);
  const s = state.get(key) ?? { fails: 0, lockedUntil: 0 };
  if (s.lockedUntil && s.lockedUntil <= now) { s.lockedUntil = 0; s.fails = 0; }
  s.fails += 1;
  if (s.fails >= LOGIN_TRIES) {
    s.fails = 0;
    s.lockedUntil = now + LOGIN_PAUSE_SECONDS * 1000;
    state.set(key, s);
    return { triesLeft: 0, lockedFor: LOGIN_PAUSE_SECONDS };
  }
  state.set(key, s);
  return { triesLeft: LOGIN_TRIES - s.fails, lockedFor: 0 };
}

/** Signed in: start fresh. */
export function clearFailures(key: string): void {
  state.delete(key);
}
