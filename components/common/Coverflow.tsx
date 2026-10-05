"use client";

import { m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { SPACE, TAP_MIN } from "@/lib/spacing";
import { Icon } from "@/components/common/Icon";

/**
 * A 3D coverflow carousel: one card held at centre, its neighbours rotated
 * away, scaled down and faded, so a list reads as depth instead of a row.
 *
 * ── Why it is built the way it is ────────────────────────────────────────
 *
 * Every card is absolutely positioned at the same point and moved with
 * `transform` alone. Nothing here animates `left`, `width`, `height`,
 * `margin` or `padding`, because those run layout on the main thread on
 * every frame; `transform` and `opacity` are composited and do not. That is
 * the whole performance story of this component, and the reason the cards
 * are stacked rather than laid out in a flex row.
 *
 * Only the seven cards nearest the centre are mounted. Opacity reaches 0 at
 * a distance of three, so a card is always invisible before it is added or
 * removed — a hundred rooms cost the same as six.
 *
 * Swiping is plain pointer events, not Motion's `drag`. That keeps the
 * feature bundle at `domAnimation` (see components/layout/Providers.tsx):
 * `drag` lives in `domMax`, which is a noticeably larger download for one
 * gesture that twenty lines of pointer handling already covers.
 *
 * Reduced motion is NOT branched on here. `<MotionConfig reducedMotion="user">`
 * in Providers handles it at animation time, which is the only way to do it
 * without a hydration mismatch — see the note in Reveal.tsx.
 */

/** How far a neighbour sits from centre, as a fraction of card width. */
const STEP = 0.62;
/** Cards past this distance are not mounted. Opacity hits 0 one step earlier. */
const WINDOW = 3;
/** A drag shorter than this is a tap, not a swipe. */
const SWIPE_PX = 44;

/** One spring for every card, so the whole deck settles together. */
const SPRING = { type: "spring" as const, stiffness: 260, damping: 32, mass: 0.9 };

export interface CoverflowProps<T> {
  items: T[];
  getKey: (item: T) => string | number;
  /** `active` is true for the centre card, so it can carry the live button
   *  while the cards behind it stay inert. */
  render: (item: T, active: boolean) => ReactNode;
  /** Names the carousel for screen readers, e.g. "Rooms". */
  label: string;
  cardWidth: number;
  cardHeight: number;
  /** Fired when the centre card changes, and when a centre card is tapped. */
  onSelect?: (item: T, index: number) => void;
}

export function Coverflow<T>({
  items,
  getKey,
  render,
  label,
  cardWidth,
  cardHeight,
  onSelect,
}: CoverflowProps<T>) {
  const { isDark } = useTheme();
  const C = T(isDark);

  const [active, setActive] = useState(0);
  const count = items.length;

  // A shorter list after a refetch must not strand the index past the end.
  useEffect(() => {
    setActive((i) => (count === 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  const go = useCallback(
    (next: number) => setActive(() => Math.max(0, Math.min(count - 1, next))),
    [count],
  );

  // ── Swipe. `pan-y` on the viewport leaves vertical scrolling to the page,
  //    so a horizontal drag steers the deck and a vertical one does not.
  const drag = useRef<{ x: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (dx <= -SWIPE_PX) go(active + 1);
    else if (dx >= SWIPE_PX) go(active - 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(count - 1); }
    // The card itself is not focusable — the whole deck is one control, so
    // the keyboard opens the centre card from here.
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (items[active]) onSelect?.(items[active], active);
    }
  };

  // Mounted slice only. Recomputed per render but it is a single filter over
  // a list that is already in memory.
  const mounted = useMemo(
    () =>
      items
        .map((item, i) => ({ item, i, offset: i - active }))
        .filter((s) => Math.abs(s.offset) <= WINDOW),
    [items, active],
  );

  if (count === 0) return null;

  const navBtn = (disabled: boolean) => ({
    width: TAP_MIN,
    height: TAP_MIN,
    borderRadius: "50%",
    border: `1px solid ${C.border}`,
    background: C.bgCard,
    color: disabled ? C.textXS : C.textH,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  });

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      // Distinguishes this deck from the embla carousel in components/ui,
      // which carries the same ARIA role.
      data-sw-coverflow=""
      style={{ width: "100%" }}
    >
      {/* VIEWPORT — owns the perspective, the swipe and the keyboard. */}
      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        style={{
          position: "relative",
          height: cardHeight,
          perspective: 1200,
          touchAction: "pan-y",
          outline: "none",
          // The deck is wider than its cards; hide the fade-out at the edges
          // rather than letting it push the page sideways.
          overflow: "hidden",
          marginBottom: SPACE.xl,
        }}
      >
        {mounted.map(({ item, i, offset }) => {
          const dist = Math.abs(offset);
          const activeCard = offset === 0;
          return (
            <m.div
              key={getKey(item)}
              // aria-hidden + inert keep the off-centre cards out of the
              // reading order and out of the tab order: their buttons are
              // visible but not reachable, which is what the eye already
              // reports.
              aria-hidden={!activeCard}
              inert={!activeCard}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              onClick={() => (activeCard ? onSelect?.(item, i) : go(i))}
              initial={false}
              animate={{
                x: offset * cardWidth * STEP,
                rotateY: offset === 0 ? 0 : offset > 0 ? -34 : 34,
                scale: 1 - Math.min(dist, WINDOW) * 0.12,
                opacity: dist >= WINDOW ? 0 : 1 - Math.min(dist, WINDOW) * 0.3,
              }}
              transition={SPRING}
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                width: cardWidth,
                height: cardHeight,
                // -50% of the card's own width, folded into the transform so
                // the animated `x` above stays a pure translation.
                marginLeft: -cardWidth / 2,
                zIndex: 100 - dist,
                transformStyle: "preserve-3d",
                cursor: "pointer",
                // A faded card must not swallow a click meant for the deck.
                pointerEvents: dist >= WINDOW ? "none" : "auto",
              }}
            >
              {render(item, activeCard)}
            </m.div>
          );
        })}
      </div>

      {/* CONTROLS */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE.md,
        }}
      >
        <button
          type="button"
          aria-label={`Previous ${label.toLowerCase()}`}
          disabled={active === 0}
          onClick={() => go(active - 1)}
          style={navBtn(active === 0)}
        >
          <Icon name="chevron-left" size={18} />
        </button>

        <div
          role="tablist"
          aria-label={`${label} position`}
          style={{ display: "flex", alignItems: "center", gap: SPACE.xxs }}
        >
          {items.map((item, i) => (
            <button
              key={getKey(item)}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Go to ${i + 1} of ${count}`}
              onClick={() => go(i)}
              style={{
                // The dot is 8px; the button around it is 44px, so the target
                // clears the touch minimum without a 44px dot.
                width: TAP_MIN,
                height: TAP_MIN,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* The pill is always 20px and SHRINKS with a transform. An
                  earlier version animated `width`, which runs layout on every
                  frame of every dot — the one thing this component is built
                  to avoid. scaleX is composited. */}
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  width: 20,
                  height: 8,
                  // 50%, not 4px: the radius is a PERCENTAGE of the box, so
                  // it squashes with the scale. 20x8 at scaleX(1) is a pill;
                  // the same box at scaleX(0.4) is a true 8px circle. A fixed
                  // 4px radius would have left the inactive dots as squares.
                  borderRadius: "50%",
                  background: i === active ? gold : C.border,
                  transform: `scaleX(${i === active ? 1 : 0.4})`,
                  transition: "transform .25s cubic-bezier(.22,1,.36,1), background .25s",
                }}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label={`Next ${label.toLowerCase()}`}
          disabled={active === count - 1}
          onClick={() => go(active + 1)}
          style={navBtn(active === count - 1)}
        >
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
    </div>
  );
}
