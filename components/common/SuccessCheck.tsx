"use client";

// ── The tick that draws itself
//
// The booking flow ended on a static ✓ in a circle. It said the right
// thing, but it arrived already finished, so the one moment in the whole
// flow worth marking — the payment went through and the stay is real —
// landed with no more weight than a bullet point.
//
// This draws instead: the ring sweeps round, the tick strokes in behind
// it, and a soft halo breathes out once. About 900ms in total, and then it
// stops. It is a full stop, not an idle animation.
//
// It is SVG stroke-dashoffset rather than a Motion component because it
// needs no JavaScript at all: the whole thing is two paths and a keyframe,
// so there is nothing to hydrate and nothing to tear down.
//
// Under prefers-reduced-motion the tick is simply there, fully drawn. The
// meaning lives in the mark, never in the movement.

import type { CSSProperties } from "react";

export function SuccessCheck({
  size = 72,
  color = "#6ec071",
  style,
}: {
  size?: number;
  /** Ring and tick colour. Defaults to the app's confirmation green. */
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="sw-success"
      // Decorative: the heading beside it already says what happened, and
      // a screen reader announcing "image" here would add nothing.
      aria-hidden="true"
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        ["--sw-success-c" as string]: color,
        ...style,
      }}
    >
      {/* The halo, behind. One breath out, then gone. */}
      <span className="sw-success-halo" />
      <svg viewBox="0 0 52 52" width={size} height={size} fill="none" style={{ position: "relative" }}>
        <circle
          className="sw-success-ring"
          cx="26" cy="26" r="24"
          stroke={color}
          strokeWidth="2"
          /* The circumference, so the dash can be the whole line. */
          strokeDasharray="151" strokeDashoffset="151"
        />
        <path
          className="sw-success-tick"
          d="M15 27.5 L22.5 35 L37.5 19"
          stroke={color}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="36" strokeDashoffset="36"
        />
      </svg>
    </span>
  );
}
