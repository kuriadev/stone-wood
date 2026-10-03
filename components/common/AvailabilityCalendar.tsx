"use client";

import { useState, useEffect, useMemo } from "react";
import { gold } from "@/lib/styles";
import { getBookingWindow, toDateStr, BOOKING_WINDOW_MONTHS } from "@/lib/validators";
import type { Booking } from "@/types/booking";
import { checkBookingAvailability, holdsDate } from "@/lib/utils";

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
            color: "#f5f1ea",
            fontSize: 19,
            fontWeight: 400,
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
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            style={{ textAlign: "center", fontSize: 12, color: "rgba(238,232,220,0.45)", padding: "2px 0 8px" }}
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
          let bg  = "rgba(76,175,80,0.12)";
          let col = "#6ec071";
          let bdr = "1px solid rgba(76,175,80,0.28)";
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
          let dim = false;
          if (isPast)   { bg = "rgba(255,255,255,0.04)"; col = "rgba(238,232,220,0.55)"; bdr = "1px solid rgba(255,255,255,0.06)"; cur = "default";     dim = true; }
          if (isBeyond) { bg = "rgba(255,255,255,0.04)"; col = "rgba(238,232,220,0.55)"; bdr = "1px solid rgba(255,255,255,0.06)"; cur = "not-allowed"; dim = true; }
          if (isBooked) { bg = "rgba(200,200,200,0.42)"; col = "rgba(244,244,244,0.92)"; bdr = "1px solid rgba(210,210,210,0.5)"; cur = "not-allowed"; }
          if (isClosed) { bg = "rgba(180,70,70,0.10)";   col = "rgba(214,138,138,0.75)"; bdr = "1px solid rgba(180,70,70,0.22)";  cur = "not-allowed"; }
          // The selection is the same green, stated louder: solid fill, a
          // brighter rim and white text. Keeping it in the green family means
          // "available" and "the one you picked" read as one idea rather than
          // two unrelated colours.
          if (isSel)    { bg = "#2b6b30";                col = "#ffffff";                bdr = "1px solid #5cb85c"; }

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
        {[
          ["Available", "#6ec071"],
          ["Booked",    "rgba(198,198,198,0.85)"],
          ["Closed",    "rgba(214,138,138,0.75)"],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: "rgba(238,232,220,0.5)", fontSize: 12 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
