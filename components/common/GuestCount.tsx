"use client";

// ── Faster guest counts
//
// Going from 2 to 30 guests used to take 28 taps. Two shortcuts, shared by
// the home page card and Book Now:
//   • holdStep(): press and hold − or + and the count keeps moving,
//     speeding up the longer it is held.
//   • <GuestInput>: the number itself is a text box, so a guest can just
//     type "30".

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

/** Pointer and click handlers for a − or + button that repeats while held.
 *  `step` is called once on press, then again and again until release.
 *  A keyboard press (Enter/Space) arrives as a click and steps once. */
export function useHoldStep(step: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const start = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection or focus jump while held
    stop();
    stepRef.current();
    let delay = 140;
    const tick = () => {
      stepRef.current();
      delay = Math.max(40, delay * 0.85);
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, 400);
    // The button can turn disabled at the limit, and a disabled button
    // never hears its own pointerup, so listen on the window.
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  return {
    onPointerDown: start,
    onPointerLeave: stop,
    onContextMenu: (e: MouseEvent) => e.preventDefault(), // long-press menu on phones
    // detail 0 = a keyboard "click"; pointer presses were handled above.
    onClick: (e: MouseEvent) => { if (e.detail === 0) stepRef.current(); },
  };
}

/** The guest count as a typeable box. Updates as soon as the typed number
 *  is in range; anything else is put back in range when the box loses
 *  focus or Enter is pressed. */
export function GuestInput({
  value, onChange, min, max, disabled, style, label = "Number of guests",
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  style?: CSSProperties;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  const commit = () => {
    const n = parseInt(draft, 10);
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    onChange(next);
    setDraft(String(next));
    setEditing(false);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={`${label}, ${min} to ${max}`}
      disabled={disabled}
      value={draft}
      onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
        setDraft(digits);
        const n = parseInt(digits, 10);
        if (n >= min && n <= max) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(max, value + 1)); setEditing(false); }
        if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(min, value - 1)); setEditing(false); }
      }}
      style={{
        background: "transparent", border: "none", outline: "none", padding: 0,
        textAlign: "center", font: "inherit", color: "inherit",
        borderBottom: "1px dashed rgba(201,168,76,0.45)",
        ...style,
      }}
    />
  );
}
