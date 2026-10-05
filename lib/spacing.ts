/* ── THE SPACING GRID ─────────────────────────────────────────────────────
 *
 * One rule: every gap, pad and margin in this app is a multiple of 4px.
 *
 * Before this file existed there were 40 different spacing values in use —
 * 1, 3, 5, 7, 9, 11, 13, 15, 26, 34, 38 among them — and 710 of the 1,857
 * spacing declarations sat off any grid at all. Nothing looked broken, but
 * nothing lined up either: two cards side by side would pad 14px and 16px,
 * and the eye reads that as sloppiness without being able to name it.
 *
 * 4px is not an arbitrary choice. It is Tailwind's own base step, so
 * `className="p-4"` (1rem = 16px) and a hand-written `padding: SPACE.lg`
 * land on exactly the same grid. There is one rhythm, whichever of the two
 * styling systems a given line happens to use.
 *
 * These are plain numbers, not CSS variables, because spacing does not
 * change with the theme — unlike colour, which lives in the --sw-* palette
 * in app/globals.css and is read through lib/theme.ts.
 *
 * Use the named steps below for new work. Where a literal is already on the
 * grid it is correct as written; it does not need to be converted.
 */

export const SPACE = {
  /** 4px — hairline separation inside a control: icon to its label. */
  xxs: 4,
  /** 8px — related items in one group: a chip's padding, a tight row gap. */
  xs: 8,
  /** 12px — the default gap between fields and between table cells. */
  sm: 12,
  /** 16px — padding inside a card or a modal body on mobile. */
  md: 16,
  /** 20px — padding inside a card at desktop width. */
  lg: 20,
  /** 24px — separation between two distinct groups in a panel. */
  xl: 24,
  /** 32px — gap between sections of a page. */
  xxl: 32,
  /** 48px — the space above a new major section. */
  section: 48,
  /** 80px — vertical rhythm between the big marketing blocks. */
  block: 80,
  /** 96px — the top and bottom of a full-bleed section. */
  bleed: 96,
} as const;

/** Any step on the grid, for the cases the named steps do not cover. */
export const step = (n: number): number => n * 4;

/* ── TOUCH TARGETS ───────────────────────────────────────────────────────
 *
 * 44px is the smallest comfortable target for a finger, and it is the
 * figure both Apple's HIG and the WCAG 2.5.5 enhanced criterion land on.
 * It applies to anything tappable on a phone: nav items, icon buttons,
 * close buttons, carousel arrows.
 *
 * A control is allowed to LOOK smaller than 44px — the hit area is what has
 * to clear it, which is usually bought with padding rather than size.
 */
export const TAP_MIN = 44;

/** Vertical padding that lifts a control of `contentHeight` to the 44px
 *  minimum, rounded onto the grid. Returns 0 when it already clears it. */
export const tapPad = (contentHeight: number): number =>
  Math.max(0, Math.ceil((TAP_MIN - contentHeight) / 2 / 4) * 4);
