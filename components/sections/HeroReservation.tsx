"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { fmt, fmtDate } from "@/lib/utils";
import { daysInRange, stayLabel, checkRangeAvailability, isPoolOpen } from "@/lib/utils";
import { SLOTS, stayPatternNote, allowsMultiDay, MULTI_DAY_SLOT, slotStartedProblem } from "@/lib/resort";
import { useApp } from "@/contexts/AppContext";
import { priceBooking } from "@/lib/pricing";
import {
  GUESTS_MIN, GUESTS_MAX, SHARED_PER_HEAD_RATE, MAX_STAY_DAYS,
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
const poolNote = (exclusive: boolean, slotLabel: string): string =>
  exclusive
    ? `The pool and resort are your group's alone for your ${slotLabel} — no other group, up to ${GUESTS_MAX} guests. The events venue isn't included and another group may rent it; you can add it.`
    : `Pool shared with other groups in your ${slotLabel} — billed per guest, up to ${GUESTS_MAX} guests in total.`;

const poolNoteStyle: CSSProperties = { fontSize: 12, color: "rgba(238,232,220,0.5)", margin: 0, lineHeight: 1.5 };

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
  color: "rgba(238,232,220,0.62)",
};

interface HeroReservationProps {
  bookings: Booking[];
  closedDates: string[];
  onBookWithDate: (date: string, opts?: { slot?: BookingSlot; guests?: number; endDate?: string; tier?: BookingTier }) => void;
  onBrowseRooms: () => void;
  onManageBooking: () => void;
}

