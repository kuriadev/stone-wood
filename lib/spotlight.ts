"use client";

// ── Show staff exactly which thing a notification meant
//
// A tapped notification switches screens; this then finds the element
// marked data-spot="<booking id>", scrolls it to the middle of the screen
// (inside a scrolling column too) and pulses a gold ring around it
// (.sw-spot in globals.css). The screen may still be rendering, so it
// looks for a moment before giving up. Resolves true when it found it.

export function spotlight(id: string, opts: { timeoutMs?: number; scroll?: boolean } = {}): Promise<boolean> {
  const until = Date.now() + (opts.timeoutMs ?? 2500);
  const sel = `[data-spot~="${CSS.escape(id)}"]`;
  return new Promise((resolve) => {
    const look = () => {
      // The first one actually on screen (a hidden tab's copy doesn't count).
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.offsetParent !== null || e.getClientRects().length > 0);
      if (!el) {
        if (Date.now() < until) { setTimeout(look, 90); return; }
        resolve(false);
        return;
      }
      if (opts.scroll !== false) el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("sw-spot");
      void el.offsetWidth; // restart the pulse if it was already lit
      el.classList.add("sw-spot");
      window.setTimeout(() => el.classList.remove("sw-spot"), 3600);
      resolve(true);
    };
    // After the new screen's first paint.
    requestAnimationFrame(() => requestAnimationFrame(look));
  });
}
