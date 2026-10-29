"use client";

import { m } from "motion/react";
import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

/**
 * Fade-and-rise a block in as it scrolls into view.
 *
 * Replaces the hand-rolled `useScrollReveal` hook and the `.sw-reveal` CSS.
 * That pair worked, but it had to fight React to do it: it set a
 * `data-sw-in` attribute from a global IntersectionObserver because adding a
 * *class* from JS made the DOM disagree with what React had rendered and
 * produced a hydration mismatch. It also needed a MutationObserver to catch
 * late-mounted nodes and a 3-second timer as a last resort, in case the
 * observer missed something and left content stuck at `opacity: 0`.
 *
 * Motion removes all three problems rather than solving them. Each element
 * owns its own viewport trigger, so nothing can be missed and nothing needs
 * sweeping; React renders the element and Motion animates it, so there is no
 * DOM mutation behind React's back and no hydration mismatch to avoid.
 *
 * The timings are carried over exactly from the old CSS so the motion is
 * unchanged: 28px rise, 0.65s, the same cubic-bezier, once only, triggered at
 * 12% visibility with a 50px bottom margin.
 */

/** Matches the old `.sw-reveal` transition curve. */
const EASE = [0.22, 1, 0.36, 1] as const;

/** Seconds between one card in a group and the next.
 *
 *  Use it as `delay={i * REVEAL_STEP}` when revealing a row or grid. The
 *  stagger is what makes a group read as arriving rather than blinking on,
 *  and it must go through the `delay` PROP: Motion animates in JavaScript,
 *  so a CSS `transitionDelay` in `style` is inert — the home page carried
 *  one for four cards and they all landed on the same frame.
 *
 *  Kept small on purpose. At 0.08s a row of six finishes 0.4s after the
 *  first, which reads as one movement; much more and the last card feels
 *  like it is lagging. */
export const REVEAL_STEP = 0.08;

export interface RevealProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Stagger a group by passing an increasing delay, in seconds. */
  delay?: number;
  /** Several revealed blocks are also interactive cards (a room, a package),
   *  so the handlers have to pass through rather than be swallowed. Listed
   *  explicitly instead of extending HTMLAttributes, because Motion redefines
   *  some DOM event props (onDrag, onAnimationStart) with its own types. */
  onClick?: MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
}

export function Reveal({
  children,
  className,
  style,
  delay = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: RevealProps) {
  // `useReducedMotion()` resolves after mount, so branching between a plain
  // <div> and a <motion.div> swapped the element type mid-life: the first
  // render applied `initial` (opacity 0) and the swapped-in node could be
  // left sitting at it. Two blocks on the home page stayed permanently
  // invisible under reduced motion because of exactly that.
  //
  // One element type always, and `initial={false}` to tell Motion to skip the
  // starting state and render the content where it belongs. Nothing can be
  // stranded at opacity 0, whichever way the hook resolves.
  // No reduced-motion branch here on purpose. This component must render
  // byte-identically on the server and on the first client render, or React
  // reports a hydration mismatch — which is exactly what an earlier version
  // did by branching on useReducedMotion() (false on the server, true on a
  // client that asked for it). The OS preference is honoured by
  // <MotionConfig reducedMotion setting> in Providers instead.
  return (
    <m.div
      className={className}
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      /* Transform and opacity only: both are composited, so a page full of
         these costs no layout and no repaint. */
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      /* `amount: 0.12` rather than a larger fraction because some revealed
         blocks are taller than the viewport, and a block that can never
         show (say) half of itself would never trigger at all. */
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -50px 0px" }}
      transition={{ duration: 0.62, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}
