"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { flushSync } from "react-dom";
import { resolveTheme, rememberTheme } from "@/lib/themeBoot";

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
  /** The newest setMode, for the device listener set up once below. */
  const setModeRef = useRef<(m: ThemeMode, remember?: boolean) => void>(() => {});

  /* Light or dark like the device (lib/themeBoot.ts): the head script has
     already painted it, and this brings React's state in line after
     mount, so the server's HTML and the browser's first render agree. The
     old "sw-theme" key (a choice kept forever) is dropped: from now on a
     tap on the button lasts until the device's own setting changes. */
  useEffect(() => {
    try { window.localStorage.removeItem("sw-theme"); } catch { /* fine */ }
    const m = resolveTheme();
    latest.current = m;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device's setting is only readable after mount
    setModeState(m);
    // The device switching light/dark (a phone at sunset, a desktop
    // schedule) while the site is open: follow it.
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia("(prefers-color-scheme: light)"); } catch { /* old browser */ }
    const onChange = () => setModeRef.current(resolveTheme(), false);
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => { paint(mode); }, [mode]);

  /* Switching used to be a cut: every colour changed in one frame, which
     from dark to light is a flashbang. Now the page cross-fades over most
     of a second (globals.css). With view transitions the browser snapshots
     the old page, the new theme is applied inside the callback (so the
     snapshot of the new page already has it), and the two fade. Without
     them the colours themselves are eased for the length of the switch. */
  /** `remember`: a tap on the button (kept until the device's setting
   *  changes); false when following the device itself. */
  const setMode = (next: ThemeMode, remember = true) => {
    if (remember) rememberTheme(next);
    if (next === latest.current) return;
    // Recorded at once, not when the fade lands: a second tap during the
    // fade moves on from THIS theme instead of repeating the last switch.
    latest.current = next;
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

  // The device listener (set up once) always calls the newest setMode.
  useEffect(() => { setModeRef.current = setMode; });

  return (
    <ThemeCtx.Provider value={{ isDark: mode === "dark", mode, toggle: () => setMode(nextTheme(latest.current)), setMode: (m: ThemeMode) => setMode(m) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
