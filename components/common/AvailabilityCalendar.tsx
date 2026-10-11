"use client";

import { useState, useEffect, useMemo } from "react";
import { m } from "motion/react";
import { gold } from "@/lib/styles";
import { getBookingWindow, toDateStr, BOOKING_WINDOW_MONTHS, MAX_STAY_DAYS } from "@/lib/validators";
import type { Booking } from "@/types/booking";
import { checkBookingAvailability, holdsDate } from "@/lib/utils";

/** `ds` shifted by `n` days, in UTC so it cannot drift across a timezone. */
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
}

export function AvailabilityCalendar({
  bookings,
  closedDates = [],
  onSelectDate,
  selectedDate,
  endDate = "",
  onSelectRange,
}: AvailabilityCalendarProps) {
  /* Range mode is opt-in: the home page picks a stay, the admin's move
     window picks one new date. */
  const range = !!onSelectRange;
  /* True once a first day is down and the next click sets the last day. */
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState("");
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
    const dates = new Set(bookings.filter(holdsDate).map((b) => b.date));
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

  /* What the stay looks like right now, including the day being hovered
     while the last day is still being chosen. */
  const previewEnd = !range || !selectedDate
    ? selectedDate ?? ""
    : picking && hover && hover > selectedDate && rangeLimit && hover <= rangeLimit
      ? hover
      : endDate && endDate > selectedDate ? endDate : selectedDate;

  /** The last day currently COMMITTED — the hover preview does not count,
   *  or merely passing over a date would change what a click means. */
  const committedEnd = range && endDate && endDate > selectedDate! ? endDate : selectedDate;

  const pick = (ds: string) => {
    /* Clicking a date that is already part of the selection clears it.
       A tile that looks chosen should come unchosen when pressed again —
       otherwise the only way out of a wrong date is to pick another one,
       and there is no way back to "no date at all". */
    if (selectedDate && ds >= selectedDate && ds <= (committedEnd || selectedDate)) {
      setPicking(false);
      setHover("");
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
        // flex:1, not height:100%. The calendar is not the first child of its
        // column -- a header sits above it -- so a percentage height resolves
        // against the whole column and pushes the legend past the card's
        // clipped bottom edge. Taking the remaining height avoids that.
        flex: 1,
        minHeight: 0,
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

      {/* flex:1 hands the column's spare height to the week rows, so the
          month fills the card instead of leaving a void above the legend.
          gridAutoRows keeps 44px as the floor when there is no spare. */}
      <div className="gap-[3px] sm:gap-2" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "minmax(44px,1fr)", flex: 1, minHeight: 0 }}>
        {!mounted
          ? /* Placeholder keeps the panel the same height before mount. */
            Array.from({ length: 35 }).map((_, i) => (
              <div key={`ph${i}`} style={{ padding: "8px 4px", fontSize: 13.5, visibility: "hidden" }}>
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
          /* Out of reach of the stay being picked: too far ahead, or past a
             booked day the stay cannot jump. Still available in itself, so
             it is dimmed rather than painted as taken. */
          const beyondStay = !!rangeLimit && bookable && !!selectedDate && ds > rangeLimit && ds > selectedDate;
          const isStart = !!selectedDate && ds === selectedDate;
          const isEnd = !!previewEnd && previewEnd !== selectedDate && ds === previewEnd;
          const inRange = !!selectedDate && !!previewEnd && ds > selectedDate && ds < previewEnd;
          const isSel = isStart || isEnd;
          const disabled = isPast || isBeyond || isBooked || isClosed || beyondStay;
          /* The connecting line is drawn in segments, one per day of the
             stay, each scaling in a beat after the one before it so the
             stay appears to be drawn from its first day to its last. */
          const onLine = !!selectedDate && !!previewEnd && previewEnd !== selectedDate && ds >= selectedDate && ds <= previewEnd;
          const legIndex = onLine ? daysApart(selectedDate, ds) : 0;
          const weekday = dayDate.getDay();

          /* ── Available (default): green tint ──
             The tints were once 10–12% alpha. Over the hero PHOTO that
             composited to rgb(18,27,13) for available and rgb(23,13,12) for
             closed — 1.08:1 apart, so measured by pixel the four states were
             the same near-black rectangle and only the numeral's colour told
             them apart. The alpha is now high enough that the fill itself
             carries the state. Text contrast was never the problem here and
             is unchanged: available measured 11.18:1, booked 13.25:1 and
             closed 12.81:1 against their own tiles. */
          let bg  = "rgba(76,175,80,0.26)";
          // 4.85:1 on the scrim this calendar sits on. #6ec071 was 3.44:1.
          let col = "#9ade9a";
          let bdr = "1px solid rgba(118,205,122,0.5)";
          let cur: string = "pointer";

          // Unavailable states stay quiet: a neutral tile for past, out of
          // range and booked, and a red-tinted one for a closed date.
          /* Two different ideas, told two different ways.
             BOOKED is a STATE: somebody has that date, so it gets a solid
             grey chip you can read.
             PAST and OUT-OF-RANGE are not states, they are the absence of an
             option, so they keep the neutral tile and are dimmed by opacity
             instead. Painting both of them grey is what made them
             indistinguishable. */
          /* A past or out-of-range date measured 1.75:1 — a 0.38 opacity
             applied on top of ink that was already 55% alpha. WCAG exempts
             disabled controls, so it was not a violation, but a date nobody
             can read is not information either. The dimming now comes from
             ONE place (a higher opacity, below) with solid ink, so the date
             stays legible while still reading as unpressable. */
          let dim = false;
          if (isPast)   { bg = "rgba(255,255,255,0.05)"; col = "rgba(238,232,220,0.92)"; bdr = "1px solid rgba(255,255,255,0.08)"; cur = "default";     dim = true; }
          if (isBeyond) { bg = "rgba(255,255,255,0.05)"; col = "rgba(238,232,220,0.92)"; bdr = "1px solid rgba(255,255,255,0.08)"; cur = "not-allowed"; dim = true; }
          /* Booked started as near-white ink on a 42% white chip: 3.63:1, too
             low. Making the CHIP light fixed the number and broke the panel --
             two solid white blocks shouted louder than any available date, so
             the eye went straight to the dates you cannot have.
             The ink is what gets lightened instead. A quiet dark chip, like
             every other unavailable state, with near-white text on it. */
          if (isBooked) { bg = "rgba(255,255,255,0.20)"; col = "rgba(245,242,236,0.95)"; bdr = "1px solid rgba(255,255,255,0.34)"; cur = "not-allowed"; }
          /* A touch more chroma in both the fill and the ink, so a closed
             date reads as red rather than as "dark". #f5c9c9 was so pale it
             was carrying the whole signal on its own. */
          if (isClosed) { bg = "rgba(214,86,86,0.26)";    col = "#ffb4b4"; bdr = "1px solid rgba(224,110,110,0.55)"; cur = "not-allowed"; }
          // The selection is the same green, stated louder: solid fill, a
          // brighter rim and white text. Keeping it in the green family means
          // "available" and "the one you picked" read as one idea rather than
          // two unrelated colours.
          if (beyondStay) { cur = "not-allowed"; dim = true; }
          /* The stay is the same green stated louder: a band for the days
             between, solid tiles at the two ends. */
          if (inRange)  { bg = "rgba(76,175,80,0.28)";  col = "#dff5df";                bdr = "1px solid rgba(76,175,80,0.45)"; }
          if (isSel)    { bg = "#2b6b30";                col = "#ffffff";                bdr = "1px solid #5cb85c"; dim = false; }

          return (
            <button
              key={d}
              type="button"
              onClick={() => !disabled && pick(ds)}
              onMouseEnter={() => range && setHover(ds)}
              onFocus={() => range && setHover(ds)}
              disabled={disabled}
              aria-label={`${ds}${
                isStart && previewEnd !== selectedDate ? " — first day of your stay"
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
                  ? `Bookings open up to ${BOOKING_WINDOW_MONTHS} months ahead (to ${toDateStr(maxDate)})`
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
                position: "relative",
                textAlign: "center",
                padding: "8px 4px",
                borderRadius: 10,
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
                <m.span
                  aria-hidden
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], delay: legIndex * 0.07 }}
                  style={{
                    position: "absolute",
                    bottom: 6,
                    left: isStart ? "50%" : weekday === 0 ? 0 : -6,
                    right: ds === previewEnd ? "50%" : weekday === 6 ? 0 : -6,
                    height: 3,
                    borderRadius: 2,
                    background: "#7fd48a",
                    transformOrigin: "left center",
                    pointerEvents: "none",
                  }}
                />
              )}
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
          marginTop: 16,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* The swatches are the PURE hue of each state, not the pale ink
            the tiles print their numerals in. The tints are translucent, so
            a swatch matching them exactly came out as a pastel that read as
            "greyish" at 8px. Contrast was never the problem (these measured
            11.8-16.0:1 as pastels); naming the HUE on sight was. */}
        {[
          ["Available", "#3fbf52"],
          ["Booked",    "#b8b8b8"],
          ["Closed",    "#ff4d4d"],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: c, flexShrink: 0 }} />
            <span style={{ color: "rgba(238,232,220,0.78)", fontSize: 12 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
