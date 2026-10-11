"use client";

/* ── Signing the admin out when they walk away
 *
 * The server is the authority: a session cookie stops being valid 30
 * minutes after the last POST /api/auth/touch (IDLE_TTL_MS in lib/auth.ts).
 * This hook is the browser half of that arrangement, and it does two jobs:
 *
 *   1. Tells the server the admin is still here, but only on REAL activity —
 *      a pointer, a key, or the tab being brought back to the front. Never
 *      on a timer, because the dashboard polls in the background and a
 *      session that any poll could renew would never expire at all.
 *
 *   2. Ends the session cleanly at the deadline instead of letting the
 *      admin discover it through a wall of failed requests: a warning
 *      appears a minute before, and then it signs out and says why.
 *
 * Point 2 is a courtesy, not the protection. A browser that ignores it
 * still holds a cookie the server has already stopped accepting.
 */

import { useEffect, useRef, useState } from "react";

/** Must match IDLE_TTL_MS in lib/auth.ts. */
const IDLE_MS = 30 * 60 * 1000;
/** How long the "you are about to be signed out" notice is shown for. */
const WARN_MS = 60 * 1000;
/** The server is told at most this often, however busy the admin is. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
/** How often the deadline is checked. */
const TICK_MS = 15 * 1000;

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function useIdleLogout(enabled: boolean, onExpire: () => void) {
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastTouch = useRef(0);
  const firedRef = useRef(false);
  // Kept in a ref so re-rendering the admin shell cannot restart the clock.
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!enabled) return;

    const seen = () => {
      lastActivity.current = Date.now();
      setWarning((w) => (w ? false : w));
      // Push the server's clock forward, sparingly.
      if (Date.now() - lastTouch.current >= TOUCH_EVERY_MS) {
        lastTouch.current = Date.now();
        void fetch("/api/auth/touch", { method: "POST", cache: "no-store" }).catch(() => {
          /* offline: the local deadline below still applies */
        });
      }
    };

    for (const e of ACTIVITY) window.addEventListener(e, seen, { passive: true });
    const onVisible = () => { if (document.visibilityState === "visible") seen(); };
    document.addEventListener("visibilitychange", onVisible);

    // Count as activity once on mount, so a fresh sign-in starts the clock.
    seen();

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) {
        if (firedRef.current) return;
        firedRef.current = true;
        expireRef.current();
      } else {
        setWarning(idle >= IDLE_MS - WARN_MS);
      }
    }, TICK_MS);

    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, seen);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [enabled]);

  /** True in the last minute before the session ends. */
  return { warning, minutes: Math.round(IDLE_MS / 60000) };
}
