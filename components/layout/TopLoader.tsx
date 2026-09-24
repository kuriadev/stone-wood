"use client";

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

export interface LoaderRef {
  start: () => void;
  finish: () => void;
}

/**
 * The navigation progress bar.
 *
 * It used to be theatre. `start()` set the bar to 15% and it stayed there
 * until `finish()` slammed it to 100%; meanwhile each page ran its own
 * `setInterval` incrementing a `progress` variable that was never read by
 * anything. Worse, every link handler waited a fixed 500ms before calling
 * router.push, so the bar was not measuring a page load — it was causing a
 * delay and then reporting on it.
 *
 * Now the bar owns its own motion. start() trickles it toward 90% on a real
 * timer, which is what a progress bar for an unknown-length task can honestly
 * do, and finish() — called when the new route has actually rendered and its
 * data has arrived — completes it.
 */
export const TopLoader = forwardRef<LoaderRef>((_, ref) => {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const trickle = useRef<number | null>(null);
  const hide = useRef<number | null>(null);

  const stopTimers = () => {
    if (trickle.current !== null) { clearInterval(trickle.current); trickle.current = null; }
    if (hide.current !== null) { clearTimeout(hide.current); hide.current = null; }
  };

  useImperativeHandle(ref, () => ({
    start() {
      stopTimers();
      setActive(true);
      setProgress(12);
      // Ease toward 90% and wait there. Never reach 100 on a timer — only
      // the real completion is allowed to do that, or the bar would claim
      // the page had loaded before it had.
      trickle.current = window.setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.6, (90 - p) * 0.08)));
      }, 160);
    },
    finish() {
      stopTimers();
      setProgress(100);
      hide.current = window.setTimeout(() => {
        setActive(false);
        setProgress(0);
      }, 280);
    },
  }));

  // A navigation can be abandoned mid-flight; never leave a timer running.
  useEffect(() => stopTimers, []);

  if (!active) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: 3, zIndex: 9999 }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg,#c9a84c,#f5d06f,#c9a84c)",
          boxShadow: "0 0 10px rgba(201,168,76,0.8),0 0 20px rgba(201,168,76,0.4)",
          transition: "width .25s ease",
        }}
      />
    </div>
  );
});

TopLoader.displayName = "TopLoader";
