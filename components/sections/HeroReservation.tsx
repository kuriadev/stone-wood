"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { gold, goldBtn } from "@/lib/styles";
import { fmt, fmtDate, SLOT_ICON } from "@/lib/utils";
import { daysInRange, stayLabel, checkRangeAvailability, isPoolOpen, peopleOnTour } from "@/lib/utils";
import { SLOTS, stayPatternNote, allowsMultiDay, MULTI_DAY_SLOT, slotStartedProblem } from "@/lib/resort";
import { useApp } from "@/contexts/AppContext";
import { priceBooking } from "@/lib/pricing";
import { childLimit, cappedHeadcount, CHILD_FREE_AGE } from "@/lib/children";
import {
  GUESTS_MIN, GUESTS_MAX, sharedRateFor, childRateFor, MAX_STAY_DAYS,
} from "@/lib/validators";
import { AvailabilityCalendar } from "@/components/common/AvailabilityCalendar";
import { GuestInput, useHoldStep } from "@/components/common/GuestCount";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type { Booking, BookingSlot, BookingTier } from "@/types/booking";

/**
 * The hero reservation card.
 *
 * The calendar used to be the whole interaction: picking a date navigated
 * straight to /book with nothing else decided. This adds the two choices a
 * guest always has to make anyway — which slot, how many people — so the
 * price shown is theirs rather than a generic "from", and /book opens with
 * all three already set.
 *
 * Sizes follow the HIG foundations rather than the old ad-hoc scale:
 *   - every control at least 44x44   (accessibility.md > Minimum sizes)
 *   - no text below 11px             (typography.md > Ensuring legibility)
 *   - the segmented control states the selection with a check as well as a
 *     fill, so it is not carried by colour alone (accessibility.md)
 */

const SLOT_ORDER: BookingSlot[] = ["Day", "Night", "WholeDay"];

/** The pool-access description, for one tier and one reservation type. */
const poolNote = (exclusive: boolean, _slotLabel: string): string =>
  exclusive
    ? `Just your group · flat price · up to ${GUESTS_MAX} guests`
    : `Shared with other groups · per guest · up to ${GUESTS_MAX} guests`;

const poolNoteStyle: CSSProperties = { fontSize: 13, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.72 * var(--hr-k, 1))))", margin: 0, lineHeight: 1.5 };

/** Every description the pool-access block can show, to hold its height. */
const POOL_SIZERS: string[] = SLOT_ORDER.flatMap((k) => [poolNote(true, SLOTS[k].label), poolNote(false, SLOTS[k].label)]);

/** Every line the reservation-type note can show. Rendered invisibly
 *  behind the real one to hold the space open, so switching type never
 *  changes the card's height. Keep in step with the note below. */
const SLOT_SIZERS: string[] = [
  stayPatternNote(MULTI_DAY_SLOT, MAX_STAY_DAYS) ?? "",
  `Choose your first day on the calendar, then your last day. You can stay up to ${MAX_STAY_DAYS} days in a row.`,
  ...SLOT_ORDER.filter((k) => !allowsMultiDay(k)).map(
    (k) => `A single date, ${SLOTS[k].hours}. Choose it on the calendar.`,
  ),
];

/** The stay note's type. Shared by the visible note and the invisible
 *  sizers behind it: if these drift apart the reserved height is wrong. */
const stayNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  lineHeight: 1.55,
  color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.62 * var(--hr-k, 1))))",
};

interface HeroReservationProps {
  bookings: Booking[];
  closedDates: string[];
  onBookWithDate: (date: string, opts?: { slot?: BookingSlot; guests?: number; children?: number; endDate?: string; tier?: BookingTier }) => void;
  onBrowseRooms: () => void;
  onManageBooking: () => void;
}

