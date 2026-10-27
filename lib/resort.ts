// ── Resort schedule, in one place
//
// Every page that shows opening hours reads them from here. Before this
// file the site gave three different answers — 7 AM or 8 AM for the Day
// Tour, 6 PM or 7 PM for the Night Tour — because each page typed its own.
//
// Pure data: safe to import from client components and from the server.

import type { BookingSlot } from "@/types/booking";
import { manilaNow } from "@/lib/validators";

export interface SlotInfo {
  id: BookingSlot;
  label: string;
  start: string;
  end: string;
  /** "7:00 AM – 5:00 PM", or "7:00 PM – 5:00 AM, next day" (no brackets of
   *  its own: screens print it as "Night Tour (…)"). */
  hours: string;
  /** True when the slot ends after midnight, on the following morning. */
  endsNextDay: boolean;
  /** How many single slots this covers — Whole Day is Day + Night. */
  span: 1 | 2;
  /** What a stay of several days in this slot actually is.
   *
   *  "returns" — the slot leaves a long gap every cycle, so the guest goes
   *  home and comes back: three days of Day Tour is three daytime visits,
   *  not one long one. "continuous" — the only gap is the 5–7 AM turnover,
   *  so a run of them is one unbroken stay and the guest never leaves. */
  stay: "returns" | "continuous";
  /** The six-word version of `stay`, for a tile or a chip. */
  stayHint: string;
  /** What the guest does at the end of each cycle, as a verb phrase:
   *  "head home at 5:00 PM". Used to build the long explanation. */
  cycleEnd: string;
  /** 24-hour clock, for the live occupancy count. 24 = midnight. */
  startHour: number;
  endHour: number;
}

const hourLabel = (h: number): string => {
  const hh = h % 24;
  const suffix = hh < 12 ? "AM" : "PM";
  return `${hh % 12 === 0 ? 12 : hh % 12}:00 ${suffix}`;
};

