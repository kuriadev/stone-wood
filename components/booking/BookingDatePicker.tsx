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

import { useState, useMemo, useCallback } from "react";
import { T } from "@/lib/theme";
import { getBookingWindow, bookingWindowNote, toDateStr, MAX_STAY_DAYS, manilaNow } from "@/lib/validators";
import { slotStartedProblem } from "@/lib/resort";
import { RangeConnector } from "@/components/common/RangeConnector";
import { CAL, CAL_LINE, GUEST_LEGEND } from "@/components/common/calendarColors";
import { checkBookingAvailability, holdsDate, fmtDate, bookingDates } from "@/lib/utils";
import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";

/** `ds` shifted by `n` days, in UTC so it cannot drift across a timezone. */
const addDays = (ds: string, n: number) =>
  new Date(Date.parse(`${ds}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const daysApart = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

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
  /** The prompt under a single-date calendar before anything is picked.
   *  Defaults to the reschedule wording. */
  singleHint?: string;
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
  /** The slot a stay of SEVERAL days is booked as (only the Whole Day can
   *  span dates, lib/resort.ts). The days after the first are judged by it,
   *  so a range can't be drawn over a night that is already taken and then
   *  turn out unavailable once the booking becomes a Whole Day. */
  rangeSlot?: BookingSlot;
}

export function BookingDatePicker({
  bookings,
  closedDates = [],
  selectedDate,
  endDate = "",
  onSelectRange,
  single = false,
  singleHint = "Click the date you would like to move to.",
  isDark,
  guests = 1,
  resource = "Pool",
  tier = "Shared",
  slot = "Day",
  rangeSlot,
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

  // A date is "full" for this request when checkBookingAvailability says so —
  // not merely because some other (Shared) booking already exists on it.
  // Every day a stay covers is a candidate, not only its first: day two of
  // someone's three-day stay is just as taken.
  const fullFor = useCallback((s: BookingSlot) => {
    const candidateDates = new Set(bookings.filter(holdsDate).flatMap((b) => bookingDates(b)));
    const full = new Set<string>();
    candidateDates.forEach((ds) => {
      if (!checkBookingAvailability(ds, s, guests, tier, resource, bookings).ok) full.add(ds);
    });
    return full;
  }, [bookings, guests, resource, tier]);
  const fullDates = useMemo(() => {
    const full = fullFor(slot);
    // Today, once this tour has started, can't be booked (lib/resort.ts).
    const today = manilaNow().date;
    if (slotStartedProblem(today, slot)) full.add(today);
    return full;
  }, [fullFor, slot]);
  const rangeFull = useMemo(() => (rangeSlot && rangeSlot !== slot ? fullFor(rangeSlot) : fullDates), [fullFor, rangeSlot, slot, fullDates]);
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
      if (rangeFull.has(next) || closedSet.has(next)) break;
      last = next;
    }
    return last;
  }, [single, picking, selectedDate, rangeFull, closedSet, maxStr]);

  /* The last day of the stay as it stands.
   *
   * There is no hover preview any more. Passing the pointer over a date
   * used to extend the stay to it, which meant the calendar changed under
   * a guest who was only reading it, a stay could be "picked" by a stray
   * sweep of the mouse on the way to somewhere else, and a touch screen
   * — which has no hover — got a different calendar from a desktop. Both
   * ends are clicked now: first day, then last. */
  const stayEnd = !single && endDate && endDate > selectedDate ? endDate : selectedDate;

  const stayDays = selectedDate && stayEnd
    ? Math.round((Date.parse(`${stayEnd}T00:00:00Z`) - Date.parse(`${selectedDate}T00:00:00Z`)) / 86_400_000) + 1
    : 0;

  const pick = (ds: string) => {
    /* Clicking a date that is already part of the selection clears it, so
       a wrong pick can be undone rather than only replaced. */
    if (selectedDate && ds >= selectedDate && ds <= stayEnd) {
      setPicking(false);
      onSelectRange("", "");
      return;
    }
    if (single) { onSelectRange(ds, ds); return; }
    // Starting again: no stay in progress, or a day before the first one.
    if (!picking || !selectedDate || ds < selectedDate) {
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
          const isEnd = !!stayEnd && stayEnd !== selectedDate && ds === stayEnd;
          const inRange = !!selectedDate && !!stayEnd && ds > selectedDate && ds < stayEnd;
          const disabled = isPast || isBeyond || isBooked || isClosed || beyondStay;
          /* The connecting line, in one segment per day of the stay. */
          const onLine = !!selectedDate && !!stayEnd && stayEnd !== selectedDate && ds >= selectedDate && ds <= stayEnd;
          const legIndex = onLine ? daysApart(selectedDate, ds) : 0;
          const weekday = dayDate.getDay();

          /* The same solid palette as the home page's calendar
             (calendarColors.ts): the two are one control. Past and
             out-of-range dates keep a neutral tile and are dimmed. */
          let bg: string = CAL.available.bg;
          let col: string = CAL.available.ink;
          let bdr = `1px solid ${CAL.available.rim}`;
          let cur: string = "pointer";
          const quiet = isDark ? "rgba(255,255,255,0.05)" : "#f4f2ee";
          const quietInk = isDark ? "rgba(238,232,220,0.9)" : "#4a4338";
          const quietBdr = `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#eae5dc"}`;
          let dim = false;
          if (isPast) { bg = quiet; col = quietInk; bdr = quietBdr; cur = "not-allowed"; dim = true; }
          if (isBeyond) { bg = quiet; col = quietInk; bdr = quietBdr; cur = "not-allowed"; dim = true; }
          if (isBooked) { bg = CAL.booked.bg; col = CAL.booked.ink; bdr = `1px solid ${CAL.booked.rim}`; cur = "not-allowed"; }
          if (isClosed) { bg = CAL.closed.bg; col = CAL.closed.ink; bdr = `1px solid ${CAL.closed.rim}`; cur = "not-allowed"; }
          if (beyondStay) { cur = "not-allowed"; dim = true; }
          // Every day of the stay the guest picked is gold, first to last.
          if (inRange || isStart || isEnd) { bg = CAL.selected.bg; col = CAL.selected.ink; bdr = `1px solid ${CAL.selected.rim}`; dim = false; }

          const label = isStart && stayEnd !== selectedDate
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
              disabled={disabled}
              aria-label={`${ds}${label}`}
              aria-pressed={isStart || isEnd || inRange}
              title={
                isPast
                  ? "Past date"
                  : isBeyond
                  ? bookingWindowNote()
                  : isBooked
                  ? "Booked"
                  : isClosed
                  ? "Not available"
                  : beyondStay
                  ? `A stay can run for up to ${MAX_STAY_DAYS} days in a row`
                  : isStart || isEnd || inRange
                  ? "Selected — click again to clear"
                  : picking && !single
                  ? "Click to make this your last day"
                  : "Available"
              }
              style={{
                position: "relative",
                textAlign: "center",
                padding: "4px",
                borderRadius: 10,
                // Dimming the whole cell, rather than just muting its ink, is
                // what makes a past date read as "not a thing you can press".
                opacity: dim ? 0.62 : 1,
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
              {/* The thread joining the first day of the stay to the
                  last. Shared with the home page's calendar so the two read
                  as one control — see components/common/RangeConnector. */}
              {onLine && (
                <RangeConnector
                  color={CAL_LINE}
                  isStart={isStart}
                  isEnd={ds === stayEnd}
                  weekday={weekday}
                  legIndex={legIndex}
                />
              )}
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
          ? (selectedDate ? <>{fmtDate(selectedDate)} selected. Click it again to clear.</> : <>{singleHint}</>)
          : !selectedDate
          ? <>Click a date to start. You can book up to <strong>{MAX_STAY_DAYS} days</strong> in a row — click your first day, then your last.</>
          : picking
          ? <>Now click your <strong>last day</strong>, up to {MAX_STAY_DAYS} days. Or click {fmtDate(selectedDate)} again to clear it.</>
          : stayDays > 1
          ? <><strong>{stayDays} days</strong> booked: {fmtDate(selectedDate)} to {fmtDate(stayEnd)}. Click any of them to clear.</>
          : <>{fmtDate(selectedDate)} — one day. Click it again to clear, or another date to stay up to {MAX_STAY_DAYS} days.</>}
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
        {GUEST_LEGEND.map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: c, flexShrink: 0 }} />
            <span style={{ color: C.textS, fontSize: 12 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
