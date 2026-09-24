// ── Resort schedule, in one place
//
// Every page that shows opening hours reads them from here. Before this
// file the site gave three different answers — 7 AM or 8 AM for the Day
// Tour, 6 PM or 7 PM for the Night Tour — because each page typed its own.
//
// Pure data: safe to import from client components and from the server.

import type { BookingSlot } from "@/types/booking";

export interface SlotInfo {
  id: BookingSlot;
  label: string;
  start: string;
  end: string;
  /** "7:00 AM – 5:00 PM" */
  hours: string;
  /** How many single slots this covers — Whole Day is Day + Night. */
  span: 1 | 2;
  /** 24-hour clock, for the live occupancy count. 24 = midnight. */
  startHour: number;
  endHour: number;
}

const hourLabel = (h: number): string => {
  const hh = h % 24;
  const suffix = hh < 12 ? "AM" : "PM";
  return `${hh % 12 === 0 ? 12 : hh % 12}:00 ${suffix}`;
};

const slot = (id: BookingSlot, label: string, startHour: number, endHour: number, span: 1 | 2): SlotInfo => {
  const start = hourLabel(startHour);
  const end = hourLabel(endHour);
  return { id, label, start, end, hours: `${start} – ${end}`, span, startHour, endHour };
};

// The one place the resort's hours are set. Change a number here and every
// page, the booking flow and the live occupancy count follow.
export const SLOTS: Record<BookingSlot, SlotInfo> = {
  Day: slot("Day", "Day Tour", 7, 17, 1),        // 7:00 AM – 5:00 PM
  Night: slot("Night", "Night Tour", 19, 24, 1), // 7:00 PM – 12:00 AM
  WholeDay: slot("WholeDay", "Whole Day", 7, 24, 2),
};

/** The two bookable single slots, in order. */
export const SINGLE_SLOTS: BookingSlot[] = ["Day", "Night"];

/** 5–7 PM: cleaning and turnover between the Day and Night groups. */
export const TURNOVER_WINDOW = "5:00 – 7:00 PM";

/** Videoke and speakers off from this time — keeps the neighbours happy. */
export const QUIET_HOURS_START = "10:00 PM";

/** One-line policy, reused on the booking policy screen and the site. */
export const QUIET_HOURS_POLICY = `Quiet hours start at ${QUIET_HOURS_START} — videoke and speakers off.`;

/** Single slots a booking actually occupies. A Day booking with overtime
 *  runs into the evening, so it holds the Night slot as well. */
export function occupiedSlots(slot: BookingSlot, overtime = 0): Array<"Day" | "Night"> {
  if (slot === "WholeDay") return ["Day", "Night"];
  if (slot === "Day" && overtime > 0) return ["Day", "Night"];
  return [slot];
}
