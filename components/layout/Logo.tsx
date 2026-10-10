import type { CSSProperties } from "react";

/* ── The STONEWOOD wordmark ──────────────────────────────────────────────
 *
 * One inline SVG instead of two styled spans.
 *
 *   • Fixed geometry. `textLength` pins each line to an exact width in the
 *     viewBox, so the mark is the same size in the fallback face and in
 *     Satoshi — the navbar cannot shift when the font arrives.
 *   • It scales by `height` alone: one prop instead of two font sizes and two
 *     letter-spacings kept in step for desktop and mobile.
 *   • It inherits colour: the name is `currentColor`, the tagline takes
 *     `subColor`, so over the hero and on a plain page it is one component.
 *
 * The letters are live text in Satoshi. When a final outlined logo exists,
 * replace the two <text> elements with its <path>s; nothing else changes.
 *
 * Proportions match the old spans: 22px caps at 5px tracking, a 4px gap,
 * an 11px tagline at 3.5px tracking.
 */

const VIEW_W = 184;
const FULL_H = 37;
const COMPACT_H = 22;

interface LogoProps {
  /** Rendered height in px; width follows. Full mark: 37 desktop, 32 mobile. */
  height?: number;
  /** Colour of PRIVATE RESORT. Defaults to the faint text tier. */
  subColor?: string;
  /** STONEWOOD only, no tagline. */
  compact?: boolean;
  /** True when the surrounding link or button already names the destination. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Logo({
  height,
  subColor = "var(--sw-text-xs)",
  compact = false,
  decorative = false,
  className,
  style,
}: LogoProps) {
  const viewH = compact ? COMPACT_H : FULL_H;
  const h = height ?? viewH;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      height={h}
      width={(h * VIEW_W) / viewH}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : "StoneWood Private Resort"}
      focusable="false"
      className={className}
      style={{
        display: "block",
        overflow: "visible",
        fontFamily: "var(--font-satoshi), 'Satoshi', system-ui, sans-serif",
        ...style,
      }}
    >
      <text x="0" y="17" fontSize="22" fontWeight="400" fill="currentColor" textLength={VIEW_W} lengthAdjust="spacing">
        STONEWOOD
      </text>
      {!compact && (
        <text x="0" y="35" fontSize="11" fontWeight="400" fill={subColor} textLength={150} lengthAdjust="spacing">
          PRIVATE RESORT
        </text>
      )}
    </svg>
  );
}
