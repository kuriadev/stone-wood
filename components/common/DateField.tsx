"use client";

// ── DateField ── a date (or month) field that opens the site's own calendar
//
// Replaces <input type="date"> / type="month" across the admin. The browser's
// own picker looks different in every browser (a white Windows calendar with
// blue arrows on a dark gold page), and on desktop only the small icon
// opened it. Here the whole field is one button, and the calendar matches the
// rest of the admin in both themes: a month of days (tap the month name for
// a grid of months), gold on the chosen day, today ringed, Clear and Today.
//
// Values stay the strings the native inputs used ("YYYY-MM-DD", or "YYYY-MM"
// for mode="month", "" for empty), so swapping it in changes no state.
// Keyboard: the arrows move by day / week, PageUp and PageDown by month,
// Enter picks, Esc closes.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/common/Icon";
import { THEME_COLORS as C } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { manilaNow } from "@/lib/validators";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s || "");
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: m[3] ? Number(m[3]) : 1 } : null;
};
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** "date": YYYY-MM-DD (default). "month": YYYY-MM. */
  mode?: "date" | "month";
  min?: string;
  max?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  /** Styles for the field itself (the admin passes its input style). */
  style?: CSSProperties;
  className?: string;
  disabled?: boolean;
}

export function DateField({
  value, onChange, mode = "date", min, max, id, placeholder, style, className, disabled,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const today = manilaNow().date;
  const t = parse(today)!;
  const sel = parse(value);
  const [open, setOpen] = useState(false);
  // The month on screen, and whether the month grid is showing.
  const [cursor, setCursor] = useState(() => (sel ? { y: sel.y, m: sel.m } : { y: t.y, m: t.m }));
  const [months, setMonths] = useState(mode === "month");
  const [focusDay, setFocusDay] = useState<string>(value || today);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Opening starts on the chosen date, else today -- or, when today can't
  // be picked (a "To" after the "From"), the nearest day that can.
  useEffect(() => {
    if (!open) return;
    const lo = min && mode === "date" ? min : null;
    const hi = max && mode === "date" ? max : null;
    const start = value && mode === "date" ? value : lo && today < lo ? lo : hi && today > hi ? hi : today;
    const s = parse(mode === "month" ? value || today : start) ?? t;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the view each time the calendar opens
    setCursor({ y: s.y, m: s.m });
    setMonths(mode === "month");
    setFocusDay(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const inRange = (s: string) => (!min || s >= (mode === "month" ? min.slice(0, 7) : min)) && (!max || s <= (mode === "month" ? max.slice(0, 7) : max));

  const pick = (s: string) => {
    if (!inRange(s)) return;
    onChange(s);
    setOpen(false);
  };

  // The 6 x 7 days on screen: the tail of last month, this month, the head of next.
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay();
    const out: { s: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(cursor.y, cursor.m, 1 - first + i);
      out.push({ s: ymd(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === cursor.m });
    }
    return out;
  }, [cursor]);

  const step = (by: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + by, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Keyboard on the day grid.
  const moveFocus = (days: number, months = 0) => {
    const f = parse(focusDay) ?? t;
    const d = new Date(f.y, f.m + months, months ? Math.min(f.d, daysIn(f.y, f.m + months)) : f.d + days);
    const s = ymd(d.getFullYear(), d.getMonth(), d.getDate());
    setFocusDay(s);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const onGridKey = (e: ReactKeyboardEvent) => {
    const k = e.key;
    const map: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(-1), ArrowRight: () => moveFocus(1),
      ArrowUp: () => moveFocus(-7), ArrowDown: () => moveFocus(7),
      PageUp: () => moveFocus(0, -1), PageDown: () => moveFocus(0, 1),
      Home: () => moveFocus(-((parse(focusDay)?.d ?? 1) - 1)),
      End: () => { const f = parse(focusDay) ?? t; moveFocus(daysIn(f.y, f.m) - f.d); },
      Enter: () => pick(focusDay), " ": () => pick(focusDay),
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  };
  useEffect(() => {
    if (!open || months) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true });
  }, [focusDay, open, months, cursor]);

  const shown = sel
    ? mode === "month" ? `${MONTHS_LONG[sel.m]} ${sel.y}` : `${MONTHS[sel.m]} ${sel.d}, ${sel.y}`
    : placeholder ?? (mode === "month" ? "Pick a month" : "Pick a date");

  const cellBase: CSSProperties = { border: "1px solid transparent", borderRadius: 10, background: "transparent", fontFamily: "inherit", cursor: "pointer", transition: "background-color .15s ease, border-color .15s ease, color .15s ease" };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}${sel ? `, ${shown}` : ""}` : undefined}
          aria-haspopup="dialog"
          className={`sw-datefield${className ? ` ${className}` : ""}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer", minHeight: 40, ...style,
            borderColor: open ? gold : (style?.borderColor as string | undefined),
          }}
        >
          <span style={{ color: sel ? C.textH : C.textXS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shown}</span>
          <Icon name="calendar" size={15} style={{ color: open ? C.goldInk : C.textS, flexShrink: 0 }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[2100] w-[min(296px,calc(100vw-24px))] p-0"
        style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,0.45)", color: C.textH }}
        // Focus the chosen (or starting) day once the calendar is on the
        // page, so the arrow keys work straight away; a month grid takes
        // Radix's default (its first month).
        onOpenAutoFocus={(e) => {
          if (mode === "month") return;
          e.preventDefault();
          const el = e.currentTarget as HTMLElement;
          requestAnimationFrame(() => el.querySelector<HTMLButtonElement>('[data-day][tabindex="0"]')?.focus({ preventScroll: true }));
        }}
      >
        <div role="dialog" aria-label={ariaLabel ?? (mode === "month" ? "Choose a month" : "Choose a date")} style={{ padding: 12 }}>
          {/* Month / year, and the arrows. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => mode === "date" && setMonths((x) => !x)}
              aria-label={months ? "Back to the days" : "Choose the month"}
              style={{ ...cellBase, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px", color: C.textH, fontSize: 14.5, fontWeight: 600, cursor: mode === "date" ? "pointer" : "default" }}
            >
              {months ? cursor.y : `${MONTHS_LONG[cursor.m]} ${cursor.y}`}
              {mode === "date" && <Icon name="chevron-down" size={13} style={{ color: C.textS, transition: "transform .2s ease", transform: months ? "rotate(180deg)" : "none" }} />}
            </button>
            <span style={{ display: "flex", gap: 6 }}>
              {(["chevron-left", "chevron-right"] as const).map((ic, i) => (
                <button key={ic} type="button" onClick={() => (months ? setCursor((c) => ({ ...c, y: c.y + (i ? 1 : -1) })) : step(i ? 1 : -1))}
                  aria-label={months ? (i ? "Next year" : "Previous year") : (i ? "Next month" : "Previous month")}
                  style={{ ...cellBase, width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.goldInk, border: `1px solid ${C.border}` }}>
                  <Icon name={ic} size={15} />
                </button>
              ))}
            </span>
          </div>

          {months ? (
            <div role="grid" aria-label={`Months of ${cursor.y}`} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: "4px 0" }}>
              {MONTHS.map((name, m) => {
                const key = `${cursor.y}-${pad(m + 1)}`;
                const chosen = sel && sel.y === cursor.y && sel.m === m;
                const isNow = t.y === cursor.y && t.m === m;
                const allowed = mode === "month" ? inRange(key) : (!min || key >= min.slice(0, 7)) && (!max || key <= max.slice(0, 7));
                return (
                  <button key={name} type="button" disabled={!allowed}
                    onClick={() => { if (mode === "month") pick(key); else { setCursor({ y: cursor.y, m }); setMonths(false); } }}
                    aria-pressed={!!chosen}
                    className="sw-datefield__cell"
                    style={{
                      ...cellBase, height: 44, fontSize: 13.5,
                      color: chosen ? C.goldInk : allowed ? C.textH : C.textXS,
                      border: `1px solid ${chosen ? gold : isNow ? `${gold}66` : C.border}`,
                      background: chosen ? `${gold}22` : "transparent",
                      opacity: allowed ? 1 : 0.4, cursor: allowed ? "pointer" : "not-allowed",
                    }}>
                    {name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div ref={gridRef} role="grid" aria-label={`${MONTHS_LONG[cursor.m]} ${cursor.y}`} onKeyDown={onGridKey}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", marginBottom: 4 }}>
                {DAYS.map((d) => <span key={d} style={{ textAlign: "center", color: C.textXS, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, padding: "4px 0" }}>{d.toUpperCase()}</span>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
                {cells.map((c) => {
                  const chosen = value === c.s;
                  const isToday = c.s === today;
                  const allowed = inRange(c.s);
                  return (
                    <button key={c.s} type="button" data-day={c.s} disabled={!allowed}
                      tabIndex={c.s === focusDay ? 0 : -1}
                      onClick={() => pick(c.s)}
                      onFocus={() => setFocusDay(c.s)}
                      aria-pressed={chosen}
                      aria-label={`${MONTHS_LONG[Number(c.s.slice(5, 7)) - 1]} ${c.day}, ${c.s.slice(0, 4)}${isToday ? ", today" : ""}`}
                      className="sw-datefield__cell"
                      style={{
                        ...cellBase, height: 36, fontSize: 13,
                        fontWeight: chosen || isToday ? 700 : 500,
                        color: chosen ? "#1a1408" : !allowed ? C.textXS : c.inMonth ? C.textH : C.textXS,
                        background: chosen ? gold : "transparent",
                        border: `1px solid ${chosen ? gold : isToday ? `${gold}88` : "transparent"}`,
                        opacity: allowed ? (c.inMonth ? 1 : 0.45) : 0.3,
                        cursor: allowed ? "pointer" : "not-allowed",
                      }}>
                      {c.day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <button type="button" className="sw-ulink" onClick={() => { onChange(""); setOpen(false); }} disabled={!value}
              style={{ ...cellBase, padding: "6px 8px", fontSize: 13, fontWeight: 600, color: value ? C.textS : C.textXS, cursor: value ? "pointer" : "default" }}>
              Clear
            </button>
            <button type="button" className="sw-ulink"
              onClick={() => pick(mode === "month" ? today.slice(0, 7) : today)}
              disabled={!inRange(mode === "month" ? today.slice(0, 7) : today)}
              style={{ ...cellBase, padding: "6px 8px", fontSize: 13, fontWeight: 700, color: C.goldInk }}>
              {mode === "month" ? "This month" : "Today"}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateField;
