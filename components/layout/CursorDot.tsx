"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * A soft glass circle that chases the pointer.
 *
 * Deliberate constraints, so it stays decoration rather than interference:
 *   • pointer-events: none — never intercepts a click.
 *   • The native cursor is left visible. Replacing it would hurt usability
 *     (text carets, resize handles, disabled states all stop reading right).
 *   • Skipped on coarse pointers (touch), where there is nothing to follow.
 *   • Under prefers-reduced-motion the dot still shows, but snaps straight
 *     to the pointer instead of easing. It is a pointer indicator, not an
 *     animation, so hiding it outright would remove a feature rather than
 *     calm one down — the trailing lag is the only part that is motion.
 *   • Position is written straight to the node inside requestAnimationFrame.
 *     Putting it in React state would re-render the whole tree ~60×/second.
 */

/** Lower = longer chase. At 0.055 the dot is still ~370px behind a 500px
 *  flick after 100ms and takes roughly 0.9s to catch up, which reads as a
 *  deliberate trail. Much below this it starts to feel broken rather than
 *  lazy — the dot is so far from the pointer it looks unrelated to it. */
const POSITION_EASE = 0.055;

/** The scale is run as a spring rather than a linear ease, so growing over a
 *  link overshoots a touch and settles instead of ramping to a dead stop.
 *  Tuned by simulation: ~3% overshoot, settles in ~280ms, and the dip on the
 *  way back down bottoms out at 0.98 — present, but never bouncy. */
const SPRING_STIFFNESS = 0.22;
const SPRING_DAMPING = 0.55;

const SCALE_IDLE = 1;
const SCALE_HOVER = 1.55;

/** How much of the dot fades away as it grows. Enlarging over a control is
 *  exactly when it is most likely to sit on top of a number or a label, so
 *  it trades opacity for size and stops hiding what is underneath. */
const FADE_WHEN_LARGE = 0.40;

const INTERACTIVE = "a,button,[role='button'],input,select,textarea,label,summary";

export function CursorDot() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;

    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // target = where the pointer actually is; current = where the dot is.
    // Easing current toward target each frame is what produces the chase.
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    let scale = SCALE_IDLE;
    let scaleVel = 0;
    let targetScale = SCALE_IDLE;

    let visible = false;
    let raf = 0;

    // Ease of 1 means "no trail" — the dot lands exactly on the pointer.
    let ease = reducedQuery.matches ? 1 : POSITION_EASE;
    let springy = !reducedQuery.matches;
    const onReducedChange = (e: MediaQueryListEvent) => {
      ease = e.matches ? 1 : POSITION_EASE;
      springy = !e.matches;
    };

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;

      if (!visible) {
        // Jump to the pointer the first time rather than sliding in from
        // the middle of the screen.
        currentX = targetX;
        currentY = targetY;
        visible = true;
        dot.style.opacity = "1";
      }

      // Grow a little over anything clickable — a quiet affordance hint.
      const el = e.target as HTMLElement | null;
      targetScale = el?.closest(INTERACTIVE) ? SCALE_HOVER : SCALE_IDLE;
    };

    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
    };

    const onEnter = () => {
      if (visible) dot.style.opacity = "1";
    };

    const tick = () => {
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;

      if (springy) {
        // Critically-ish damped spring: accelerate toward the target, bleed
        // off velocity each frame. Gives a soft overshoot on the way up.
        scaleVel += (targetScale - scale) * SPRING_STIFFNESS;
        scaleVel *= SPRING_DAMPING;
        scale += scaleVel;
      } else {
        scale = targetScale;
        scaleVel = 0;
      }

      // translate3d keeps this on the compositor; -50% centres the circle
      // on the pointer regardless of its size.
      dot.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;

      // Bigger ⇒ more see-through. Enlarging over a control is exactly when
      // the dot is most likely to sit on a number or a label, so it trades
      // opacity for size instead of hiding what is underneath.
      // Applied through filter, not opacity: opacity carries the show/hide
      // transition and is written on enter/leave, so writing it here every
      // frame would fight that.
      const grown = Math.min(
        1,
        Math.max(0, (scale - SCALE_IDLE) / (SCALE_HOVER - SCALE_IDLE))
      );
      dot.style.filter = `opacity(${(1 - grown * FADE_WHEN_LARGE).toFixed(3)})`;

      raf = requestAnimationFrame(tick);
    };

    // Only run on a hovering pointer. Checked live, so plugging in a mouse
    // on a touch laptop starts it without a reload.
    let running = false;
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
      document.addEventListener("pointerenter", onEnter);
      window.addEventListener("blur", onLeave);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      dot.style.opacity = "0";
      visible = false;
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      window.removeEventListener("blur", onLeave);
    };

    const syncPointer = () => (finePointer.matches ? start() : stop());
    syncPointer();

    finePointer.addEventListener("change", syncPointer);
    reducedQuery.addEventListener("change", onReducedChange);

    return () => {
      stop();
      finePointer.removeEventListener("change", syncPointer);
      reducedQuery.removeEventListener("change", onReducedChange);
    };
  }, []);

  // Glass, tinted to stay legible against the page beneath it: a pale film
  // on dark pages, a smoky one on light. The fill is kept very low — the
  // legibility comes from the rim highlight and the backdrop blur, not from
  // painting a solid circle over the content.
  const glass = isDark
    ? {
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.24)",
        boxShadow:
          "0 1px 6px rgba(0,0,0,0.14), inset 0 1px 1px rgba(255,255,255,0.20)",
      }
    : {
        background: "rgba(40,36,28,0.02)",
        border: "1px solid rgba(40,36,28,0.20)",
        boxShadow:
          "0 1px 6px rgba(40,36,28,0.08), inset 0 1px 1px rgba(255,255,255,0.40)",
      };

  return <div ref={dotRef} aria-hidden="true" className="sw-cursor-dot" style={glass} />;
}
