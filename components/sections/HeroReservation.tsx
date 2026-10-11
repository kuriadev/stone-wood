"use client";

import { useState, type CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import { daysInRange, stayLabel } from "@/lib/utils";
import { SLOTS, stayPatternNote, allowsMultiDay, MULTI_DAY_SLOT } from "@/lib/resort";
import { priceBooking } from "@/lib/pricing";
import {
  GUESTS_MIN, GUESTS_MAX, SHARED_PER_HEAD_RATE, MAX_STAY_DAYS,
} from "@/lib/validators";
import { AvailabilityCalendar } from "@/components/common/AvailabilityCalendar";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type { Booking, BookingSlot } from "@/types/booking";

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
  onBookWithDate: (date: string, opts?: { slot?: BookingSlot; guests?: number; endDate?: string }) => void;
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
     days — which ignored that a Whole Day is two slots and that days after
     the first are discounted, so a three-day Whole Day was advertised at
     well under what Book Now then charged. */
  const quote = (tier: "Shared" | "Exclusive") =>
    priceBooking({ resource: "Pool", tier, slot, guests, overtime: 0, roomPrices: [], days: stayDays }).total;
  const sharedTotal = quote("Shared");
  const exclusiveTotal = quote("Exclusive");
  // Show whichever the guest count actually lands on, so the number moves
  // as they change it rather than staying a decorative "from".
  const goesExclusive = sharedTotal >= exclusiveTotal;

  const prettyDate = date
    ? stayLabel({ date, endDate: lastDay })
    : "Choose a date";

  const rule = { height: 1, background: `rgba(201,168,76,${isDark ? "0.14" : "0.2"})` };
  const label = { fontSize: 11, letterSpacing: 2.5, color: "rgba(238,232,220,0.6)" };

  return (
    <div
      className="hero-card sw-hero-card-float"
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
            onSelectRange={(from, to) => {
              setDate(from);
              const range = to === from ? "" : to;
              setEndDate(range);
              // Day and Night are single-date visits; a second date moves
              // the booking to the Whole Day, as it does on the booking page.
              if (range && !allowsMultiDay(slot)) setSlot(MULTI_DAY_SLOT);
            }}
          />
        </div>

        {/* Your visit */}
        <div
          style={{
            flex: mob ? "none" : "1 1 42%",
            padding: mob ? "20px 20px 24px" : "24px 32px 28px",
            display: "flex", flexDirection: "column", gap: 20, minWidth: 0,
          }}
        >
          <p style={{ ...label, margin: 0 }}>YOUR VISIT</p>

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
            <p style={{ ...label, margin: "0 0 12px" }}>VISIT TYPE</p>
            <div
              role="radiogroup"
              aria-label="Visit type"
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
            {/* What the chosen slot means over several days.

                The space is RESERVED whether or not there is a note to put
                in it. This note is three or four lines long and used to
                appear only on the second click, which grew the card by
                ~62px; the calendar column is flex:1, so it took that height
                and handed it to the week rows, and every date tile visibly
                stretched (67px to 80px) under the guest's cursor mid-pick.

                All three slots' notes are stacked in one grid cell: every
                child occupies the same cell, so the cell is as tall as the
                tallest of them at whatever width the card happens to be,
                and the real note is laid over the hidden ones. Measuring it
                this way rather than guessing a pixel height is what makes
                it hold up when the text or the breakpoint changes. */}
            <div style={{ display: "grid", margin: "10px 0 0" }}>
              {SLOT_ORDER.map((k) => (
                <p
                  key={k}
                  aria-hidden
                  style={{ ...stayNoteStyle, gridArea: "1 / 1", visibility: "hidden" }}
                >
                  {stayPatternNote(k, MAX_STAY_DAYS)}
                </p>
              ))}
              <p style={{ ...stayNoteStyle, gridArea: "1 / 1" }}>
                {stayDays > 1 ? stayPatternNote(slot, stayDays) : ""}
              </p>
            </div>
          </div>

          <div style={rule} />

          {/* Guests */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ ...label, margin: "0 0 4px" }}>GUESTS</p>
              <p style={{ fontSize: 12, color: "rgba(238,232,220,0.55)", margin: 0 }}>
                {fmt(SHARED_PER_HEAD_RATE)} per guest, per slot
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
                onClick={() => setGuests((g) => Math.max(GUESTS_MIN, g - 1))}
              />
              <span
                aria-live="polite"
                style={{ minWidth: 36, textAlign: "center", fontSize: 16, color: "#fff", fontWeight: 500 }}
              >
                {guests}
              </span>
              <Stepper
                label="More guests"
                glyph="+"
                disabled={guests >= GUESTS_MAX}
                onClick={() => setGuests((g) => Math.min(GUESTS_MAX, g + 1))}
              />
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

          <Button
            onClick={() => onBookWithDate(date, { slot, guests, endDate: lastDay })}
            disabled={!date}
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
  label, glyph, disabled, onClick,
}: { label: string; glyph: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
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
