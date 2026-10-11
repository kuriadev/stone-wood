"use client";

// ── The line that joins the first day of a stay to the last
//
// Drawn by both calendars — the home page's AvailabilityCalendar and the
// booking flow's BookingDatePicker — which are meant to read as one
// control. It used to be copied into each of them and had already drifted
// (4px off the bottom in one, 6px in the other), so it lives here now and
// they pass in their own colour.
//
// ── Why it is two segments and not one ──
//
// The line sat along the BOTTOM of each tile: out of the number's way, but
// reading as an underline under each date rather than as one thread
// running through the stay, and on a short tile it crowded the bottom
// edge. Moving it to the middle makes it a thread — except a line through
// the middle of a tile is a line through the middle of the number.
//
// So each day draws up to two segments at mid-height, stopping short of
// the number on either side. The gap is a fixed number of pixels rather
// than a percentage so the clearance around the digits stays the same
// whatever the tile's width; narrow tiles lose line, not legibility.
//
// A "shield" behind the number — a chip of the tile's own colour over a
// single unbroken line — was the other option, and is wrong here: both
// calendars paint their tiles with translucent fills (rgba greens over a
// photograph on the home page), so the line would show straight through
// the shield.

import { m } from "motion/react";

/** Half the clear space kept around the date's number, in pixels.
 *
 *  14 is a two-digit number at 14px (about 17px wide, so 9px either side
 *  of centre) plus five of breathing room. Fixed, not relative: the digits
 *  do not get smaller when the tile does. */
const NUMBER_CLEARANCE = 14;

/** How far each segment bleeds past its tile to cross the grid gap. More
 *  than the widest gap either calendar uses, so the segments always
 *  overlap into one line instead of leaving a break; the overlap falls on
 *  a neighbour that is drawing its own segment anyway. */
const BLEED = 6;

const LEG: React.CSSProperties = {
  position: "absolute",
  // Mid-height, by offset rather than transform: Motion writes `transform`
  // itself to animate scaleX, and a translate set here would be overwritten.
  top: "50%",
  marginTop: -1.5,
  height: 3,
  borderRadius: 2,
  transformOrigin: "left center",
  pointerEvents: "none",
};

export function RangeConnector({
  color, isStart, isEnd, weekday, legIndex,
}: {
  /** The line's colour — each calendar has its own green. */
  color: string;
  /** First day of the stay: nothing joins it on the left. */
  isStart: boolean;
  /** Last day of the stay: nothing joins it on the right. */
  isEnd: boolean;
  /** 0 = Sunday … 6 = Saturday. The line is clipped at the week's edges so
   *  it never appears to run off the calendar and back on. */
  weekday: number;
  /** How many days into the stay this tile is, for the staggered sweep. */
  legIndex: number;
}) {
  const sweep = (delay: number) => ({
    initial: { scaleX: 0, opacity: 0 },
    animate: { scaleX: 1, opacity: 1 },
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const, delay },
  });
  const base = legIndex * 0.07;

  return (
    <>
      {/* Into the number from the left. */}
      {!isStart && (
        <m.span
          aria-hidden
          {...sweep(base)}
          style={{
            ...LEG,
            left: weekday === 0 ? 0 : -BLEED,
            right: `calc(50% + ${NUMBER_CLEARANCE}px)`,
            background: color,
          }}
        />
      )}
      {/* Out of the number to the right. Half a beat later, so each tile's
          two halves read as one stroke continuing rather than two. */}
      {!isEnd && (
        <m.span
          aria-hidden
          {...sweep(base + 0.035)}
          style={{
            ...LEG,
            left: `calc(50% + ${NUMBER_CLEARANCE}px)`,
            right: weekday === 6 ? 0 : -BLEED,
            background: color,
          }}
        />
      )}
    </>
  );
}
