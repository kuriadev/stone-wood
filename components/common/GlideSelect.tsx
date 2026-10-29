"use client";

// ── GlideSelect ── a select chip whose menu pops from its corner and whose
// highlight glides between rows.
//
// Ported from React Bits' GlideSelect. Changes from the original:
//   • TypeScript, and the project's Icon instead of Hugeicons.
//   • Animations always play (the owner asked for motion on every device;
//     see Providers.tsx), so the reduced-motion block is gone.
//   • `borderColor`: a hairline round the chip and menu, so a chip the same
//     colour as the card it sits on still reads as a control.
//   • `fullWidth`: the chip stretches to its container (phones).
//
// The admin uses it through FilterSelect (components/admin/ui.tsx), which
// fills in the site's colours.

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "@/components/common/Icon";
import "./GlideSelect.css";

export type GlideOption<V extends string = string> = V | { value: V; label: ReactNode; tag?: string };
type Item<V extends string> = { value: V; label: ReactNode; tag?: string };

const SIZES = {
  sm: { chip: 28, row: 26, font: 12 },
  md: { chip: 32, row: 30, font: 13 },
  lg: { chip: 44, row: 40, font: 14 },
} as const;
const PAD = 4;
const GAP = 1;
const MENU_GAP = 6;

const norm = <V extends string>(o: GlideOption<V>): Item<V> => (typeof o === "string" ? { value: o, label: o } : o);
const textOf = <V extends string>(it: Item<V>) => (typeof it.label === "string" ? it.label : it.value);
const typeaheadIndex = <V extends string>(items: Item<V>[], from: number, ch: string) => {
  const c = ch.toLowerCase();
  const n = items.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (textOf(items[i]).toLowerCase().startsWith(c)) return i;
  }
  return from;
};

export interface GlideSelectProps<V extends string = string> {
  options: GlideOption<V>[];
  value?: V;
  defaultValue?: V;
  onChange?: (value: V, option: Item<V>) => void;
  placeholder?: string;
  showTags?: boolean;
  accentColor?: string;
  surfaceColor?: string;
  highlightColor?: string;
  textColor?: string;
  borderColor?: string;
  size?: "sm" | "md" | "lg";
  radius?: number;
  menuWidth?: number;
  placement?: "top" | "bottom";
  align?: "left" | "right";
  popDuration?: number;
  glideDuration?: number;
  rememberPosition?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
}

type Phase = "closed" | "open" | "closing";

