"use client";

import { useState, useMemo } from "react";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { getBookingWindow, toDateStr, BOOKING_WINDOW_MONTHS } from "@/lib/validators";
import { checkBookingAvailability } from "@/lib/utils";
import type { Booking, BookingResource, BookingTier } from "@/types/booking";

interface BookingDatePickerProps {
  bookings: Booking[];
  closedDates?: string[];
  selectedDate: string;
  onSelectDate: (ds: string) => void;
  isDark: boolean;
  /** Guest count for the booking being made, so a "Shared" date with room
   *  left is still shown as available instead of flatly "booked". */
  guests?: number;
  /** Which resource is being booked and at what tier — a Venue-only booking
   *  is checked against the venue's own calendar, not the pool's. */
  resource?: BookingResource;
  tier?: BookingTier;
}

export function BookingDatePicker({
  bookings,
  closedDates = [],
  selectedDate,
  onSelectDate,
  isDark,
  guests = 1,
  resource = "Pool",
  tier = "Shared",
}: BookingDatePickerProps) {
  // Bookable range: today → min(today + 3 months, 31 Dec of this year).
  // This component only mounts at step 2, after interaction, so reading the
  // clock during render cannot produce a server/client hydration mismatch.
  const { min: today, max: maxDate } = useMemo(() => getBookingWindow(), []);

  const [calMonth, setCalMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  // A date is "full" for this request when checkBookingAvailability says so —
  // not merely because some other (Shared) booking already exists on it.
  const fullDates = useMemo(() => {
    const candidateDates = new Set(bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date));
    const full = new Set<string>();
    candidateDates.forEach((ds) => {
      if (!checkBookingAvailability(ds, guests, tier, resource, bookings).ok) full.add(ds);
    });
    return full;
  }, [bookings, guests, resource, tier]);
  const closedSet = useMemo(() => new Set(closedDates), [closedDates]);
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const toStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const C = T(isDark);

  // Navigation is bounded by the same window, so the guest can never page
  // into a month that contains no bookable dates.
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const viewing = new Date(year, month, 1);
  const canGoPrev = viewing > firstMonth;
  const canGoNext = viewing < lastMonth;

  const step = (delta: number) =>
    setCalMonth((m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
      if (next < firstMonth || next > lastMonth) return m;
      return next;
    });

  const navBtn = (enabled: boolean) => ({
    background: "none",
    border: `1px solid ${C.border}`,
    color: C.textS,
    cursor: enabled ? "pointer" : "not-allowed",
    borderRadius: 3,
    width: 28,
    height: 28,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: enabled ? 1 : 0.35,
  });

  return (
    <div
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "16px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!canGoPrev}
          aria-label="Previous month"
          style={navBtn(canGoPrev)}
        >
          ‹
        </button>
        <span
          style={{
            color: C.textH,
            fontSize: 14.5,
            fontFamily: "'Cormorant Garamond',Georgia,serif",
          }}
        >
          {calMonth.toLocaleString("default", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canGoNext}
          aria-label="Next month"
          style={navBtn(canGoNext)}
        >
          ›
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
          marginBottom: 4,
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            style={{ textAlign: "center", fontSize: 11.5, color: C.textXS, padding: "3px 0" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const ds = toStr(d);
          const dayDate = new Date(year, month, d);
          const isPast = dayDate < today;
          const isBeyond = dayDate > maxDate;
          const isBooked = fullDates.has(ds);
          const isClosed = closedSet.has(ds);
          const isSel = selectedDate === ds;
          const disabled = isPast || isBeyond || isBooked || isClosed;
          let bg = isDark ? "#0f2a17" : "#dff5e5";
          let col = isDark ? "#63d471" : "#1f7a38";
          let bdr = `1px solid ${C.border}`;
          let cur: string = "pointer";
          if (isPast) { bg = isDark ? "#0c0c0c" : "#f8f6f2"; col = C.textXS; cur = "not-allowed"; }
          if (isBeyond) { bg = isDark ? "#0c0c0c" : "#f8f6f2"; col = C.textXS; cur = "not-allowed"; }
          if (isBooked) {
            bg = isDark ? "#202020" : "#e7e7e7";
            col = isDark ? "#666" : "#aaa";
            bdr = isDark
              ? "1px solid #303030"
              : "1px solid #d0d0d0";
            cur = "not-allowed";
          }
          if (isClosed) { bg = isDark ? "#1a0a0a" : "#fff0f0"; col = isDark ? "#553333" : "#e0a0a0"; cur = "not-allowed"; }
          if (isSel) { bg = gold; col = "#000"; bdr = `1px solid ${gold}`; }
          return (
            <button
              key={d}
              type="button"
              onClick={() => !disabled && onSelectDate(ds)}
              disabled={disabled}
              aria-label={`${ds}${isBooked ? " — booked" : isClosed ? " — closed" : isPast || isBeyond ? " — unavailable" : " — available"}`}
              aria-pressed={isSel}
              title={
                isPast
                  ? "Past date"
                  : isBeyond
                  ? `Bookings open up to ${BOOKING_WINDOW_MONTHS} months ahead (to ${toDateStr(maxDate)})`
                  : isBooked
                  ? "Booked"
                  : isClosed
                  ? "Not available"
                  : "Available"
              }
              style={{
                textAlign: "center",
                padding: "7px 2px",
                borderRadius: 3,
                background: bg,
                border: bdr,
                color: col,
                fontSize: 13.5,
                cursor: cur,
                fontWeight: isSel ? 700 : 400,
                userSelect: "none",
                width: "100%",
                fontFamily: "inherit",
                lineHeight: "inherit",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 12,
          justifyContent: "center",
        }}
      >
        {[
          ["Available", "#5cb85c"],
          ["Booked", "#888"],
          ["Closed", "#e55"],
          ["Selected", gold],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: C.textXS, fontSize: 11.5 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