export function HeroReservation({
  bookings, closedDates, onBookWithDate, onBrowseRooms, onManageBooking,
}: HeroReservationProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 900;

  const [date, setDate] = useState("");
  /* Last day of the stay, picked on the calendar itself: click a first day,
     then a last one. Empty, or the same as the first, means a single day. */
  const [endDate, setEndDate] = useState("");
  const lastDay = endDate && endDate > date ? endDate : date;
  const stayDays = date ? Math.max(1, daysInRange(date, lastDay)) : 1;
  const [slot, setSlot] = useState<BookingSlot>("Day");
  const [guests, setGuests] = useState(2);

  /* Priced with the same function the booking page and the server use.
     This card used to do its own arithmetic — one slot's rate times the
     days — which ignored that a Whole Day is two slots, so a three-day
     Whole Day was advertised at well under what Book Now then charged. */
  const quote = (tier: "Shared" | "Exclusive") =>
    priceBooking({ resource: "Pool", tier, slot, guests, overtime: 0, roomPrices: [], days: stayDays }).total;
  const sharedTotal = quote("Shared");
  const exclusiveTotal = quote("Exclusive");
  /* Pool access. A Staycation is Exclusive only (lib/pricing.ts); a tour
     can be either, and the guest may choose. Until they do, the card
     SUGGESTS one: the cheaper of the two that fits the picked date.
     Exclusive needs its tour empty, so 30 guests on a Night with a Shared
     Night group already booked can only go Shared, even though Exclusive is
     cheaper. Picking the tier by price alone used to grey out every such
     date. */
  const [tierChoice, setTierChoice] = useState<BookingTier | null>(null);
  const allowed = useMemo<BookingTier[]>(() => (slot === "WholeDay" ? ["Exclusive"] : ["Shared", "Exclusive"]), [slot]);
  /* The pool under maintenance, and today's tour once it has started,
     close the card the same way Book Now and the server do. The calendar
     used to stay green through both and Book Now then said "closed". */
  const { facilities } = useApp();
  const poolClosed = !isPoolOpen(facilities);
  const fits = (t: BookingTier): { ok: boolean; reason?: string } => {
    if (poolClosed) return { ok: false, reason: "The pool is under maintenance, so it can't be booked right now. Please check back soon." };
    if (!date) return { ok: true };
    const started = slotStartedProblem(date, slot);
    if (started) return { ok: false, reason: started };
    return checkRangeAvailability(date, lastDay, slot, guests, t, "Pool", bookings);
  };
  const fitting = allowed.filter((t) => fits(t).ok);
  const pool = fitting.length ? fitting : allowed;
  const suggested: BookingTier = pool.length === 1
    ? pool[0]
    : sharedTotal >= exclusiveTotal ? "Exclusive" : "Shared";
  const tier: BookingTier = slot === "WholeDay" ? "Exclusive" : (tierChoice ?? suggested);
  const goesExclusive = tier === "Exclusive";

  /* The calendar shows a date open when the chosen tier fits it, or when
     either does while the guest hasn't chosen. Same check as Book Now. */
  const tiers = useMemo<BookingTier[]>(
    () => (slot === "WholeDay" ? ["Exclusive"] : tierChoice ? [tierChoice] : ["Shared", "Exclusive"]),
    [slot, tierChoice],
  );
  const request = useMemo(() => ({ slot, guests, tiers }), [slot, guests, tiers]);
  const tierFit = fits(tier);
  const dateOk = tierFit.ok;
  const dateProblem = dateOk ? null : tierFit;

  const prettyDate = date
    ? stayLabel({ date, endDate: lastDay })
    : "Choose a date";

  const rule = { height: 1, background: `rgba(201,168,76,${isDark ? "0.14" : "0.2"})` };
  const label = { fontSize: 11, letterSpacing: 2.5, color: "rgba(238,232,220,0.6)" };

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
        /* Dark in BOTH themes. Everything inside therefore uses fixed light
           inks and the SURFACE gold -- never C.goldInk, which follows the
           theme and turns dark olive here in light mode. Same rule as the
           footer and the gallery lightbox. */
        background: isDark ? "rgba(6,5,3,0.72)" : "rgba(10,7,3,0.72)",
        border: `1px solid rgba(201,168,76,${isDark ? "0.28" : "0.4"})`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 18,
        boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
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
          <p style={{ ...label, color: gold, fontWeight: 500, marginBottom: 8 }}>RESERVATIONS</p>
          <h2
            style={{
              fontFamily: "'Satoshi',system-ui,sans-serif",
              fontSize: mob ? 26 : 30, color: "#fff", fontWeight: 400, margin: 0, lineHeight: 1.1,
            }}
          >
            Find your perfect date
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4caf50", flexShrink: 0 }} />
          <span style={{ ...label, color: "rgba(238,232,220,0.72)" }}>LIVE AVAILABILITY</span>
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
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: "rgba(238,232,220,0.88)", margin: 0, fontWeight: 500 }}>
              Choose an available date
            </p>
            <p style={{ fontSize: 12, color: "rgba(238,232,220,0.5)", margin: 0 }}>
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
          />
          {/* Hidden, not removed, under Staycation: the line keeps its room so
              the calendar above it does not shift when the visit type changes.
              (The reservation side already explains how to pick a stay.) */}
          <p
            aria-hidden={allowsMultiDay(slot) || undefined}
            style={{ fontSize: 12.5, color: "rgba(238,232,220,0.6)", margin: "12px 0 0", textAlign: "center", visibility: allowsMultiDay(slot) ? "hidden" : "visible" }}
          >
            Staying more than one day?{" "}
            <button
              type="button"
              tabIndex={allowsMultiDay(slot) ? -1 : undefined}
              onClick={() => setSlot(MULTI_DAY_SLOT)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: gold, fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              Choose {SLOTS[MULTI_DAY_SLOT].label}
            </button>
          </p>
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
                background: `${gold}18`, border: `1px solid ${gold}44`, color: gold,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon name="calendar" size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, color: "rgba(238,232,220,0.6)", margin: "0 0 4px" }}>
                {stayDays > 1 ? "Selected dates" : "Selected date"}
              </p>
              <p
                style={{
                  fontFamily: "'Satoshi',system-ui,sans-serif",
                  fontSize: stayDays > 1 ? 17 : 22, color: date ? "#fff" : "rgba(238,232,220,0.55)",
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
                background: "rgba(255,255,255,0.04)",
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
                      color: on ? "#fff" : "rgba(238,232,220,0.62)",
                      padding: "8px 4px", textAlign: "center",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: on ? 600 : 400, lineHeight: 1.1 }}>
                      {SLOTS[k].label}
                    </span>
                    <span style={{ fontSize: 11, color: on ? gold : "rgba(238,232,220,0.45)", lineHeight: 1.1 }}>
                      {SLOTS[k].hours}
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

                Every type gets a line rather than the tours getting an
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

          {/* Guests */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ ...label, margin: "0 0 4px" }}>GUESTS</p>
              <p style={{ fontSize: 12, color: "rgba(238,232,220,0.55)", margin: 0 }}>
                {slot === "WholeDay" ? "Flat rate, however many come" : `${fmt(SHARED_PER_HEAD_RATE)} per guest, per tour`}
              </p>
            </div>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid rgba(201,168,76,${isDark ? "0.18" : "0.26"})`,
                borderRadius: 999, padding: 4,
              }}
            >
              <Stepper
                label="Fewer guests"
                glyph="−"
                disabled={guests <= GUESTS_MIN}
                step={() => setGuests((g) => Math.max(GUESTS_MIN, g - 1))}
              />
              <GuestInput
                value={guests}
                onChange={setGuests}
                min={GUESTS_MIN}
                max={GUESTS_MAX}
                style={{ width: 36, fontSize: 16, color: "#fff", fontWeight: 500 }}
              />
              <Stepper
                label="More guests"
                glyph="+"
                disabled={guests >= GUESTS_MAX}
                step={() => setGuests((g) => Math.min(GUESTS_MAX, g + 1))}
              />
            </div>
          </div>

          {/* Pool access, as on Book Now. A Staycation is never shared. */}
          <div>
            <p style={{ ...label, margin: "0 0 10px" }}>POOL ACCESS</p>
            {slot === "WholeDay" ? (
              /* The same 44px row the two tour buttons occupy. The pill on
                 its own is ~29px, so switching to a Staycation used to pull
                 everything below it up by the difference. */
              <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                <p style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0, padding: "6px 12px", borderRadius: 20, background: `${gold}22`, border: `1px solid ${gold}66`, color: gold, fontSize: 11.5, fontWeight: 700, letterSpacing: 1 }}>
                  <Icon name="lock" size={12} /> EXCLUSIVE — {SLOTS.WholeDay.label.toUpperCase()}
                </p>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Pool access" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                        color: on ? gold : "rgba(238,232,220,0.85)",
                        opacity: unavailable && !on ? 0.4 : 1,
                        cursor: unavailable && !on ? "not-allowed" : "pointer",
                        fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px",
                      }}
                    >
                      <Icon name={opt === "Exclusive" ? "lock" : "handshake"} size={12} />
                      {opt.toUpperCase()}{unavailable && !on ? " · NOT THIS DATE" : tierChoice === null && opt === suggested ? " (SUGGESTED)" : ""}
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
              <p style={{ fontSize: 14, color: "#fff", margin: "0 0 4px", fontWeight: 500 }}>
                {goesExclusive ? "Exclusive use" : "Shared pool"}
              </p>
              <p style={{ fontSize: 12, color: "rgba(238,232,220,0.55)", margin: 0 }}>
                {goesExclusive ? "Private resort access" : `${guests} guest${guests === 1 ? "" : "s"}, pool shared`}
                {stayDays > 1 ? ` · ${stayDays} days` : ""}
              </p>
            </div>
            <p
              style={{
                fontFamily: "'Satoshi',system-ui,sans-serif",
                fontSize: 24, color: gold, margin: 0, whiteSpace: "nowrap", fontWeight: 400,
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
            onClick={() => onBookWithDate(date, { slot, guests, endDate: lastDay, tier })}
            disabled={!date || !dateOk}
            className="sw-btn h-auto w-full disabled:opacity-40"
            style={goldBtn}
          >
            BOOK THIS DATE <span aria-hidden="true">→</span>
          </Button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <Linkish onClick={onBrowseRooms}>Browse rooms</Linkish>
            <span aria-hidden="true" style={{ color: "rgba(238,232,220,0.25)" }}>|</span>
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
        background: "rgba(255,255,255,0.05)", border: "none",
        color: disabled ? "rgba(238,232,220,0.3)" : "#fff",
        fontSize: 19, cursor: disabled ? "not-allowed" : "pointer",
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
        color: "rgba(238,232,220,0.72)", fontSize: 13, padding: "0 4px",
      }}
    >
      {children}
    </button>
  );
}
