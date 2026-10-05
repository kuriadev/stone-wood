import type { CSSProperties } from "react";

/* ── The theme, read from the one place it is authored ───────────────────
 *
 * These used to be a second copy of the hex values that app/globals.css
 * declares for Tailwind and shadcn, with a note admitting that changing a
 * colour meant editing both. There is only one list now: the `--sw-*`
 * custom properties in globals.css. This file points at them.
 *
 * Why that works for both styling systems:
 *   • Tailwind utilities and shadcn components already resolve the same
 *     variables through the @theme mappings.
 *   • A hand-written `style={{ color: C.textH }}` now emits
 *     `color: var(--sw-text-h)`, which the browser resolves against
 *     whichever theme class is on <html>.
 *
 * That also means the theme switch is pure CSS: nothing re-renders to
 * recolour, the variables simply resolve differently under `.sw-dark`.
 *
 * `isDark` is still taken, because a handful of call sites branch on more
 * than colour (an icon swap, a shadow that only exists in light mode), and
 * because every consumer already passes it.
 */

export interface ThemeColors {
  bg: string;
  bgCard: string;
  bgCard2: string;
  border: string;
  borderLight: string;
  textH: string;
  textB: string;
  textS: string;
  textXS: string;
  goldInk: string;
  dangerInk: string;
  inp: CSSProperties;
  navBg: string;
  shadow: string;
  shadowCard: string;
}

/** The variable names, exported so anything that needs a real colour value
 *  rather than a reference (MUI's chart palette is the one case) can resolve
 *  them from the document instead of hard-coding a copy. */
export const THEME_VARS = {
  bg: "--sw-bg",
  bgCard: "--sw-bg-card",
  bgCard2: "--sw-bg-card-2",
  border: "--sw-border",
  borderLight: "--sw-border-light",
  textH: "--sw-text-h",
  textB: "--sw-text-b",
  textS: "--sw-text-s",
  textXS: "--sw-text-xs",
  goldInk: "--sw-gold-ink",
  dangerInk: "--sw-danger-ink",
} as const;

/** Read a palette variable as an actual colour. Browser only — on the
 *  server there is no computed style, so the caller gets the fallback. */
export function resolveVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const V = (name: string) => `var(${name})`;

export function T(_isDark: boolean): ThemeColors {
  return {
    bg: V("--sw-bg"),
    bgCard: V("--sw-bg-card"),
    bgCard2: V("--sw-bg-card-2"),
    border: V("--sw-border"),
    borderLight: V("--sw-border-light"),
    textH: V("--sw-text-h"),
    textB: V("--sw-text-b"),
    textS: V("--sw-text-s"),
    textXS: V("--sw-text-xs"),
    goldInk: V("--sw-gold-ink"),
    dangerInk: V("--sw-danger-ink"),
    inp: {
      background: V("--sw-input-bg"),
      color: V("--sw-text-h"),
      border: `1px solid ${V("--sw-input-border")}`,
      padding: "12px 16px",
      fontSize: 13,
      borderRadius: 6,
      width: "100%",
      boxSizing: "border-box",
      boxShadow: V("--sw-input-shadow"),
    },
    navBg: V("--sw-nav-bg"),
    shadow: V("--sw-shadow"),
    shadowCard: V("--sw-shadow-card"),
  };
}