export function GlideSelect<V extends string = string>({
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Select…",
  showTags = true,
  accentColor = "#f5f5f5",
  surfaceColor = "#27272a",
  highlightColor = "#3f3f46",
  textColor = "#f5f5f5",
  borderColor = "transparent",
  size = "md",
  radius = 10,
  menuWidth = 176,
  placement = "bottom",
  align = "left",
  popDuration = 180,
  glideDuration = 220,
  rememberPosition = true,
  disabled = false,
  fullWidth = false,
  ariaLabel = "Select",
  className = "",
}: GlideSelectProps<V>) {
  const items = options.map(norm);
  const [inner, setInner] = useState<V | "">(defaultValue ?? "");
  const current = value ?? inner;
  const selected = items.findIndex((it) => it.value === current);
  const [phase, setPhase] = useState<Phase>("closed");
  const [active, setActive] = useState<number | null>(null);
  const [side, setSide] = useState(placement);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const instant = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrub = useRef<{ id: number; top: number } | null>(null);
  const id = useId();
  const S = SIZES[size] ?? SIZES.md;
  const step = S.row + GAP;
  const popOut = Math.round((popDuration * 2) / 3);

  useLayoutEffect(() => {
    if (phase !== "open") return;
    const el = menuRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const r = root.getBoundingClientRect();
    const need = el.offsetHeight + MENU_GAP;
    setSide(
      placement === "bottom" && r.bottom + need > window.innerHeight
        ? "top"
        : placement === "top" && r.top - need < 0
          ? "bottom"
          : placement,
    );
    el.style.transitionDuration = instant.current ? "0ms" : "";
    el.dataset.state = "closed";
    void el.offsetHeight;
    el.dataset.state = "open";
    const p = pillRef.current;
    if (p) {
      p.style.transition = "none";
      p.style.transform = `translateY(${Math.max(0, selected) * step}px)`;
      p.style.opacity = "0";
      void p.offsetHeight;
      p.style.transition = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useLayoutEffect(() => {
    const p = pillRef.current;
    if (!p || phase !== "open") return;
    if (active === null) {
      p.style.opacity = "0";
      return;
    }
    const jump = instant.current || p.style.opacity !== "1";
    p.style.transitionDuration = jump ? "0ms, 150ms" : "";
    p.style.transform = `translateY(${active * step}px)`;
    p.style.opacity = "1";
    instant.current = false;
  }, [active, phase, step]);

  const open = (viaKey: boolean) => {
    if (disabled) return;
    clearTimeout(closeTimer.current);
    instant.current = true;
    setActive(selected >= 0 ? selected : viaKey ? 0 : null);
    setPhase("open");
  };
  const close = (mode: "instant" | "pop") => {
    setActive(null);
    clearTimeout(closeTimer.current);
    const el = menuRef.current;
    if (mode === "instant" || !el) {
      setPhase("closed");
      return;
    }
    el.style.transitionDuration = "";
    el.dataset.state = "closed";
    setPhase("closing");
    closeTimer.current = setTimeout(() => setPhase("closed"), popOut + 20);
  };
  const pick = (i: number, viaKey: boolean) => {
    const it = items[i];
    if (!it) {
      close("instant");
      return;
    }
    if (it.value !== current) {
      if (value === undefined) setInner(it.value);
      onChange?.(it.value, it);
      if (!viaKey && rootRef.current) rootRef.current.dataset.swap = "";
    }
    close("instant");
    triggerRef.current?.focus({ preventScroll: true });
  };

  const onTriggerKey = (e: ReactKeyboardEvent) => {
    const k = e.key;
    const n = items.length;
    const cur = active ?? Math.max(0, selected);
    if (phase !== "open") {
      if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        open(true);
      }
      return;
    }
    const go = (i: number) => {
      e.preventDefault();
      instant.current = true;
      setActive(Math.min(n - 1, Math.max(0, i)));
    };
    if (k === "ArrowDown" || k === "ArrowUp") go(active === null ? cur : cur + (k === "ArrowDown" ? 1 : -1));
    else if (k === "Home" || k === "End") go(k === "Home" ? 0 : n - 1);
    else if (k === "Enter" || k === " ") {
      e.preventDefault();
      pick(cur, true);
    } else if (k === "Escape" || k === "Tab") {
      if (k === "Escape") e.preventDefault();
      close("instant");
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) go(typeaheadIndex(items, cur, k));
  };

  useEffect(() => {
    if (phase === "closed") return undefined;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close("pop");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the menu when the chip is switched off
    if (disabled && phase !== "closed") close("instant");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const rowAt = (y: number) => {
    const s = scrub.current;
    if (!s) return null;
    const i = Math.floor((y - s.top - PAD) / step);
    return i >= 0 && i < items.length ? i : null;
  };
  const onListDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* not capturable: rows still work by hover and click */ }
    scrub.current = { id: e.pointerId, top: e.currentTarget.getBoundingClientRect().top };
    instant.current = true;
    setActive(rowAt(e.clientY));
  };
  const onListMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrub.current || scrub.current.id !== e.pointerId) return;
    const i = rowAt(e.clientY);
    if (i !== active) setActive(i);
  };
  const onListUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrub.current || scrub.current.id !== e.pointerId) return;
    const i = e.type === "pointerup" ? rowAt(e.clientY) : null;
    scrub.current = null;
    if (i !== null) pick(i, false);
    else if (!rememberPosition) setActive(null);
  };
  const onListOver = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || scrub.current) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!row) return;
    const i = Number(row.dataset.index);
    if (i !== active) setActive(i);
  };

  const origin = `${side === "bottom" ? "top" : "bottom"} ${align}`;
  return (
    <div
      ref={rootRef}
      className={`glide-select${className ? ` ${className}` : ""}`}
      data-size={size}
      data-full={fullWidth ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      style={{
        "--gs-accent": accentColor,
        "--gs-surface": surfaceColor,
        "--gs-highlight": highlightColor,
        "--gs-text": textColor,
        "--gs-border": borderColor,
        "--gs-radius": `${radius}px`,
        "--gs-inner-radius": `${Math.max(3, radius - 4)}px`,
        "--gs-chip": `${S.chip}px`,
        "--gs-row": `${S.row}px`,
        "--gs-font": `${S.font}px`,
        "--gs-menu-w": `${menuWidth}px`,
        "--gs-pop": `${popDuration}ms`,
        "--gs-pop-out": `${popOut}ms`,
        "--gs-glide": `${glideDuration}ms`,
        "--gs-origin": origin,
      } as CSSProperties}
      onAnimationEnd={(e) => {
        if (e.animationName === "gs-swap" && rootRef.current) delete rootRef.current.dataset.swap;
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={phase === "open"}
        aria-controls={`${id}-list`}
        aria-activedescendant={active !== null ? `${id}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className="glide-select__trigger"
        onPointerDown={(e) => {
          if (e.button !== 0 || disabled) return;
          e.currentTarget.focus({ preventScroll: true });
          if (phase === "open") close("pop");
          else open(false);
        }}
        onKeyDown={onTriggerKey}
      >
        <span className="glide-select__label" key={current} data-empty={selected < 0 ? "" : undefined}>
          {selected >= 0 ? items[selected].label : placeholder}
        </span>
        {/* The chosen row's tag (a count, say) on the chip too, so the
            number is readable without opening the menu. */}
        {showTags && selected >= 0 && items[selected].tag ? <span className="glide-select__tag" aria-hidden="true">{items[selected].tag}</span> : null}
        <span className="glide-select__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={13} strokeWidth={2.5} />
        </span>
      </button>
      {phase !== "closed" ? (
        <div ref={menuRef} className="glide-select__menu" data-state="open" data-side={side} data-align={align}>
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            className="glide-select__list"
            data-live={active !== null ? "" : undefined}
            onPointerOver={onListOver}
            onPointerLeave={() => {
              if (!scrub.current && !rememberPosition) setActive(null);
            }}
            onPointerDown={onListDown}
            onPointerMove={onListMove}
            onPointerUp={onListUp}
            onPointerCancel={onListUp}
            onLostPointerCapture={onListUp}
          >
            <span ref={pillRef} className="glide-select__pill" aria-hidden="true" />
            {items.map((it, i) => (
              <div key={it.value} id={`${id}-${i}`} role="option" aria-selected={i === selected} data-index={i} className="glide-select__option">
                <span className="glide-select__name">{it.label}</span>
                {showTags && it.tag ? <span className="glide-select__tag">{it.tag}</span> : null}
                <span className="glide-select__check" data-on={i === selected ? "" : undefined} aria-hidden="true">
                  <Icon name="check" size={13} strokeWidth={2.5} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default GlideSelect;
