"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { flushSync } from "react-dom";

/** Light and Dark. There was briefly a third, Dim, between them; the
 *  owner asked for two, so it is gone. Anyone who had picked Dim is moved
 *  to Dark on their next visit (see the stored-theme read below). */
export type ThemeMode = "light" | "dark";

/** The toggle flips between these. */
export const THEME_ORDER: ThemeMode[] = ["light", "dark"];
export const THEME_LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark" };
export const nextTheme = (m: ThemeMode): ThemeMode => THEME_ORDER[(THEME_ORDER.indexOf(m) + 1) % THEME_ORDER.length];

interface ThemeContextValue {
  isDark: boolean;
  mode: ThemeMode;
  /** To the next theme in THEME_ORDER, faded rather than cut. */
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

export const ThemeCtx = createContext<ThemeContextValue>({
  isDark: true,
  mode: "dark",
  toggle: () => {},
  setMode: () => {},
});

const STORE_KEY = "sw-theme";
const isMode = (v: unknown): v is ThemeMode => v === "light" || v === "dark";

/** Mirror the theme onto <html> as sw-dark / sw-light.
 *
 *  A whole family of hover styles in globals.css is written as
 *  `.sw-dark .sw-card:hover { … }`, and Home and BookNow portal their
 *  modals into document.body, so the class goes on documentElement rather
 *  than a wrapper div. Never from JSX: <html> is emitted by a server
 *  component, and reconciling a className onto it would be a hydration
 *  mismatch on the very first paint. */
function paint(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("sw-dark", mode === "dark");
  root.classList.toggle("sw-light", mode === "light");
  // Left over from the retired Dim theme on a page that was open across
  // the change; harmless to clear every time.
  root.classList.remove("sw-dim");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  /** The theme being switched to, ahead of the state while a fade runs. */
  const latest = useRef<ThemeMode>("dark");

  // The viewer's last choice, from this browser only. Read after mount so
  // the server's first paint and the browser's agree; a private window, or
  // storage turned off, just starts dark.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      // Dim was a dark theme, so whoever chose it is closest to Dark.
      const saved = raw === "dim" ? "dark" : raw;
      if (isMode(saved)) {
        latest.current = saved;
        setModeState(saved);
        if (raw !== saved) window.localStorage.setItem(STORE_KEY, saved);
      }
    } catch { /* no storage: keep the default */ }
  }, []);

  useEffect(() => { paint(mode); }, [mode]);

  /* Switching used to be a cut: every colour changed in one frame, which
     from dark to light is a flashbang. Now the page cross-fades over most
     of a second (globals.css). With view transitions the browser snapshots
     the old page, the new theme is applied inside the callback (so the
     snapshot of the new page already has it), and the two fade. Without
     them the colours themselves are eased for the length of the switch. */
  const setMode = (next: ThemeMode) => {
    if (next === latest.current) return;
    // Recorded at once, not when the fade lands: a second tap during the
    // fade moves on from THIS theme instead of repeating the last switch.
    latest.current = next;
    try { window.localStorage.setItem(STORE_KEY, next); } catch { /* not remembered, still switched */ }
    // Applies the LATEST choice, not this tap's: overlapping fades can run
    // their callbacks out of order, and the last tap must win.
    const apply = () => {
      const m = latest.current;
      paint(m);
      flushSync(() => setModeState(m));
    };
    /* The fade runs under reduced motion too. Reduced motion is about
       MOVEMENT — sliding, scaling, parallax, the things that can trigger
       vestibular symptoms — and this is a cross-fade between two still
       pictures: nothing moves. Skipping it gave anyone with the OS setting
       on a hard cut from near-black to white, which is the one thing the
       fade was built to prevent. globals.css shortens it for them instead. */
    type Fade = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => Fade };
    // A hidden tab draws no frames to fade between, so it just switches.
    if (document.visibilityState === "visible" && typeof doc.startViewTransition === "function") {
      const fade = doc.startViewTransition(apply);
      // A tap during a fade cuts the earlier fade short. That is expected,
      // so its "skipped" rejections are not errors.
      const ignore = () => {};
      fade.ready.catch(ignore);
      fade.finished.catch(ignore);
      fade.updateCallbackDone.catch(ignore);
      return;
    }
    // Browsers without view transitions ease the colours themselves.
    const root = document.documentElement;
    root.classList.add("sw-theme-fade");
    window.setTimeout(() => root.classList.remove("sw-theme-fade"), 420);
    apply();
  };

  return (
    <ThemeCtx.Provider value={{ isDark: mode === "dark", mode, toggle: () => setMode(nextTheme(latest.current)), setMode }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
