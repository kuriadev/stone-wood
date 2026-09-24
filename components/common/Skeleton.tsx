"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";

/**
 * The loading placeholders.
 *
 * There used to be eight byte-identical copies of this markup, one per
 * `app/<route>/loading.tsx`, and every one of them was decorative: each of
 * those routes is a client component with nothing awaited on the server, so
 * the Suspense fallback they back was on screen for roughly no time at all.
 * The real wait on this site is the collection fetch that happens *after*
 * the route mounts, which no skeleton was covering.
 *
 * So the markup lives here once and is used in two places:
 *
 *   - `PageSkeleton` still backs the route-level `loading.tsx` files, which
 *     is what shows on a cold load or a hard refresh.
 *   - `CardGridSkeleton` is rendered by Rooms, Packages and Gallery while
 *     their collection is genuinely in flight, driven by the `loading` flags
 *     AppContext now exposes.
 *
 * Both are theme-aware. The old copies hardcoded `background: "#0b0a07"`,
 * so a visitor in light mode got a black flash before the page painted.
 */

/** Announced once, not per shape — eight live shimmer boxes would otherwise
 *  make a screen reader read "loading" eight times. */
function srOnly(): React.CSSProperties {
  return {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  };
}

/** The shapes alone. Decorative, so the caller owns the live region and
 *  marks this subtree aria-hidden. */
function Cards({ count }: { count: number }) {
  return (
    <div className="lux-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="lux-card">
          <div className="lux-img" />
          <div className="lux-line w-70" />
          <div className="lux-line w-50" />
          <div className="lux-btn" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 3,
  label = "Loading",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span style={srOnly()}>{label}</span>
      <div aria-hidden="true">
        <Cards count={count} />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  const { isDark } = useTheme();
  const C = T(isDark);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ minHeight: "100vh", padding: "40px 24px", background: C.bg }}
    >
      <span style={srOnly()}>Loading page</span>
      <div aria-hidden="true">
        <div className="lux-skeleton hero" />
        <div className="lux-line w-60" />
        <div className="lux-line w-40" />
        <div className="lux-line w-30" />
        <Cards count={3} />
      </div>
    </div>
  );
}
