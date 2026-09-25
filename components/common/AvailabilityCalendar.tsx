"use client";

import { useState, useEffect, useMemo } from "react";
import { gold } from "@/lib/styles";
import { getBookingWindow, toDateStr, BOOKING_WINDOW_MONTHS } from "@/lib/validators";
import type { Booking } from "@/types/booking";
import { checkBookingAvailability } from "@/lib/utils";

interface AvailabilityCalendarProps {
  bookings: Booking[];
  closedDates?: string[];
  onSelectDate: (ds: string) => void;
  selectedDate?: string;
}

export function AvailabilityCalendar({
  bookings,
  closedDates = [],
  onSelectDate,
  selectedDate,
}: AvailabilityCalendarProps) {
  // The calendar depends on the *browser's* current date. Computing that during
  // SSR produces HTML that can disagree with what the client builds (different
  // timezone / the day rolling over), which React reports as a hydration
  // mismatch. So we render nothing date-dependent until after mount.
  const [mounted, setMounted] = useState(false);
  const [calMonth, setCalMonth] = useState<Date | null>(null);

  useEffect(() => {
    const now = new Date();
    setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setMounted(true);
  }, []);

  // Bookable range: today → min(today + 3 months, 31 Dec of this year).
  // Computed once per mount so a render mid-session cannot shift it.
  const { min: minDate, max: maxDate } = useMemo(() => getBookingWindow(), [mounted]);

  // "Booked" means at least one slot on the date can no longer take even a
  // single extra Shared guest — an Exclusive buyout (which closes the whole
  // date) or a slot at capacity.
  //
  // This used to require EVERY slot to be full before greying a date, so a
  // date whose Day was sold out still rendered plain green and fully
  // clickable, indistinguishable from an empty one. The guest only found out
  // after picking it and reaching the booking form.
  //
  // It is intentionally stricter than the booking page's own picker, which
  // knows the slot, tier and headcount being requested and can therefore
  // still offer the free half of a part-booked date. This calendar knows
  // none of that yet, so it errs toward not advertising a date it cannot
  // promise.
  const bookedDates = useMemo(() => {
    const dates = new Set(bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date));
    const full = new Set<string>();
    dates.forEach((d) => {
      const anySlotFull = (["Day", "Night"] as const).some(
        (sl) => !checkBookingAvailability(d, sl, 1, "Shared", "Pool", bookings).ok
      );
      if (anySlotFull) full.add(d);
    });
    return full;
  }, [bookings]);
  const closedSet = useMemo(() => new Set(closedDates), [closedDates]);

  const year = calMonth ? calMonth.getFullYear() : minDate.getFullYear();
  const month = calMonth ? calMonth.getMonth() : minDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const toStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Month navigation is bounded by the same window, so the guest can never
  // page into a month that holds no bookable dates.
  const firstMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const lastMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const viewing = new Date(year, month, 1);
  const canGoPrev = mounted && viewing > firstMonth;
  const canGoNext = mounted && viewing < lastMonth;

  const step = (delta: number) =>
    setCalMonth((m) => {
      if (!m) return m;
      const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
      if (next < firstMonth || next > lastMonth) return m;
      return next;
    });

  const navBtn = (enabled: boolean) => ({
    background: "none",
    border: "1px solid #2a2a2a",
    color: enabled ? "#aaa" : "#3a3a3a",
    cursor: enabled ? "pointer" : "not-allowed",
    borderRadius: 3,
    width: 28,
    height: 28,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: enabled ? 1 : 0.4,
  });

  return (
    <div
      style={{
        background: "rgba(10,10,10,0.98)",
        border: "1px solid #2a2a2a",
        borderRadius: 8,
        padding: "20px 18px",
        width: "100%",
        maxWidth: 360,
        minWidth: 300,          /* ← prevents calendar from shrinking */
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
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
            color: "#f0f0f0",
            fontSize: 14.5,
            fontFamily: "'Cormorant Garamond',Georgia,serif",
          }}
        >
          {mounted && calMonth
            ? calMonth.toLocaleString("default", { month: "long", year: "numeric" })
            : " "}
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
            style={{ textAlign: "center", fontSize: 11.5, color: "#666", padding: "3px 0" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {!mounted
          ? /* Placeholder keeps the panel the same height before mount. */
            Array.from({ length: 35 }).map((_, i) => (
              <div key={`ph${i}`} style={{ padding: "7px 2px", fontSize: 13.5, visibility: "hidden" }}>
                0
              </div>
            ))
          : (
            <>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const ds = toStr(d);
          const dayDate = new Date(year, month, d);
          const isPast = dayDate < minDate;
          const isBeyond = dayDate > maxDate;
          // A past date is just past. It used to be tested for availability
          // as well, and because `isBooked` is applied after `isPast` in the
          // cascade below, a past date that happened to be unavailable for
          // the CURRENT request was repainted as "Booked" — so 24 Sep looked
          // ordinary under Shared but turned grey the moment you switched to
          // Exclusive, as though someone had just booked it. Whether a date
          // gone by could have taken a booking is not information; it only
          // made the same day look different depending on the tier.
          //
          // Out of range is the same: nobody can book it, so it should not
          // advertise why.
          const bookable = !isPast && !isBeyond;
          const isBooked = bookable && bookedDates.has(ds);
          const isClosed = bookable && closedSet.has(ds);
          const isSel = selectedDate === ds;
          const disabled = isPast || isBeyond || isBooked || isClosed;

          // ── Available (default): green tint ─────────────────────────────
          let bg  = "rgba(76,175,80,0.10)";
          let col = "#5cb85c";
          let bdr = "1px solid rgba(76,175,80,0.22)";
          let cur: string = "pointer";

          if (isPast)   { bg = "#0c0c0c";              col = "#333";     bdr = "1px solid #1a1a1a"; cur = "default";     }
          if (isBeyond) { bg = "#0c0c0c";              col = "#333";     bdr = "1px solid #1a1a1a"; cur = "not-allowed"; }
          if (isBooked) { bg = "#161616";              col = "#444";     bdr = "1px solid #252525"; cur = "not-allowed"; }
          if (isClosed) { bg = "#1a0a0a";              col = "#553333";  bdr = "1px solid #2a1010"; cur = "not-allowed"; }
          if (isSel)    { bg = gold;                   col = "#000";     bdr = `1px solid ${gold}`; }

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
            </>
          )}
      </div>

      {/* Legend — centered together */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 14,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {[
          ["Available", "#5cb85c"],
          ["Booked",    "#444"],
          ["Closed",    "#553333"],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: "#666", fontSize: 11.5 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
