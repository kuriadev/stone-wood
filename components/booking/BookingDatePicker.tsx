"use client";

import { useState, useMemo } from "react";
import { T } from "@/lib/theme";
import { getBookingWindow, toDateStr, BOOKING_WINDOW_MONTHS } from "@/lib/validators";
import { checkBookingAvailability, holdsDate } from "@/lib/utils";
import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";

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
  /** Day, Night or Whole Day — each slot has its own availability, so a
   *  date whose Day is full can still be open for the Night. */
  slot?: BookingSlot;
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
  slot = "Day",
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
    const candidateDates = new Set(bookings.filter(holdsDate).map((b) => b.date));
    const full = new Set<string>();
    candidateDates.forEach((ds) => {
      if (!checkBookingAvailability(ds, slot, guests, tier, resource, bookings).ok) full.add(ds);
    });
    return full;
  }, [bookings, guests, resource, tier, slot]);
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
    background: enabled
      ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)")
      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)"),
    border: "none",
    // A disabled arrow still has to be perceivable, or the header looks broken.
    color: enabled ? C.textB : C.textS,
    cursor: enabled ? "pointer" : "not-allowed",
    // Round, matching AvailabilityCalendar on the home page: the two
    // calendars are the same control and should not look like two designs.
    borderRadius: "50%",
    // 44x44, the HIG default control size (accessibility.md > Minimum
    // sizes). 28x28 is Apple's floor, not its target.
    width: 44,
    height: 44,
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: enabled ? 1 : 0.55,
  });

  return (
    <div
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "16px 12px",
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
            fontSize: 19,
            fontWeight: 400,
            fontFamily: "'Satoshi',system-ui,sans-serif",
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
          gap: 4,
          marginBottom: 4,
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            style={{ textAlign: "center", fontSize: 12, color: C.textS, padding: "4px 0 8px" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "minmax(44px,1fr)", gap: 4 }}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const ds = toStr(d);
          const dayDate = new Date(year, month, d);
          const isPast = dayDate < today;
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
          const isBooked = bookable && fullDates.has(ds);
          const isClosed = bookable && closedSet.has(ds);
          const isSel = selectedDate === ds;
          const disabled = isPast || isBeyond || isBooked || isClosed;
          /* Same palette as AvailabilityCalendar on the home page, with light
             equivalents added: these two calendars are the same control and a
             guest moving from the hero card to /book should not meet a second
             colour language. Booked is DARKER than past in both themes -- it
             used to be lighter, so the two states looked alike. */
          let bg = isDark ? "rgba(76,175,80,0.12)" : "#e8f5ea";
          let col = isDark ? "#6ec071" : "#1f7a38";
          let bdr = `1px solid ${isDark ? "rgba(76,175,80,0.28)" : "rgba(76,175,80,0.35)"}`;
          let cur: string = "pointer";
          const quiet = isDark ? "rgba(255,255,255,0.03)" : "#f4f2ee";
          const quietInk = isDark ? "rgba(238,232,220,0.55)" : "#6f675c";
          const quietBdr = `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "#eae5dc"}`;
          /* Two different ideas, told two different ways.
             BOOKED is a STATE: somebody has that date, so it gets a solid
             grey chip you can read.
             PAST and OUT-OF-RANGE are not states, they are the absence of an
             option, so they keep the neutral tile and are dimmed by opacity
             instead. Painting both of them grey is what made them
             indistinguishable. */
          let dim = false;
          if (isPast) { bg = quiet; col = quietInk; bdr = quietBdr; cur = "not-allowed"; dim = true; }
          if (isBeyond) { bg = quiet; col = quietInk; bdr = quietBdr; cur = "not-allowed"; dim = true; }
          if (isBooked) {
            bg = isDark ? "rgba(200,200,200,0.42)" : "#d6d6d6";
            col = isDark ? "rgba(244,244,244,0.92)" : "#4f4f4f";
            bdr = `1px solid ${isDark ? "rgba(210,210,210,0.5)" : "#c0c0c0"}`;
            cur = "not-allowed";
          }
          if (isClosed) {
            bg = isDark ? "rgba(180,70,70,0.10)" : "#fbeaea";
            col = isDark ? "rgba(214,138,138,0.75)" : "#b05a5a";
            bdr = `1px solid ${isDark ? "rgba(180,70,70,0.22)" : "rgba(180,70,70,0.25)"}`;
            cur = "not-allowed";
          }
          /* The selection is the available green stated louder, not a second
             accent colour: "open" and "the one you picked" are one idea. */
          if (isSel) { bg = "#2b6b30"; col = "#ffffff"; bdr = "1px solid #5cb85c"; }
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
                padding: "4px",
                borderRadius: 10,
                // Dimming the whole cell, rather than just muting its ink, is
                // what makes a past date read as "not a thing you can press".
                opacity: dim ? 0.38 : 1,
                background: bg,
                border: bdr,
                color: col,
                fontSize: 14,
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
          /* "Selected" is gone: the chosen day is a solid green tile, which
             needs no key, and three entries match the home page legend. */
          ["Available", isDark ? "#6ec071" : "#3a9c4f"],
          ["Booked", isDark ? "rgba(198,198,198,0.85)" : "#8a8a8a"],
          ["Closed", isDark ? "rgba(214,138,138,0.75)" : "#c07575"],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: C.textS, fontSize: 12 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
