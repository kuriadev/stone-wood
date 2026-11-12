"use client";

/* The key under a guest calendar (Book Now, the home card).
 *
 * It used to be one centred line of tiny dots, "Available · Selected ·
 * Fully Booked · Closed", then "Booked stay: Day ☀ – Night ☾ – Staycation ⛱",
 * which testers found cramped (2026-11-12). Now it is two short lists on
 * the left: what each COLOUR of a date means, drawn as a mini date tile in
 * that colour, and what each MARK on a date means. Side by side on a wide
 * screen, one under the other on a phone.
 *
 * Dates that can't be picked (past, full, closed) all look like a past
 * date: a quiet, dimmed tile, so "can't press this" reads the same
 * everywhere. Closed ones keep a red, struck-through number. */

import { CAL } from "@/components/common/calendarColors";
import { SLOT_ICON } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { Icon } from "@/components/common/Icon";
import { useWidth } from "@/hooks/useWidth";
import type { BookingSlot } from "@/types/booking";

type Swatch = { label: string; note: string; bg: string; ink: string; rim: string; dim?: boolean; strike?: boolean };
const PICKABLE: Swatch[] = [
  { label: "Available", note: "Open to book", ...CAL.available },
  { label: "Selected", note: "Your date", ...CAL.selected },
];
const MARKS: BookingSlot[] = ["Day", "Night", "WholeDay"];

export function CalendarLegend({ text, muted, line, quiet, narrow = false }: {
  /** Label colour. */
  text: string;
  /** Note colour. */
  muted: string;
  /** Hairlines and the mark tiles' border. */
  line: string;
  /** One column (a narrow card or a phone). */
  narrow?: boolean;
  /** The calendar's own "can't pick" tile: past, full and closed dates. */
  quiet: { bg: string; ink: string; rim: string; red: string };
}) {
  // One column in a narrow card, or on a phone.
  const w = useWidth();
  const one = narrow || w < 640;
  const head = (t: string) => (
    <p style={{ margin: "0 0 8px", color: muted, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase" }}>{t}</p>
  );
  const row = { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } as const;
  // Can't be picked: drawn exactly like the calendar's past dates.
  const DATES: Swatch[] = [
    ...PICKABLE,
    { label: "Unavailable", note: "Past or fully booked", bg: quiet.bg, ink: quiet.ink, rim: quiet.rim, dim: true },
    { label: "Closed", note: "The resort is closed", bg: quiet.bg, ink: quiet.red, rim: quiet.rim, dim: true, strike: true },
  ];
  return (
    <div className="sw-callegend" style={{ display: "grid", gridTemplateColumns: one ? "minmax(0, 1fr)" : "minmax(0, 1.2fr) minmax(0, 1fr)", gap: one ? 14 : 20, marginTop: 14, textAlign: "left" }}>
      <div>
        {head("Dates")}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: one ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 8 }}>
          {DATES.map((d) => (
            <li key={d.label} style={row}>
              {/* A tiny date tile in the state's own colour. */}
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 7, background: d.bg, border: `1px solid ${d.rim}`, color: d.ink, fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0, opacity: d.dim ? 0.6 : 1, textDecoration: d.strike ? "line-through" : undefined, textDecorationThickness: d.strike ? 2 : undefined }}>12</span>
              <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ display: "block", color: text, fontSize: 12.5, fontWeight: 600 }}>{d.label}</span>
                <span style={{ display: "block", color: muted, fontSize: 11 }}>{d.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div style={one ? undefined : { borderLeft: `1px solid ${line}`, paddingLeft: 20 }}>
        {head("Icons on a date")}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {MARKS.map((s) => (
            <li key={s} style={row}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${line}`, color: text, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon name={SLOT_ICON[s]} size={14} />
              </span>
              <span style={{ color: text, fontSize: 12.5 }}>{SLOTS[s].label} booked</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
