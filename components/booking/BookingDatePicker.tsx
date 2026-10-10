"use client";

/* The booking calendar.
 *
 * A stay can run over more than one day, and it is picked HERE rather than
 * through a separate "staying more than one day?" control: click the first
 * day, then click the last. A single click followed by Continue is still a
 * one-day booking, so the common case costs nothing extra.
 *
 * Two rules keep a range honest, and both are enforced by disabling tiles
 * rather than by complaining afterwards:
 *
 *   • it may not run past MAX_STAY_DAYS;
 *   • it may not jump over a booked or closed day — the stay has to be a
 *     run of days the resort can actually give you.
 *
 * So while a range is being picked, everything beyond the first obstacle is
 * simply not clickable, and the guest cannot build a selection the server
 * would then reject.
 */

import { useState, useMemo } from "react";
import { T } from "@/lib/theme";
import { getBookingWindow, toDateStr, BOOKING_WINDOW_MONTHS, MAX_STAY_DAYS } from "@/lib/validators";
import { checkBookingAvailability, holdsDate, fmtDate } from "@/lib/utils";
import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";

/** `ds` shifted by `n` days, in UTC so it cannot drift across a timezone. */
const addDays = (ds: string, n: number) =>
  new Date(Date.parse(`${ds}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

interface BookingDatePickerProps {
  bookings: Booking[];
  closedDates?: string[];
  /** First day of the stay. */
  selectedDate: string;
  /** Last day. Empty, or equal to the first, means a one-day booking. */
  endDate?: string;
  /** Called with the whole stay every time the selection changes. For a
   *  single-date picker, both arguments are the same day. */
  onSelectRange: (from: string, to: string) => void;
  /** One date only, no range. Moving an existing booking uses this: the
   *  guest picks a new FIRST day and the stay keeps the length it already
   *  has (shiftStay in lib/rebooking.server.ts), so letting them redraw the
   *  length here would quietly change what they are paying for. */
  single?: boolean;
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
  endDate = "",
  onSelectRange,
  single = false,
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
  /* True once a first day is down and the next click sets the last day.
     While it is false, a click starts a new stay. */
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState("");

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

  const maxStr = toDateStr(maxDate);

  /* The furthest day this stay may reach: MAX_STAY_DAYS long at most, and
     stopping short of the first booked or closed day, so a range can never
     straddle one. Null when no stay is being picked. */
  const rangeLimit = useMemo(() => {
    if (single || !picking || !selectedDate) return null;
    let last = selectedDate;
    for (let i = 1; i < MAX_STAY_DAYS; i++) {
      const next = addDays(selectedDate, i);
      if (next > maxStr) break;
      if (fullDates.has(next) || closedSet.has(next)) break;
      last = next;
    }
    return last;
  }, [single, picking, selectedDate, fullDates, closedSet, maxStr]);

  /* What the stay looks like right now, including the day being hovered
     while the last day is still being chosen. */
  const previewEnd =
    picking && hover && selectedDate && hover > selectedDate && rangeLimit && hover <= rangeLimit
      ? hover
      : endDate && endDate > selectedDate ? endDate : selectedDate;

  const stayDays = selectedDate && previewEnd
    ? Math.round((Date.parse(`${previewEnd}T00:00:00Z`) - Date.parse(`${selectedDate}T00:00:00Z`)) / 86_400_000) + 1
    : 0;

  const pick = (ds: string) => {
    if (single) { onSelectRange(ds, ds); return; }
    // Starting again: no stay in progress, or a day on/before the first one.
    if (!picking || !selectedDate || ds <= selectedDate) {
      onSelectRange(ds, ds);
      setPicking(true);
      return;
    }
    onSelectRange(selectedDate, ds);
    setPicking(false);
  };

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

      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "minmax(44px,1fr)", gap: 4 }}
        onMouseLeave={() => setHover("")}
      >
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
          /* Out of reach of the stay being picked: too far ahead, or past a
             booked day the stay cannot jump. Still available in itself, so
             it is dimmed rather than painted as taken — clicking elsewhere
             starts a new stay there. */
          const beyondStay = !!rangeLimit && bookable && ds > rangeLimit && ds > selectedDate;
          const isStart = !!selectedDate && ds === selectedDate;
          const isEnd = !!previewEnd && previewEnd !== selectedDate && ds === previewEnd;
          const inRange = !!selectedDate && !!previewEnd && ds > selectedDate && ds < previewEnd;
          const disabled = isPast || isBeyond || isBooked || isClosed || beyondStay;

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
          if (beyondStay) { cur = "not-allowed"; dim = true; }
          /* The stay is the available green stated louder: its two ends are
             solid, the nights between them a band. "Open", "the days you
             picked" and "the edges of your stay" are one idea at three
             strengths, not three accent colours. */
          if (inRange) {
            bg = isDark ? "rgba(76,175,80,0.30)" : "#bfe3c6";
            col = isDark ? "#d9f2db" : "#15532a";
            bdr = `1px solid ${isDark ? "rgba(76,175,80,0.45)" : "rgba(76,175,80,0.5)"}`;
          }
          if (isStart || isEnd) { bg = "#2b6b30"; col = "#ffffff"; bdr = "1px solid #5cb85c"; dim = false; }

          const label = isStart && previewEnd !== selectedDate
            ? " — first day of your stay"
            : isEnd ? " — last day of your stay"
            : inRange ? " — part of your stay"
            : isBooked ? " — booked"
            : isClosed ? " — closed"
            : isPast || isBeyond ? " — unavailable"
            : beyondStay ? ` — too far for one stay (up to ${MAX_STAY_DAYS} days)`
            : " — available";

          return (
            <button
              key={d}
              type="button"
              onClick={() => !disabled && pick(ds)}
              onMouseEnter={() => setHover(ds)}
              onFocus={() => setHover(ds)}
              disabled={disabled}
              aria-label={`${ds}${label}`}
              aria-pressed={isStart || isEnd || inRange}
              title={
                isPast
                  ? "Past date"
                  : isBeyond
                  ? `Bookings open up to ${BOOKING_WINDOW_MONTHS} months ahead (to ${toDateStr(maxDate)})`
                  : isBooked
                  ? "Booked"
                  : isClosed
                  ? "Not available"
                  : beyondStay
                  ? `A stay can run for up to ${MAX_STAY_DAYS} days in a row`
                  : picking && !single
                  ? "Click to make this your last day"
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
                fontWeight: isStart || isEnd ? 700 : 400,
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

      {/* ── What to do next, and what is picked ── */}
      <p
        aria-live="polite"
        style={{
          color: stayDays > 1 ? C.goldInk : C.textS,
          fontSize: 12.5,
          lineHeight: 1.6,
          textAlign: "center",
          margin: "12px 0 0",
        }}
      >
        {single
          ? (selectedDate ? <>{fmtDate(selectedDate)} selected.</> : <>Click the date you would like to move to.</>)
          : !selectedDate
          ? <>Click a date to start. You can book up to <strong>{MAX_STAY_DAYS} days</strong> in a row — click your first day, then your last.</>
          : picking
          ? <>Now click your <strong>last day</strong>, up to {MAX_STAY_DAYS} days. Or click {fmtDate(selectedDate)} again to stay just the one day.</>
          : stayDays > 1
          ? <><strong>{stayDays} days</strong> booked: {fmtDate(selectedDate)} to {fmtDate(previewEnd)}. Each day is charged.</>
          : <>{fmtDate(selectedDate)} — one day. Click another date to stay up to {MAX_STAY_DAYS} days.</>}
      </p>

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