export function HeroReservation({
  bookings, closedDates, onBookWithDate, onBrowseRooms, onManageBooking,
}: HeroReservationProps) {
  const { isDark } = useTheme();
  const w = useWidth();
  const mob = w < 900;

  const [date, setDate] = useState("");
  /* Last day of the stay, picked on the calendar itself: click a first day,
     then a last one. Empty, or the same as the first, means a single day. */
  const [endDate, setEndDate] = useState("");
  const lastDay = endDate && endDate > date ? endDate : date;
  const stayDays = date ? Math.max(1, daysInRange(date, lastDay)) : 1;
  const [slot, setSlot] = useState<BookingSlot>("Day");
  // Adults and children under 3, as on Book Now (lib/children.ts): free
  // and uncounted in Exclusive, billed and counted like any guest in Shared.
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  // Children come on top of the adults (lib/children.ts).
  // Everyone already booked into that stay counts too.
  const onTour = date ? peopleOnTour(date, lastDay, slot, bookings) : 0;
  // Per tier: Shared children share the 30; Exclusive ones aren't counted.
  // Exclusive takes no count: children under 3 are free there.
  const kidsFor = (t: BookingTier) => (t === "Shared" ? Math.min(children, childLimit(adults, GUESTS_MAX, onTour, t)) : 0);

  /* Priced with the same function the booking page and the server use.
     This card used to do its own arithmetic — one slot's rate times the
     days — which ignored that a Whole Day is two slots, so a three-day
     Whole Day was advertised at well under what Book Now then charged. */
  const quote = (tier: "Shared" | "Exclusive") =>
    priceBooking({ resource: "Pool", tier, slot, guests: adults, children: kidsFor(tier), overtime: 0, roomPrices: [], days: stayDays }).total;
  const sharedTotal = quote("Shared");
  const exclusiveTotal = quote("Exclusive");
  /* Pool access. A Staycation is Exclusive only (lib/pricing.ts); a stay
     can be either, and the guest may choose. Until they do, the card
     SUGGESTS one: the cheaper of the two that fits the picked date.
     Exclusive needs its stay empty, so 30 guests on a Night with a Shared
     Night group already booked can only go Shared, even though Exclusive is
     cheaper. Picking the tier by price alone used to grey out every such
     date. */
  const [tierChoice, setTierChoice] = useState<BookingTier | null>(null);
  const allowed = useMemo<BookingTier[]>(() => (slot === "WholeDay" ? ["Exclusive"] : ["Shared", "Exclusive"]), [slot]);
  /* The pool under maintenance, and today's stay once it has started,
     close the card the same way Book Now and the server do. The calendar
     used to stay green through both and Book Now then said "closed". */
  const { facilities } = useApp();
  const poolClosed = !isPoolOpen(facilities);
  const fits = (t: BookingTier): { ok: boolean; reason?: string } => {
    if (poolClosed) return { ok: false, reason: "The pool is under maintenance, so it can't be booked right now. Please check back soon." };
    if (!date) return { ok: true };
    const started = slotStartedProblem(date, slot);
    if (started) return { ok: false, reason: started };
    return checkRangeAvailability(date, lastDay, slot, cappedHeadcount(adults, kidsFor(t), t), t, "Pool", bookings);
  };
  const fitting = allowed.filter((t) => fits(t).ok);
  const pool = fitting.length ? fitting : allowed;
  const suggested: BookingTier = pool.length === 1
    ? pool[0]
    : sharedTotal >= exclusiveTotal ? "Exclusive" : "Shared";
  const tier: BookingTier = slot === "WholeDay" ? "Exclusive" : (tierChoice ?? suggested);
  const goesExclusive = tier === "Exclusive";
  const kids = kidsFor(tier);
  const kidCap = childLimit(adults, GUESTS_MAX, onTour, tier);
  // Shared: adults and children share the guest limit.
  const adultCap = Math.max(GUESTS_MIN, GUESTS_MAX - (tier === "Shared" ? kids : 0));
  const guests = adults + kids;

  /* The calendar shows a date open when the chosen tier fits it, or when
     either does while the guest hasn't chosen. Same check as Book Now. */
  const tiers = useMemo<BookingTier[]>(
    () => (slot === "WholeDay" ? ["Exclusive"] : tierChoice ? [tierChoice] : ["Shared", "Exclusive"]),
    [slot, tierChoice],
  );
  const headcount = tier === "Shared" ? adults + kids : adults;
  const request = useMemo(() => ({ slot, guests: headcount, tiers }), [slot, headcount, tiers]);
  const tierFit = fits(tier);
  const dateOk = tierFit.ok;
  const dateProblem = dateOk ? null : tierFit;

  const prettyDate = date
    ? stayLabel({ date, endDate: lastDay })
    : "Choose a date";

  const rule = { height: 1, background: `rgba(201,168,76,${isDark ? "0.14" : "0.2"})` };
  const label = { fontSize: 12, letterSpacing: 2, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.6 * var(--hr-k, 1))))" };

  const counter = (o: { title: string; sub: string; value: number; min: number; max: number; onChange: (n: number) => void; noun: string; locked?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div>
        <p style={{ ...label, margin: "0 0 4px" }}>{o.title}</p>
        <p style={{ fontSize: 13, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.72 * var(--hr-k, 1))))", margin: 0 }}>{o.sub}</p>
      </div>
      <div
        role="group"
        aria-label={`Number of ${o.noun}`}
        style={{
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
          background: "rgba(var(--hr-tile, 255,255,255), 0.04)",
          border: `1px solid rgba(201,168,76,${isDark ? "0.18" : "0.26"})`,
          borderRadius: 999, padding: 4,
        }}
      >
        <Stepper label={`Fewer ${o.noun}`} glyph="−" disabled={o.locked || o.value <= o.min}
          step={() => o.onChange(Math.max(o.min, Math.min(o.value, o.max) - 1))} />
        <GuestInput value={o.value} onChange={o.onChange} min={o.min} max={o.max} label={`Number of ${o.noun}`} disabled={o.locked}
          style={{ width: 36, fontSize: 16, color: "var(--hr-strong, #fff)", fontWeight: 500 }} />
        <Stepper label={`More ${o.noun}`} glyph="+" disabled={o.locked || o.value >= o.max}
          step={() => o.onChange(Math.min(o.max, o.value + 1))} />
      </div>
    </div>
  );

  return (
    <div
      // Holds still: the owner asked for no floating on the booking card.
      className="hero-card"
      style={{
        position: "relative",
        zIndex: 3,
        marginTop: mob ? 28 : 36,
        width: "100%",
        maxWidth: 1060,
        /* Follows the theme (owner, 2026-11-22): dark glass in dark mode,
           warm cream in light mode. The inks inside read these variables
           (the calendar's too), so one switch here turns the whole card;
           elsewhere the calendar keeps its dark defaults. */
        ["--hr-ink" as string]: isDark ? "238,232,220" : "38,28,14",
        ["--hr-k" as string]: isDark ? "1" : "1.25",
        ["--hr-tile" as string]: isDark ? "255,255,255" : "120,90,40",
        ["--hr-strong" as string]: isDark ? "#fff" : "#1f160a",
        ["--hr-gold" as string]: isDark ? gold : "#8a6a1f",
        ["--hr-gold-strong" as string]: isDark ? "#e8c56a" : "#7a5a12",
        background: isDark ? "rgba(6,5,3,0.72)" : "rgba(255,251,243,0.94)",
        border: `1px solid rgba(201,168,76,${isDark ? "0.28" : "0.45"})`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 18,
        boxShadow: isDark ? "0 32px 80px rgba(0,0,0,0.55)" : "0 24px 60px rgba(70,48,12,0.18)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
          padding: mob ? "20px 20px 20px" : "24px 32px 24px",
          borderBottom: `1px solid rgba(201,168,76,${isDark ? "0.16" : "0.24"})`,
        }}
      >
        <div>
          <p style={{ ...label, color: "var(--hr-gold, #c9a84c)", fontWeight: 500, marginBottom: 8 }}>RESERVATIONS</p>
          <h2
            style={{
              fontFamily: "'Satoshi',system-ui,sans-serif",
              fontSize: mob ? 26 : 30, color: "var(--hr-strong, #fff)", fontWeight: 400, margin: 0, lineHeight: 1.1,
            }}
          >
            Find your perfect date
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4caf50", flexShrink: 0 }} />
          <span style={{ ...label, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.72 * var(--hr-k, 1))))" }}>LIVE AVAILABILITY</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: mob ? "column" : "row", alignItems: "stretch" }}>
        {/* Calendar */}
        <div
          style={{
            flex: mob ? "none" : "1 1 58%",
            padding: mob ? "20px 16px" : "24px 28px",
            borderRight: mob ? undefined : `1px solid rgba(201,168,76,${isDark ? "0.16" : "0.24"})`,
            borderBottom: mob ? `1px solid rgba(201,168,76,${isDark ? "0.16" : "0.24"})` : undefined,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* The calendar keeps one size; any height the reservation side
              adds beyond it is shared above and below, so nothing inside the
              month moves when the visit type changes. */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {/* How many people are already booked into the resort for the
              picked stay (every group, guests and children, lib/utils.ts
              peopleOnTour). It always has its own place above the calendar
              and asks for a date until one is picked, so the calendar never
              moves. It used to float in the gap above the calendar on a wide
              screen, and covered the heading when that gap was small. */}
          {(
            <div style={{ position: "relative" }}>
              <div
                key="card"
                role="status"
                aria-live="polite"
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 14,
                  background: "rgba(201,168,76,0.08)", border: `1px solid rgba(201,168,76,${isDark ? "0.22" : "0.32"})`,
                  marginBottom: 16,
                }}
              >
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(201,168,76,0.16)", color: "var(--hr-gold, #c9a84c)" }}>
                  <Icon name="users" size={18} strokeWidth={1.75} />
                </span>
                <span style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 28, lineHeight: 1, color: "var(--hr-strong, #fff)", fontWeight: 500, fontVariantNumeric: "tabular-nums", minWidth: 18 }}>{date ? onTour : "–"}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.9 * var(--hr-k, 1))))", fontWeight: 600 }}>Number of guests reserved</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.55 * var(--hr-k, 1))))", marginTop: 2 }}>
                    {!date ? "Pick a date to see it"
                      : <>{onTour === 0 ? "No one booked yet · " : ""}{SLOTS[slot].label} · {lastDay > date ? `${fmtDate(date)} – ${fmtDate(lastDay)}, busiest day` : fmtDate(date)}</>}
                  </span>
                </span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.88 * var(--hr-k, 1))))", margin: 0, fontWeight: 500 }}>
              Choose an available date
            </p>
            <p style={{ fontSize: 12, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.5 * var(--hr-k, 1))))", margin: 0 }}>
              Open dates are shown in green
            </p>
          </div>

          <AvailabilityCalendar
            bookings={bookings}
            closedDates={closedDates}
            selectedDate={date}
            endDate={endDate}
            onSelectDate={setDate}
            request={request}
            // Day and Night are single-date visits, so the calendar picks
            // one date for them; only a Staycation picks a range. The
            // calendar never changes the visit type, same as the booking page.
            onSelectRange={allowsMultiDay(slot) ? (from, to) => {
              setDate(from);
              setEndDate(to === from ? "" : to);
            } : undefined}
            /* Above the legend. Hidden, not removed, under Staycation, so the
               calendar keeps its height when the visit type changes. */
            aboveLegend={
            <p
              aria-hidden={allowsMultiDay(slot) || undefined}
              style={{ fontSize: 12.5, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.6 * var(--hr-k, 1))))", margin: "12px 0 0", textAlign: "center", visibility: allowsMultiDay(slot) ? "hidden" : "visible" }}
            >
              Staying more than one day?{" "}
              <button className="sw-ulink"
                type="button"
                tabIndex={allowsMultiDay(slot) ? -1 : undefined}
                onClick={() => setSlot(MULTI_DAY_SLOT)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--hr-gold, #c9a84c)", fontSize: 12.5 }}
              >
                Choose {SLOTS[MULTI_DAY_SLOT].label}
              </button>
            </p>
            }
          />
          </div>
        </div>

        {/* Your visit */}
        <div
          style={{
            flex: mob ? "none" : "1 1 42%",
            padding: mob ? "20px 20px 24px" : "24px 32px 28px",
            display: "flex", flexDirection: "column", gap: 20, minWidth: 0,
          }}
        >
          <p style={{ ...label, margin: 0 }}>YOUR RESERVATION</p>

          {/* Selected date */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${gold}18`, border: `1px solid ${gold}44`, color: "var(--hr-gold, #c9a84c)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon name="calendar" size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.6 * var(--hr-k, 1))))", margin: "0 0 4px" }}>
                {stayDays > 1 ? "Selected dates" : "Selected date"}
              </p>
              <p
                style={{
                  fontFamily: "'Satoshi',system-ui,sans-serif",
                  fontSize: stayDays > 1 ? 17 : 22, color: date ? "var(--hr-strong, #fff)" : "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.55 * var(--hr-k, 1))))",
                  margin: 0, lineHeight: 1.15, fontWeight: 400,
                }}
              >
                {prettyDate}
              </p>
            </div>
          </div>

          <div style={rule} />

          {/* Visit type */}
          <div>
            <p style={{ ...label, margin: "0 0 12px" }}>RESERVATION TYPE</p>
            <div
              role="radiogroup"
              aria-label="Reservation type"
              style={{
                display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4,
                background: "rgba(var(--hr-tile, 255,255,255), 0.04)",
                border: `1px solid rgba(201,168,76,${isDark ? "0.18" : "0.26"})`,
                borderRadius: 12, padding: 4,
              }}
            >
              {SLOT_ORDER.map((k) => {
                const on = slot === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setSlot(k);
                      // Dropping to a single-date slot drops the range too.
                      if (!allowsMultiDay(k)) setEndDate("");
                    }}
                    // 44px min height: accessibility.md > Minimum sizes.
                    style={{
                      minHeight: 44, borderRadius: 9, cursor: "pointer",
                      border: on ? `1px solid ${gold}55` : "1px solid transparent",
                      background: on ? `${gold}1f` : "transparent",
                      color: on ? "var(--hr-strong, #fff)" : "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.62 * var(--hr-k, 1))))",
                      padding: "10px 4px", textAlign: "center",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                    }}
                  >
                    {/* Icon, name, one word; the hours are in the line under
                        the tiles (2026-11-22: "not cluttered"). */}
                    <Icon name={SLOT_ICON[k]} size={22} style={{ color: on ? "var(--hr-gold, #c9a84c)" : "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.6 * var(--hr-k, 1))))" }} />
                    <span style={{ fontSize: 14.5, fontWeight: on ? 700 : 500, lineHeight: 1.15 }}>
                      {SLOTS[k].label}
                    </span>
                    <span style={{ fontSize: 12, color: on ? "var(--hr-gold, #c9a84c)" : "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.6 * var(--hr-k, 1))))", lineHeight: 1.15 }}>
                      {allowsMultiDay(k) ? `1–${MAX_STAY_DAYS} days` : k === "Day" ? "Daytime" : "Overnight"}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* What the chosen reservation type means, in one line.

                This block is ALWAYS here, for every type. It used to render
                only for a Staycation, so choosing one grew the card by 64px
                (826 -> 893) and the whole hero — photograph included —
                stretched under the guest's cursor. Reserving the space only
                within Staycation fixed the second date click but not the
                switch INTO it.

                Every type gets a line rather than the stays getting an
                empty 64px gap: the space has to be held open regardless, so
                it may as well say something. The hidden copies size the
                cell to the tallest line any type can produce, at any width;
                the real one is laid over them. */}
            <div style={{ display: "grid", margin: "10px 0 0" }}>
              {SLOT_SIZERS.map((text, i) => (
                <p key={i} aria-hidden style={{ ...stayNoteStyle, gridArea: "1 / 1", visibility: "hidden" }}>
                  {text}
                </p>
              ))}
              <p style={{ ...stayNoteStyle, gridArea: "1 / 1" }}>
                {!allowsMultiDay(slot)
                  ? `A single date, ${SLOTS[slot].hours}. Choose it on the calendar.`
                  : stayDays > 1
                    ? stayPatternNote(slot, stayDays)
                    : date
                      ? `Now choose your last day, up to ${MAX_STAY_DAYS} days in a row. Or keep just ${fmtDate(date)} for a one-day ${SLOTS[slot].label}.`
                      : `Choose your first day on the calendar, then your last day. You can stay up to ${MAX_STAY_DAYS} days in a row.`}
              </p>
            </div>
          </div>

          <div style={rule} />

          {/* Adults, then children under 3 */}
          {counter({
            title: "GUESTS",
            sub: `${fmt(sharedRateFor(slot))} per guest${slot === "WholeDay" ? ", Day and Night together" : ", per stay"}`,
            value: adults, min: GUESTS_MIN, max: adultCap, onChange: setAdults, noun: "guests",
          })}
          {counter({
            title: "CHILDREN",
            sub: goesExclusive
              ? `${CHILD_FREE_AGE} and below · free with a private pool`
              : `${CHILD_FREE_AGE} and below · ${fmt(childRateFor(slot))} each`,
            value: kids, min: 0, max: kidCap, onChange: setChildren, noun: "children", locked: goesExclusive,
          })}

          {/* Pool access, as on Book Now. A Staycation is never shared. */}
          <div>
            <p style={{ ...label, margin: "0 0 10px" }}>POOL ACCESS</p>
            {slot === "WholeDay" ? (
              /* The same 44px row the two stay buttons occupy. The pill on
                 its own is ~29px, so switching to a Staycation used to pull
                 everything below it up by the difference. */
              <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                <p style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0, padding: "7px 14px", borderRadius: 20, background: `${gold}22`, border: `1px solid ${gold}66`, color: "var(--hr-gold, #c9a84c)", fontSize: 14, fontWeight: 700 }}>
                  <Icon name="lock" size={14} /> Private pool · {SLOTS.WholeDay.label}
                </p>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Pool access" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
                {(["Shared", "Exclusive"] as const).map((opt) => {
                  const on = tier === opt;
                  const unavailable = !!date && !fits(opt).ok;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setTierChoice(opt)}
                      // Unavailable on the picked date: really disabled, not
                      // just dimmed, so a click can't pick it.
                      disabled={unavailable && !on}
                      title={unavailable ? fits(opt).reason : undefined}
                      style={{
                        minHeight: 44, borderRadius: 9,
                        border: `1px solid ${on ? gold : `rgba(201,168,76,${isDark ? "0.18" : "0.26"})`}`,
                        background: on ? `${gold}26` : "transparent",
                        color: on ? "var(--hr-gold, #c9a84c)" : "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.85 * var(--hr-k, 1))))",
                        opacity: unavailable && !on ? 0.4 : 1,
                        cursor: unavailable && !on ? "not-allowed" : "pointer",
                        fontSize: 14, fontWeight: 700, letterSpacing: 0.1,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "8px 8px",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon name={opt === "Exclusive" ? "lock" : "handshake"} size={15} />
                        {opt === "Exclusive" ? "Private pool" : "Shared pool"}
                      </span>
                      {(unavailable && !on) || (tierChoice === null && opt === suggested) ? (
                        <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>{unavailable && !on ? "Not available" : "Suggested"}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Held at the height of the longest description any type and
                tier can produce. The Exclusive text runs to three lines and
                the Shared one to two, which was the last 4px of movement
                when switching type — measured, after the 64px note above
                was already fixed. */}
            <div style={{ display: "grid", margin: "8px 0 0" }}>
              {POOL_SIZERS.map((text, i) => (
                <p key={i} aria-hidden style={{ ...poolNoteStyle, gridArea: "1 / 1", visibility: "hidden" }}>{text}</p>
              ))}
              <p style={{ ...poolNoteStyle, gridArea: "1 / 1" }}>{poolNote(goesExclusive, SLOTS[slot].label)}</p>
            </div>
          </div>

          <div style={rule} />

          {/* What it comes to */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ fontSize: 14, color: "var(--hr-strong, #fff)", margin: "0 0 4px", fontWeight: 500 }}>
                {goesExclusive ? "Private pool" : "Shared pool"}
              </p>
              <p style={{ fontSize: 12, color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.55 * var(--hr-k, 1))))", margin: 0 }}>
                {goesExclusive ? "Private resort access" : `${guests} guest${guests === 1 ? "" : "s"}, pool shared`}
                {stayDays > 1 ? ` · ${stayDays} days` : ""}
              </p>
            </div>
            <p
              style={{
                fontFamily: "'Satoshi',system-ui,sans-serif",
                fontSize: 24, color: "var(--hr-gold, #c9a84c)", margin: 0, whiteSpace: "nowrap", fontWeight: 400,
              }}
            >
              from {fmt(goesExclusive ? exclusiveTotal : sharedTotal)}
            </p>
          </div>

          {!dateOk && dateProblem?.reason && (
            <p role="status" style={{ fontSize: 12.5, color: "#e8a0a0", margin: "-8px 0 0", lineHeight: 1.5 }}>
              {dateProblem.reason}
              {poolClosed || (date && slotStartedProblem(date, slot)) ? "" : " Try another date, fewer guests or another reservation type."}
            </p>
          )}

          <Button
            onClick={() => onBookWithDate(date, { slot, guests: adults, children: kids, endDate: lastDay, tier })}
            disabled={!date || !dateOk}
            className="sw-btn h-auto w-full disabled:opacity-40"
            style={goldBtn}
          >
            BOOK THIS DATE <span aria-hidden="true">→</span>
          </Button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <Linkish onClick={onBrowseRooms}>Browse rooms</Linkish>
            <span aria-hidden="true" style={{ color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.25 * var(--hr-k, 1))))" }}>|</span>
            <Linkish onClick={onManageBooking}>Manage booking</Linkish>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  label, glyph, disabled, step,
}: { label: string; glyph: string; disabled: boolean; step: () => void }) {
  // Hold to keep counting (components/common/GuestCount.tsx).
  const hold = useHoldStep(step);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...hold}
      style={{
        touchAction: "manipulation",
        // 44x44, the HIG default control size.
        width: 44, height: 44, borderRadius: "50%",
        // Highlighted like Book Now's: gold circle and sign; grey at the limit.
        background: disabled ? "rgba(var(--hr-tile, 255,255,255), 0.04)" : "rgba(201,168,76,0.18)",
        border: `1px solid ${disabled ? "transparent" : "rgba(201,168,76,0.45)"}`,
        color: disabled ? "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.3 * var(--hr-k, 1))))" : "var(--hr-gold-strong, #e8c56a)",
        fontSize: 20, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .2s ease, color .2s ease",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {glyph}
    </button>
  );
}

function Linkish({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44, background: "none", border: "none", cursor: "pointer",
        color: "rgba(var(--hr-ink, 238,232,220), min(1, calc(0.72 * var(--hr-k, 1))))", fontSize: 13, padding: "0 4px",
      }}
    >
      <span className="sw-ulink">{children}</span>
    </button>
  );
}
