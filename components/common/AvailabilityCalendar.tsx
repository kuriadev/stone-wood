"use client";

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { gold } from "@/lib/styles";
import { getBookingWindow, bookingWindowNote, toDateStr, MAX_STAY_DAYS, manilaNow } from "@/lib/validators";
import { slotStartedProblem } from "@/lib/resort";
import type { Booking, BookingSlot, BookingTier } from "@/types/booking";
import { checkBookingAvailability, holdsDate, bookingDates } from "@/lib/utils";
import { RangeConnector } from "@/components/common/RangeConnector";
import { CAL, CAL_LINE, GUEST_LEGEND } from "@/components/common/calendarColors";

/** `ds` shifted by `n` days, in UTC so it cannot drift across a timezone. */
/* Tallest a day tile gets. Tiles are square up to this, then widen
   rather than grow taller, so a wide column does not make a tall month. */
const TILE_MAX = 64;

const addDays = (ds: string, n: number) =>
  new Date(Date.parse(`${ds}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const daysApart = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

interface AvailabilityCalendarProps {
  bookings: Booking[];
  closedDates?: string[];
  onSelectDate: (ds: string) => void;
  selectedDate?: string;
  /** Last day of the stay. Only meaningful alongside `onSelectRange`. */
  endDate?: string;
  /** Supply this to turn the calendar into a RANGE picker: click a first
   *  day, then a last one. Without it the calendar stays single-date, which
   *  is what moving an existing booking needs (admin MoveBookingModal). */
  onSelectRange?: (from: string, to: string) => void;
  /** What is being booked, when the caller knows it (the home page card
   *  does). Dates are then judged for THIS visit type and group size, the
   *  same check the booking page's picker makes, so the two calendars
   *  agree. A date is open when ANY of `tiers` fits: the guest can still
   *  choose Shared or Exclusive on the next step. Without a request a date
   *  is shown taken once any slot is full. */
  request?: { slot: BookingSlot; guests: number; tiers: readonly BookingTier[] };
}

export function AvailabilityCalendar({
  bookings,
  closedDates = [],
  onSelectDate,
  selectedDate,
  endDate = "",
  onSelectRange,
  request,
}: AvailabilityCalendarProps) {
  /* Range mode is opt-in: the home page picks a stay, the admin's move
     window picks one new date. */
  const range = !!onSelectRange;
  /* True once a first day is down and the next click sets the last day. */
  const [picking, setPicking] = useState(false);
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
  // single extra Shared guest — an Exclusive buyout of that slot, or a slot
  // at capacity.
  //
  // This used to require EVERY slot to be full before greying a date, so a
  // date whose Day was sold out still rendered plain green and fully
  // clickable, indistinguishable from an empty one. The guest only found out
  // after picking it and reaching the booking form.
  //
  // That strict rule is only the fallback, for callers that don't pass a
  // `request`. With one, a date is judged for the slot, tier and headcount
  // actually being booked, exactly as the booking page's picker does. The
  // home page card used to check for a single Shared guest only, so a date
  // too full for the group showed green there and taken on Book Now.
  const bookedDates = useMemo(() => {
    // Every day a stay covers, not only its first: day two of someone's
    // three-day stay is just as taken.
    const dates = new Set(bookings.filter(holdsDate).flatMap((b) => bookingDates(b)));
    const full = new Set<string>();
    dates.forEach((d) => {
      const taken = request
        ? !request.tiers.some((t) => checkBookingAvailability(d, request.slot, request.guests, t, "Pool", bookings).ok)
        : (["Day", "Night"] as const).some(
            (sl) => !checkBookingAvailability(d, sl, 1, "Shared", "Pool", bookings).ok
          );
      if (taken) full.add(d);
    });
    // Today, once the requested tour has started, can't be booked online.
    const today = manilaNow().date;
    if (request && slotStartedProblem(today, request.slot)) full.add(today);
    return full;
  }, [bookings, request]);
  const closedSet = useMemo(() => new Set(closedDates), [closedDates]);

  /* The furthest day this stay may reach: MAX_STAY_DAYS long at most, and
     stopping short of the first booked or closed day, so a range can never
     straddle one. Null when no stay is being picked. */
  const maxStr = toDateStr(maxDate);
  const rangeLimit = useMemo(() => {
    if (!range || !picking || !selectedDate) return null;
    let last = selectedDate;
    for (let i = 1; i < MAX_STAY_DAYS; i++) {
      const next = addDays(selectedDate, i);
      if (next > maxStr) break;
      if (bookedDates.has(next) || closedSet.has(next)) break;
      last = next;
    }
    return last;
  }, [range, picking, selectedDate, bookedDates, closedSet, maxStr]);

  /* The last day of the stay as it stands.
   *
   * There is no hover preview any more. Passing the pointer over a date
   * used to extend the stay to it, which meant the calendar changed under
   * a guest who was only reading it, a stay could be "picked" by a stray
   * sweep of the mouse on the way to somewhere else, and a touch screen
   * — which has no hover — got a different calendar from a desktop. Both
   * ends are clicked now: first day, then last. */
  const stayEnd = !range || !selectedDate
    ? selectedDate ?? ""
    : endDate && endDate > selectedDate ? endDate : selectedDate;

  const pick = (ds: string) => {
    /* Clicking a date that is already part of the selection clears it.
       A tile that looks chosen should come unchosen when pressed again —
       otherwise the only way out of a wrong date is to pick another one,
       and there is no way back to "no date at all". */
    if (selectedDate && ds >= selectedDate && ds <= (stayEnd || selectedDate)) {
      setPicking(false);
      if (range && onSelectRange) onSelectRange("", "");
      else onSelectDate("");
      return;
    }
    if (!range || !onSelectRange) { onSelectDate(ds); return; }
    // Starting again: no stay in progress, or a day before the first one.
    if (!picking || !selectedDate || ds < selectedDate) {
      onSelectRange(ds, ds);
      setPicking(true);
      return;
    }
    onSelectRange(selectedDate, ds);
    setPicking(false);
  };

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
    background: enabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
    border: "none",
    color: enabled ? "rgba(238,232,220,0.85)" : "rgba(238,232,220,0.38)",
    cursor: enabled ? "pointer" : "not-allowed",
    // Round, to read as part of the card's own language rather than as a
    // boxed widget dropped into it.
    borderRadius: "50%",
    // 44x44: the HIG default control size (accessibility.md > Minimum sizes).
    // These were 28x28, which is Apple's absolute floor, not its target.
    width: 44,
    height: 44,
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: enabled ? 1 : 0.4,
  });

  // The one shape every cell shares, filler cells included, so a row
  // is the same height whatever is in it.
  const tileBox: CSSProperties = { aspectRatio: "1 / 1", maxHeight: TILE_MAX, minHeight: 40, width: "100%" };

  return (
    <div
      style={{
        // No background, border or shadow of its own. The calendar sits
        // inside the hero reservation card, and painting a second panel on
        // top of that one is what made it read as a widget pasted in from
        // somewhere else.
        background: "transparent",
        border: "none",
        padding: 0,
        // Width is the layout's business, not the calendar's. This used to
        // clamp itself to a 300-360px band while also declaring width:100%,
        // so it could not use the column Home's hero card gives it: 360px
        // inside a 548px column left 94px dead on each side at every desktop
        // width, and the 300px floor made it overflow its own column by 3px
        // at 390px — the "prevents calendar from shrinking" comment was
        // describing exactly what stopped it being responsive.
        // BookingDatePicker, the calendar for this same task on /book, has
        // never carried a clamp; this now matches it.
        width: "100%",
        // Natural height only. The calendar used to take whatever height its
        // column had (flex:1) and hand it to the week rows, so the day tiles
        // grew and shrank whenever anything beside it changed height --
        // picking Staycation stretched every date. Its height now depends on
        // its width alone, and the column decides where to put the spare.
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
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
            color: "#f5f1ea",
            fontSize: 19,
            fontWeight: 400,
            fontFamily: "'Satoshi',system-ui,sans-serif",
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
          gap: 4,
          marginBottom: 4,
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            style={{ textAlign: "center", fontSize: 12, color: "rgba(238,232,220,0.45)", padding: "4px 0 8px" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Every tile is the same shape, set by the column's width (square,
          capped at TILE_MAX tall), and the month always takes six weeks, so
          the grid never changes height: not between visit types, not
          before mount, not between a 5-week and a 6-week month. */}
      <div className="gap-[3px] sm:gap-2" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {!mounted
          ? Array.from({ length: 42 }).map((_, i) => <div key={`ph${i}`} aria-hidden style={tileBox} />)
          : (
            <>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} aria-hidden style={tileBox} />
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
          /* Out of reach of the stay being picked: too far ahead, or past a
             booked day the stay cannot jump. Still available in itself, so
             it is dimmed rather than painted as taken. */
          const beyondStay = !!rangeLimit && bookable && !!selectedDate && ds > rangeLimit && ds > selectedDate;
          const isStart = !!selectedDate && ds === selectedDate;
          const isEnd = !!stayEnd && stayEnd !== selectedDate && ds === stayEnd;
          const inRange = !!selectedDate && !!stayEnd && ds > selectedDate && ds < stayEnd;
          const isSel = isStart || isEnd;
          const disabled = isPast || isBeyond || isBooked || isClosed || beyondStay;
          /* The connecting line is drawn in segments, one per day of the
             stay, each scaling in a beat after the one before it so the
             stay appears to be drawn from its first day to its last. */
          const onLine = !!selectedDate && !!stayEnd && stayEnd !== selectedDate && ds >= selectedDate && ds <= stayEnd;
          const legIndex = onLine ? daysApart(selectedDate, ds) : 0;
          const weekday = dayDate.getDay();

          /* Solid fills from the shared palette (calendarColors.ts): the
             state reads from the tile itself, not only from its numeral.
             Past and out-of-range dates are not states, just no option, so
             they keep a neutral tile and are dimmed instead. */
          let bg: string = CAL.available.bg;
          let col: string = CAL.available.ink;
          let bdr = `1px solid ${CAL.available.rim}`;
          let cur: string = "pointer";
          let dim = false;
          if (isPast)   { bg = "rgba(255,255,255,0.05)"; col = "rgba(238,232,220,0.92)"; bdr = "1px solid rgba(255,255,255,0.08)"; cur = "default";     dim = true; }
          if (isBeyond) { bg = "rgba(255,255,255,0.05)"; col = "rgba(238,232,220,0.92)"; bdr = "1px solid rgba(255,255,255,0.08)"; cur = "not-allowed"; dim = true; }
          if (isBooked) { bg = CAL.booked.bg; col = CAL.booked.ink; bdr = `1px solid ${CAL.booked.rim}`; cur = "not-allowed"; }
          if (isClosed) { bg = CAL.closed.bg; col = CAL.closed.ink; bdr = `1px solid ${CAL.closed.rim}`; cur = "not-allowed"; }
          if (beyondStay) { cur = "not-allowed"; dim = true; }
          // Every day of the stay the guest picked is gold, first to last.
          if (inRange || isSel) { bg = CAL.selected.bg; col = CAL.selected.ink; bdr = `1px solid ${CAL.selected.rim}`; dim = false; }

          return (
            <button
              key={d}
              type="button"
              onClick={() => !disabled && pick(ds)}
              disabled={disabled}
              aria-label={`${ds}${
                isStart && stayEnd !== selectedDate ? " — first day of your stay"
                : isEnd ? " — last day of your stay"
                : inRange ? " — part of your stay"
                : isBooked ? " — booked"
                : isClosed ? " — closed"
                : isPast || isBeyond ? " — unavailable"
                : beyondStay ? ` — too far for one stay (up to ${MAX_STAY_DAYS} days)`
                : " — available"}`}
              aria-pressed={isSel || inRange}
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
                  : range && picking
                  ? "Click to make this your last day"
                  : "Available"
              }
              style={{
                ...tileBox,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                borderRadius: 12,
                // Dimming the whole cell, rather than just muting its ink, is
                // what makes a past date read as "not a thing you can press".
                opacity: dim ? 0.62 : 1,
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
              {/* ── The line that joins the first day to the last ──
                  One segment per day, bleeding 6px past the tile on each
                  side to cross the grid gap, and clipped at the week's
                  edges so it never runs off the calendar. Each segment
                  scales out from its left edge a beat after the one before,
                  which is what makes the stay look drawn rather than
                  switched on. transform only: no layout, no repaint storm,
                  and MotionConfig's reducedMotion="user" turns it into an
                  instant state for anyone who asks for that. */}
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
              {Array.from({ length: Math.max(0, 42 - firstDay - daysInMonth) }).map((_, i) => (
                <div key={`t${i}`} aria-hidden style={tileBox} />
              ))}
            </>
          )}
      </div>

      {/* Legend — centered together */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 16,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {GUEST_LEGEND.map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: c, flexShrink: 0 }} />
            <span style={{ color: "rgba(238,232,220,0.78)", fontSize: 12 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
