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
  /** "7:00 AM – 5:00 PM", or "7:00 PM – 5:00 AM (next day)". */
  hours: string;
  /** True when the slot ends after midnight, on the following morning. */
  endsNextDay: boolean;
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
  // Hours past 24 are the small hours of the NEXT morning. hourLabel wraps
  // them (29 ⇒ 5:00 AM) and Date.setHours rolls the day over on its own, so
  // an overnight slot needs no special arithmetic anywhere else.
  const endsNextDay = endHour > 24;
  return {
    id, label, start, end, endsNextDay,
    hours: `${start} – ${end}${endsNextDay ? " (next day)" : ""}`,
    span, startHour, endHour,
  };
};

// The one place the resort's hours are set. Change a number here and every
// page, the booking flow and the live occupancy count follow.
// ── The Night Tour is an OVERNIGHT slot ──
//
// It used to stop at midnight, which meant a group paid for five hours and
// then had to leave in the dark. It now holds the resort for the whole
// night and gives it back at 5 AM, which is what guests were asking for.
//
// 5 AM is not arbitrary: the Day Tour starts at 7, so ending there leaves
// the same two-hour turnover in the morning that 5–7 PM already gives
// between the Day and Night groups. That is what keeps the night group's
// stay from eating into the next morning's booking — the resort is empty
// and cleanable from 5 to 7 every morning, exactly as it is from 5 to 7
// every evening. Shorten this gap and the two groups meet.
export const SLOTS: Record<BookingSlot, SlotInfo> = {
  Day: slot("Day", "Day Tour", 7, 17, 1),        // 7:00 AM – 5:00 PM
  Night: slot("Night", "Night Tour", 19, 29, 1), // 7:00 PM – 5:00 AM next day
  WholeDay: slot("WholeDay", "Whole Day", 7, 29, 2), // 7:00 AM – 5:00 AM next day
};

/** The two bookable single slots, in order. */
export const SINGLE_SLOTS: BookingSlot[] = ["Day", "Night"];

/** 5–7 PM: cleaning and turnover between the Day and Night groups. */
export const TURNOVER_WINDOW = "5:00 – 7:00 PM";

/** 5–7 AM: cleaning and turnover after the Night group leaves, before the
 *  next morning's Day Tour. The mirror of TURNOVER_WINDOW, and the reason
 *  an overnight booking does not block the following day. */
export const MORNING_TURNOVER_WINDOW = "5:00 – 7:00 AM";

/** Videoke and speakers off from this time — keeps the neighbours happy. */
export const QUIET_HOURS_START = "10:00 PM";

/** One-line policy, reused on the booking policy screen and the site. */
export const QUIET_HOURS_POLICY = `Quiet hours start at ${QUIET_HOURS_START} — videoke and speakers off.`;

// ── How guests reach the owner ─────────────────────────────────────────
//
// PLACEHOLDERS: swap in the owner's real number, email and Facebook page
// before launch. The footer, Customer Service, the guest's booking page and
// the cancellation email all read these, so one edit here updates them all.
//
// A refund after the resort cancels is arranged over a call or a chat with
// the owner, not through a form, so these are what the guest is shown
// instead of a "request a refund" button.
export const RESORT_CONTACT = {
  /** Calls and texts. */
  phone: "+63 912 345 6789",
  viber: "+63 912 345 6789",
  email: "stonewoodresort.ph@gmail.com",
  /** The page's Messenger chat link (m.me/<page username>). */
  messenger: "https://m.me/stonewoodresort",
};

export interface ContactChannel {
  kind: "phone" | "viber" | "messenger" | "email";
  label: string;
  value: string;
  /** tel:, mailto: or https:. Viber has none: its viber:// links are
   *  stripped by most mail apps and do nothing on a computer without it. */
  href?: string;
}

/** The owner's contact details, in the order a guest should try them.
 *  `subject` pre-fills the email, e.g. with the booking reference. */
export function contactChannels(subject?: string): ContactChannel[] {
  const tel = RESORT_CONTACT.phone.replace(/[^\d+]/g, "");
  const mailto = `mailto:${RESORT_CONTACT.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return [
    { kind: "phone", label: "Call or text", value: RESORT_CONTACT.phone, href: `tel:${tel}` },
    { kind: "viber", label: "Viber", value: RESORT_CONTACT.viber },
    { kind: "messenger", label: "Messenger", value: RESORT_CONTACT.messenger.replace(/^https?:\/\//, ""), href: RESORT_CONTACT.messenger },
    { kind: "email", label: "Email", value: RESORT_CONTACT.email, href: mailto },
  ];
}

/** Single slots a booking actually occupies. A Day booking with overtime
 *  runs into the evening, so it holds the Night slot as well. */
export function occupiedSlots(slot: BookingSlot, overtime = 0): Array<"Day" | "Night"> {
  if (slot === "WholeDay") return ["Day", "Night"];
  if (slot === "Day" && overtime > 0) return ["Day", "Night"];
  return [slot];
}
