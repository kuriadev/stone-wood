"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import { dayjs, DATE_FMT } from "@/lib/dayjs";
import { SLOTS } from "@/lib/resort";
import {
  GUESTS_MIN, GUESTS_MAX, SHARED_PER_HEAD_RATE,
  EXCLUSIVE_FLAT_RATE, EXCLUSIVE_DISCOUNT_PCT,
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

interface HeroReservationProps {
  bookings: Booking[];
  closedDates: string[];
  onBookWithDate: (date: string, opts?: { slot?: BookingSlot; guests?: number }) => void;
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
  const [slot, setSlot] = useState<BookingSlot>("Day");
  const [guests, setGuests] = useState(2);

  // Shared is per head; exclusive is a flat rate with its own discount. The
  // card shows whichever the guest count actually lands on, so the number
  // moves as they change it rather than staying a decorative "from".
  const sharedTotal = guests * SHARED_PER_HEAD_RATE;
  const exclusiveTotal = Math.round(EXCLUSIVE_FLAT_RATE * (1 - EXCLUSIVE_DISCOUNT_PCT));
  const goesExclusive = sharedTotal >= exclusiveTotal;

  const prettyDate = date
    ? dayjs(date, DATE_FMT, true).format("MMMM D, YYYY")
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
          <p style={{ ...label, color: C.goldInk, fontWeight: 500, marginBottom: 8 }}>RESERVATIONS</p>
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
            onSelectDate={setDate}
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
                background: `${gold}18`, border: `1px solid ${gold}44`, color: C.goldInk,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon name="calendar" size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, color: "rgba(238,232,220,0.6)", margin: "0 0 4px" }}>Selected date</p>
              <p
                style={{
                  fontFamily: "'Satoshi',system-ui,sans-serif",
                  fontSize: 22, color: date ? "#fff" : "rgba(238,232,220,0.55)",
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
                    onClick={() => setSlot(k)}
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
                    <span style={{ fontSize: 11, color: on ? C.goldInk : "rgba(238,232,220,0.45)", lineHeight: 1.1 }}>
                      {SLOTS[k].hours}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={rule} />

          {/* Guests */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ ...label, margin: "0 0 4px" }}>GUESTS</p>
              <p style={{ fontSize: 12, color: "rgba(238,232,220,0.55)", margin: 0 }}>
                {fmt(SHARED_PER_HEAD_RATE)} per guest
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
              </p>
            </div>
            <p
              style={{
                fontFamily: "'Satoshi',system-ui,sans-serif",
                fontSize: 24, color: C.goldInk, margin: 0, whiteSpace: "nowrap", fontWeight: 400,
              }}
            >
              from {fmt(goesExclusive ? exclusiveTotal : sharedTotal)}
            </p>
          </div>

          <Button
            onClick={() => onBookWithDate(date, { slot, guests })}
            disabled={!date}
            className="sw-btn h-auto w-full disabled:opacity-40"
            style={goldBtn}
          >
            CHECK AVAILABILITY <span aria-hidden="true">→</span>
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