const slot = (
  id: BookingSlot, label: string, startHour: number, endHour: number, span: 1 | 2,
  stay: SlotInfo["stay"], stayHint: string,
): SlotInfo => {
  const start = hourLabel(startHour);
  const end = hourLabel(endHour);
  // Hours past 24 are the small hours of the NEXT morning. hourLabel wraps
  // them (29 ⇒ 5:00 AM) and Date.setHours rolls the day over on its own, so
  // an overnight slot needs no special arithmetic anywhere else.
  const endsNextDay = endHour > 24;
  return {
    id, label, start, end, endsNextDay,
    hours: `${start} – ${end}${endsNextDay ? ", next day" : ""}`,
    span, startHour, endHour,
    stay, stayHint, cycleEnd: `head home at ${end}`,
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
//
// ── What a stay of SEVERAL days means, per slot ──
//
// This is the question the hours alone do not answer, and the one guests
// kept asking: if I book a Day Tour for three days, do I sleep here?
//
// The answer falls out of the gap each slot leaves between its cycles:
//
//   Day Tour     5:00 PM → 7:00 AM next day = a 14-hour gap. The guest
//                goes home for the night and comes back in the morning.
//                Three days is three separate daytime visits. The resort
//                is NOT theirs overnight, and those nights stay sellable.
//
//   Night Tour   5:00 AM → 7:00 PM same day = a 14-hour gap. The mirror
//                image: the guest goes home at dawn and comes back in the
//                evening. Three days is three nights, and the stay ends
//                at 5:00 AM on the morning AFTER the last date.
//
//   Whole Day    5:00 AM → 7:00 AM next day = the two-hour turnover, and
//                nothing else. Nobody goes home in a gap that short, so a
//                run of Whole Days is ONE unbroken stay, 7:00 AM on the
//                first day to 5:00 AM after the last night. The mornings
//                in between are a housekeeping pass with the group still
//                on site, not a turnover between two groups.
//
// `stay` is data rather than a judgement made at each call site because
// the booking flow, the summary, the confirmation email and the staff
// screens all have to tell the guest the same story about where they
// sleep. getOccupancyWindow in lib/occupancy.ts already computes exactly
// these windows; this is the same fact in words.
export const SLOTS: Record<BookingSlot, SlotInfo> = {
  // 7:00 AM – 5:00 PM
  Day: slot("Day", "Day Tour", 7, 17, 1, "returns", "You come back each morning"),
  // 7:00 PM – 5:00 AM next day
  Night: slot("Night", "Night Tour", 19, 29, 1, "returns", "You come back each evening"),
  // 7:00 AM – 5:00 AM next day
  WholeDay: slot("WholeDay", "Staycation", 7, 29, 2, "continuous", "You stay right through"),
};

/** Is a run of several days in this slot one unbroken stay? */
export const isContinuousStay = (id: BookingSlot): boolean => SLOTS[id].stay === "continuous";

/** Can a booking in this slot cover more than one date at all?
 *
 *  Only the Whole Day. The Day and Night Tours are SINGLE-DATE visits, and
 *  this is the rule rather than an accident: a run of them would mean
 *  driving home at 5 PM and coming back at 7 the next morning, three times
 *  over. Nobody wants to buy that. A guest who wants several days wants
 *  the place to stay theirs in between, and the only slot that does that
 *  is the Whole Day — so picking a second date moves the booking there
 *  instead of refusing it. */
export const allowsMultiDay = (id: BookingSlot): boolean => SLOTS[id].stay === "continuous";

/** The slot a booking becomes when the guest picks more than one date. */
export const MULTI_DAY_SLOT: BookingSlot = "WholeDay";

/** Why this slot cannot run for this many days, if it cannot. */
export function multiDayProblem(id: BookingSlot, days: number): string | null {
  if (days <= 1 || allowsMultiDay(id)) return null;
  return `The ${SLOTS[id].label} is for one date only. Choose the ${SLOTS[MULTI_DAY_SLOT].label} to book more than one date.`;
}

/** What a multi-day stay is counted in — nights for the Night Tour, days
 *  for the others. "3 nights" reads truer than "3 days" for a booking
 *  that starts at 7 PM and ends at dawn. */
export function stayUnit(id: BookingSlot, days: number): string {
  const n = Math.max(1, days);
  if (id === "Night") return `${n} ${n === 1 ? "night" : "nights"}`;
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** The plain-language answer to "so do I sleep there?" for a stay of
 *  `days` days in this slot. Null for a single day, where the hours
 *  already say everything. */
export function stayPatternNote(id: BookingSlot, days: number): string | null {
  if (days <= 1) return null;
  const s = SLOTS[id];
  if (s.stay === "continuous") {
    return `The resort is yours without a break from ${s.start} on the first day until ${s.end} the morning after the last. Housekeeping works around you on the mornings in between.`;
  }
  const unit = stayUnit(id, days);
  if (id === "Night") {
    return `${unit}, one after another. You arrive at ${s.start} each evening and ${s.cycleEnd} — the resort is not yours during the day. Any room you book stays locked and held for you in between, so you can leave your things.`;
  }
  return `${unit}, one after another. You arrive at ${s.start} each morning and ${s.cycleEnd} — the resort is not yours overnight. Any room you book stays locked and held for you in between, so you can leave your things.`;
}

/** Today's tour can't be booked online once it has started.
 *
 *  The booking window opens at midnight, so a guest could pay at 9 PM for
 *  that day's Day Tour (7 AM – 5 PM), or at 4 AM for a Night Tour that had
 *  nearly ended. Only the first date matters: the later days of a stay are
 *  all in the future. Walk-ins at the front desk are not held to this; the
 *  staff can see who is actually there. */
export function slotStartedProblem(date: string, slot: BookingSlot, at: Date = new Date()): string | null {
  const now = manilaNow(at);
  if (date !== now.date || now.hour < SLOTS[slot].startHour) return null;
  return `Today's ${SLOTS[slot].label} has already started (${SLOTS[slot].start}), so it can't be booked online. Choose another date, or visit the front desk.`;
}

/** The two bookable single slots, in order. */
export const SINGLE_SLOTS: BookingSlot[] = ["Day", "Night"];

/** 5–7 PM: cleaning and turnover between the Day and Night groups. */
export let TURNOVER_WINDOW = "5:00 – 7:00 PM";

/** 5–7 AM: cleaning and turnover after the Night group leaves, before the
 *  next morning's Day Tour. The mirror of TURNOVER_WINDOW, and the reason
 *  an overnight booking does not block the following day. */
export let MORNING_TURNOVER_WINDOW = "5:00 – 7:00 AM";

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

// ── The owner's own hours and contacts ──────────────────────────────
//
// The hours and contact details above are the defaults. The owner sets the
// real ones in Rates & Settings (lib/settings.ts), which calls this. SLOTS
// and RESORT_CONTACT are updated IN PLACE, so every page, the booking
// flow, the occupancy count and the emails — which all read these same
// objects — follow without being changed. lib/settings.ts validates the
// hours first (each slot at least four hours, at least an hour's turnover
// between groups, the night ending by the next morning).
export interface ResortValues {
  dayStart: number;
  dayEnd: number;
  nightStart: number;
  /** Past 24 = the next morning (29 = 5 AM). */
  nightEnd: number;
  contact: { phone: string; viber: string; email: string; messenger: string };
}

const twoHours = (from: number, to: number) => {
  const a = hourLabel(from).replace(/ (AM|PM)$/, "");
  const end = hourLabel(to);
  const sameHalf = hourLabel(from).slice(-2) === end.slice(-2);
  return `${sameHalf ? a : hourLabel(from)} – ${end}`;
};

export function applyResortValues(v: ResortValues): void {
  Object.assign(SLOTS.Day, slot("Day", "Day Tour", v.dayStart, v.dayEnd, 1, "returns", "You come back each morning"));
  Object.assign(SLOTS.Night, slot("Night", "Night Tour", v.nightStart, v.nightEnd, 1, "returns", "You come back each evening"));
  Object.assign(SLOTS.WholeDay, slot("WholeDay", "Staycation", v.dayStart, v.nightEnd, 2, "continuous", "You stay right through"));
  TURNOVER_WINDOW = twoHours(v.dayEnd, v.nightStart);
  MORNING_TURNOVER_WINDOW = twoHours(v.nightEnd % 24, v.dayStart);
  Object.assign(RESORT_CONTACT, v.contact);
}
