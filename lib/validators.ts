import { dayjs, DATE_FMT } from "@/lib/dayjs";
// ── Form and booking-window validation
//
// Every rule lives here rather than inline in components, so the button's
// disabled state, the inline hint under a field, and any future server-side
// check all agree. Divergence between those three was what allowed
// "✓ Valid email" to appear under an address that was not valid.

// ════════════════════════════════════════════════════════════════════
// LIMITS
// Named so they can be tuned in one place and reused by the inputs'
// maxLength attributes as well as by the validators.
// ════════════════════════════════════════════════════════════════════

export const NAME_MIN = 2;
export const NAME_MAX = 40;
export const NOTES_MAX = 200;
/** Notes the front desk types on a walk-in (special requests). */
export const WALKIN_NOTES_MAX = 1000;

/** The resort's actual physical ceiling — how many people can be on-site for
 *  the pool/amenities at once, full stop. One number now drives everything
 *  guest-count related: the max guests a single booking will accept, the
 *  guest count an Exclusive buyout is fixed to (a buyout means the WHOLE
 *  capacity is reserved, not however many people happen to show up), and the
 *  running total every date's Shared bookings are capped against together.
 *  PLACEHOLDER — tune to the venue's real headcount limit. */
export let RESORT_MAX_CAPACITY = 30;

/** How many photos a room or a package may carry. Enforced by the API as
 *  well as the admin UI -- the UI cap is a courtesy, the API cap is the rule. */
export const GALLERY_MAX = 5;

export const GUESTS_MIN = 1;
/** No single booking can ask for more guests than the resort can physically
 *  hold. */
export let GUESTS_MAX = RESORT_MAX_CAPACITY;

/** Guest count at/below which a booking defaults to "Shared" (the resort's
 *  pool/venue is shared with other same-day bookings) rather than
 *  "Exclusive" (whole-resort buyout — no other booking allowed in its tour).
 *  Only used as a smart DEFAULT before the guest/staff explicitly picks a
 *  tier — see getPackageTier() in lib/utils.ts. */
export let GUESTS_SHARED_MAX = RESORT_MAX_CAPACITY;

/** Total guests allowed across all concurrent "Shared" bookings on one date
 *  — the same physical ceiling as RESORT_MAX_CAPACITY, since Shared bookings
 *  are just multiple parties splitting that one capacity. */
export let RESORT_SHARED_CAPACITY = RESORT_MAX_CAPACITY;

/** What the events hall holds (Rates & Settings, "Events venue capacity").
 *  A venue-only group stays in the hall, so it is held to this; anything
 *  with the pool is held to RESORT_MAX_CAPACITY, because that group uses
 *  the pool area as well, and after the venue closes the whole group is
 *  there. A booking is capped by the smallest space its guests use. */
export let VENUE_CAPACITY = 50;

/** The most guests one booking of this kind can have (staff can still go
 *  over on purpose, up to OVERRIDE_GUESTS_MAX). */
export function guestLimitFor(resource: "Pool" | "Venue" | "Pool+Venue" | undefined | null): number {
  return resource === "Venue" ? VENUE_CAPACITY : GUESTS_MAX;
}

/** Events venue, per slot (Day or Night). Lowered from ₱8,000 after
 *  comparing Rizal resorts: party/function halls there rent for about
 *  ₱5,000 per slot (e.g. Tyvo Resort's A/C hall, 8 hrs; Casa de Amarella's
 *  day rate). Always exclusive — one event per slot. */
export let EVENT_VENUE_RATE = 5000;

// ────────────────────────────────────────────────────────────────────
// TOUR PRICING
// A booking's base tour price now depends on its tier, not a flat number
// for everyone: "Exclusive" buys out the whole resort for one flat fee
// regardless of how many of the (fixed) 30 guests actually show up;
// "Shared" bills per attending head, since the pool is being split with
// other same-day bookings rather than reserved outright. Both are
// PLACEHOLDERS — tune to the resort's real rates. They're set so an
// Exclusive buyout (30 guests × ₱200) lands on the same ₱6,000 a full
// Shared group would pay, which is a starting point, not a rule.
// ────────────────────────────────────────────────────────────────────

/** Flat price for an Exclusive (whole-resort) buyout, per slot.
 *
 *  Flat means FLAT: the headcount does not enter the price at all. What is
 *  being bought is the resort to yourselves, and five people buy exactly
 *  the same thing as thirty. The guest count on an Exclusive booking is
 *  therefore an operational number — how many towels, how many chairs,
 *  who the kitchen cooks for — and the guest sets it themselves. */
export let EXCLUSIVE_FLAT_RATE = 6000;

/** What an Exclusive booking's guest count starts at.
 *
 *  Picking Exclusive used to slam the count to RESORT_MAX_CAPACITY and
 *  disable the stepper, on the reasoning that a buyout reserves all 30
 *  places. It does — but it made every buyout claim thirty arrivals, so
 *  the kitchen, the towels and the arrivals board were all wrong for the
 *  small private group that is the typical buyer. A low default that the
 *  guest can raise tells the truth. */
export let EXCLUSIVE_DEFAULT_GUESTS = 5;

/** Per-guest rate for a Shared booking. */
export let SHARED_PER_HEAD_RATE = 200;

/* Each kind of booking has its own rates (Rates & Settings): the Day Tour
   is SHARED_PER_HEAD_RATE / EXCLUSIVE_FLAT_RATE above; the Night Tour and
   the Staycation have these. A Staycation's rate is for the whole stay
   (both tours), not per tour. Until the owner sets them, the Night Tour
   costs what the Day Tour does and a Staycation twice that -- what every
   booking cost before they existed. */
export let SHARED_NIGHT_RATE = 200;
export let EXCLUSIVE_NIGHT_RATE = 6000;
export let SHARED_STAY_RATE = 400;
export let EXCLUSIVE_STAY_RATE = 12000;

/* A child under 3 in a Shared tour (lib/children.ts): half the adult
   rate until the owner sets their own in Rates & Settings. Exclusive
   lets them in free, so there is no Exclusive child rate. */
export let CHILD_DAY_RATE = 100;
export let CHILD_NIGHT_RATE = 100;

/** A Shared child under 3's price for one booking of this kind (one day of it). */
export function childRateFor(slot: "Day" | "Night" | "WholeDay"): number {
  // A Staycation is Exclusive only, so it never has a child rate of its own.
  return slot === "Night" ? CHILD_NIGHT_RATE : slot === "WholeDay" ? CHILD_DAY_RATE + CHILD_NIGHT_RATE : CHILD_DAY_RATE;
}

/** A Shared guest's price for one booking of this kind (one day of it). */
export function sharedRateFor(slot: "Day" | "Night" | "WholeDay"): number {
  return slot === "Night" ? SHARED_NIGHT_RATE : slot === "WholeDay" ? SHARED_STAY_RATE : SHARED_PER_HEAD_RATE;
}
/** The whole pool to one group, for one booking of this kind (one day of it). */
export function exclusiveRateFor(slot: "Day" | "Night" | "WholeDay"): number {
  return slot === "Night" ? EXCLUSIVE_NIGHT_RATE : slot === "WholeDay" ? EXCLUSIVE_STAY_RATE : EXCLUSIVE_FLAT_RATE;
}

// There are no automatic discounts. A booking built by hand pays the plain
// rates above; a package's own price, set by the owner in Packages & Prices,
// is where any deal lives. (Until 2026-10-27 the owner could also set 5%
// Exclusive, 10% bundle, 8% room-in-package and 15% extra-day discounts in
// Rates & Settings.)

export const OVERTIME_MIN = 0;
/** Day Tour overtime is admin-only and capped at 2 hours (5–7 PM): it can
 *  only use the cleaning gap before the Night slot, and only when the
 *  Night slot is free. Anyone wanting the evening books Whole Day instead —
 *  selling the night as ₱500/hr overtime would undercut the Night Tour.
 *  The Night Tour and Whole Day have no overtime. */
export let OVERTIME_MAX = 2;
/** Per hour of Day Tour overtime. */
export let OVERTIME_RATE = 500;

/** The most guests staff may put on one booking when they override the
 *  resort's capacity (a group bigger than the website takes). Only staff
 *  can; the website stays at GUESTS_MAX. */
export let OVERRIDE_GUESTS_MAX = 100;

/** How far ahead a guest may reserve. */
export let BOOKING_WINDOW_MONTHS = 3;
/** How many months back the calendars page, so a guest (and staff) can
 *  look at the dates just gone. Past dates show; they can't be booked. */
export let BOOKING_HISTORY_MONTHS = 3;
/** A guest may ask to move their booking only while the visit is at least
 *  this many days away: a booking for tomorrow can't be moved today, so
 *  the resort is never left with a date it has no time to fill. */
export let RESCHEDULE_NOTICE_DAYS = 2;

/** The most days one booking may run for. A stay is a run of day-use days
 *  (lib/occupancy.ts). Three is the resort's limit: a longer booking ties up
 *  the pool for a week and is arranged with the owner directly instead.
 *  Every message that quotes the limit reads it from here. */
export let MAX_STAY_DAYS = 3;

// ════════════════════════════════════════════════════════════════════
// DATES
// All helpers work on "YYYY-MM-DD" strings in LOCAL time, via the
// configured dayjs in lib/dayjs.ts. A booking date is a wall-clock day,
// not an instant: new Date("2026-09-21") is parsed as UTC and lands on
// the previous day in Manila for part of every day.
//
// These were hand-rolled before. dayjs replaced them only after a
// differential test compared both across 288 valid and 11 invalid dates
// — 1,142 comparisons, identical everywhere except five, where the old
// code was the wrong one (see fmtDate in lib/utils.ts).
// ════════════════════════════════════════════════════════════════════

/** The resort's wall clock: today's date and the hour in Manila,
 *  whatever time zone the machine running this is set to.
 *
 *  "Today" used to be the machine's local day. That is Manila on a guest's
 *  phone and on a laptop here, but a server in UTC (Vercel's default) is
 *  eight hours behind, so from midnight to 8 AM in Manila it still thought
 *  it was yesterday and accepted bookings for a date that had passed. */
export function manilaNow(at: Date = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/** Midnight at the start of today in Manila, as a local Date (the same
 *  shape parseDateStr returns, so the two compare directly). */
export function startOfToday(): Date {
  return dayjs(manilaNow().date, DATE_FMT, true).startOf("day").toDate();
}

/** Parse "YYYY-MM-DD" as a local date. Returns null if malformed.
 *  Strict, so an impossible date like 2026-02-31 is rejected rather than
 *  silently rolled over to 3 March. */
export function parseDateStr(dateStr: string): Date | null {
  const d = dayjs(dateStr ?? "", DATE_FMT, true);
  return d.isValid() ? d.startOf("day").toDate() : null;
}

/** Format a local Date back to "YYYY-MM-DD". */
export function toDateStr(d: Date): string {
  return dayjs(d).format(DATE_FMT);
}

/**
 * The bookable range: today to BOOKING_WINDOW_MONTHS ahead (Rates &
 * Settings). It rolls with the date -- in November it reaches into
 * February -- rather than stopping at the year's end, and keeping it short
 * keeps the calendars quick.
 */
export function getBookingWindow(): { min: Date; max: Date } {
  const min = dayjs(startOfToday());
  // dayjs clamps the month-length rollover itself: 31 Aug + 3 months is
  // 30 Nov, not 1 Dec.
  return { min: min.toDate(), max: min.add(BOOKING_WINDOW_MONTHS, "month").toDate() };
}

/** The first month the calendars page back to: BOOKING_HISTORY_MONTHS
 *  before this one. Its dates show as past; nothing there can be booked. */
export function firstViewableMonth(): Date {
  return dayjs(startOfToday()).subtract(BOOKING_HISTORY_MONTHS, "month").startOf("month").toDate();
}

/** The dates staff may book, close or record: from the start of the
 *  months-back view (a walk-in entered late) to the end of the window. */
export function staffDateWindow(): { first: string; last: string } {
  return { first: toDateStr(firstViewableMonth()), last: toDateStr(getBookingWindow().max) };
}

/** True when dateStr is a real date inside staffDateWindow(). */
export function isInStaffWindow(dateStr: string): boolean {
  if (!parseDateStr(dateStr)) return false;
  const { first, last } = staffDateWindow();
  return dateStr >= first && dateStr <= last;
}

/** Why the last bookable date is the last one, for tooltips and errors. */
export function bookingWindowNote(): string {
  const last = dayjs(getBookingWindow().max).format("MMMM D, YYYY");
  return `Reservations open up to ${BOOKING_WINDOW_MONTHS} month${BOOKING_WINDOW_MONTHS === 1 ? "" : "s"} ahead — the latest date you can book is ${last}.`;
}

/** Whole days from today (Manila) to dateStr: 1 for tomorrow. */
export function daysUntil(dateStr: string): number {
  const d = parseDateStr(dateStr);
  if (!d) return 0;
  return Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
}

/** Null when a guest may still ask to move a booking on dateStr, else why
 *  not. The resort's notice rule, RESCHEDULE_NOTICE_DAYS. */
export function rescheduleProblem(dateStr: string): string | null {
  const left = daysUntil(dateStr);
  if (left <= 0) return "Date changes close on your reserved date. Please contact the resort.";
  if (left < RESCHEDULE_NOTICE_DAYS) {
    return `Date changes close ${RESCHEDULE_NOTICE_DAYS} day${RESCHEDULE_NOTICE_DAYS === 1 ? "" : "s"} before your visit, so the resort has time to offer the date to someone else. Your visit is ${left === 1 ? "tomorrow" : `in ${left} days`} — please contact the resort.`;
  }
  return null;
}

/** True when dateStr is a real date inside the bookable window. */
export function isWithinBookingWindow(dateStr: string): boolean {
  const d = parseDateStr(dateStr);
  if (!d) return false;
  const { min, max } = getBookingWindow();
  return d >= min && d <= max;
}

/** Human-readable reason a date cannot be booked, or null when it can. */
export function describeDateProblem(dateStr: string): string | null {
  const d = parseDateStr(dateStr);
  if (!d) return "Please choose a date.";
  const { min, max } = getBookingWindow();
  if (d < min) return "That date has already passed.";
  if (d > max) return bookingWindowNote();
  return null;
}

// ════════════════════════════════════════════════════════════════════
// FIELDS
// ════════════════════════════════════════════════════════════════════

/**
 * Email. The previous pattern was /^[^\s@]+@[^\s@]+\.[^\s@]+$/, which
 * accepted "someone@gmail.com3321321" because its final segment allowed
 * digits. Requiring a letters-only TLD at the very end closes that hole.
 */
/**
 * Top-level domains a guest might plausibly be reachable at.
 *
 * The regex below treats ANY run of letters as a TLD, which is why
 * "name@gmail.comxxxxxx" used to validate: it parses as the domain "gmail"
 * with the TLD "comxxxxxx". That is syntactically legal and completely
 * undeliverable, and a booking confirmation sent there is lost in silence.
 *
 * Every two-letter country code is accepted wholesale (.ph, .co, .io, .me,
 * .ai ...). Longer TLDs are checked against this list. It is deliberately
 * generous but finite -- a guest on some exotic new gTLD would be rejected,
 * which is the trade this form should make: a typo caught now costs one
 * retype, a typo missed costs the confirmation email.
 */
const KNOWN_TLDS = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "info", "biz", "name",
  "mobi", "pro", "asia", "tel", "travel", "jobs", "coop", "aero", "cat",
  "app", "dev", "page", "site", "online", "store", "shop", "tech", "cloud",
  "email", "live", "life", "world", "today", "space", "website", "digital",
  "agency", "studio", "design", "media", "news", "blog", "wiki", "xyz",
  "top", "club", "fun", "link", "one", "ltd", "inc", "llc", "group",
  "global", "solutions", "services", "systems", "network", "center",
  "company", "business", "expert", "guru", "ninja", "rocks", "social",
  "team", "tools", "works", "zone", "academy", "school", "institute",
]);

/** The part after the final dot, lower-cased. */
function tldOf(email: string): string {
  const parts = email.toLowerCase().split(".");
  return parts[parts.length - 1] ?? "";
}

export function isValidEmail(email: string): boolean {
  const e = (email ?? "").trim();
  if (e.length === 0 || e.length > 254) return false;
  if (e.includes("..")) return false;
  if (e.startsWith(".") || e.startsWith("@")) return false;
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(e)) return false;
  const tld = tldOf(e);
  // Two-letter country codes pass; anything longer must be one we know.
  return /^[a-z]{2}$/.test(tld) || KNOWN_TLDS.has(tld);
}

/** A valid address that is specifically on gmail.com. */
export function isGmailAddress(email: string): boolean {
  const e = (email ?? "").trim().toLowerCase();
  // isValidEmail runs first, so a bare "@gmail.com" is rejected.
  return isValidEmail(e) && e.endsWith("@gmail.com");
}

/** Philippine mobile number: 11 digits beginning 09. */
export function isValidPHNumber(contact: string): boolean {
  return /^09\d{9}$/.test(contact ?? "");
}

/** Upper bound for a content label (dish, room, package, inventory item).
 *  Longer than NAME_MAX because product names carry qualifiers. */
export const LABEL_MAX = 120;

/**
 * Sanitiser for CONTENT names — rooms, packages, inventory.
 *
 * Deliberately NOT sanitizeName. That one strips everything but letters,
 * spaces, apostrophes, dots and hyphens, which is right for a guest's name
 * and destructive for a product's: it turned "Pork BBQ Skewers (5pcs)" into
 * "Pork BBQ Skewers pcs" and "Room 1 – Queen & Deck" into "Room  Queen  Deck"
 * on every admin save.
 *
 * Digits, brackets, &, +, / and dashes are all legitimate here. What is
 * removed is control characters and angle brackets, so a label can never
 * carry markup into a page or an email.
 */
export function sanitizeLabel(raw: string): string {
  return (raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, LABEL_MAX);
}

export function sanitizeName(raw: string): string {
  return (raw ?? "")
    .replace(/[^A-Za-zÀ-ÿÑñ\s'.-]/g, "") // letters (incl. accents), space, apostrophe, dot, hyphen
    .replace(/\s{2,}/g, " ")             // collapse runs of spaces
    .slice(0, NAME_MAX);
}

/** A name needs at least two adjacent letters, not just punctuation. */
export function isValidName(name: string): boolean {
  const n = (name ?? "").trim();
  if (n.length < NAME_MIN || n.length > NAME_MAX) return false;
  return /[A-Za-zÀ-ÿÑñ]{2,}/.test(n);
}

/** Keep digits only, capped at 11. */
export function sanitizeContact(raw: string): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, 11);
}

/** Trim notes to the allowed length. */
export function sanitizeNotes(raw: string): string {
  return (raw ?? "").slice(0, NOTES_MAX);
}

/** Clamp a number into an inclusive range, tolerating NaN. */
export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

// ════════════════════════════════════════════════════════════════════
// FORMS
// Each returns the first problem as a sentence, or null when valid.
// ════════════════════════════════════════════════════════════════════

export function validateBookingForm(form: {
  name: string;
  email: string;
  contact: string;
  notes?: string;
}): string | null {
  if (!form.name.trim()) return "Full name is required.";
  if (!isValidName(form.name)) return `Please enter your full name (${NAME_MIN}–${NAME_MAX} letters).`;
  if (!isValidEmail(form.email)) return "Please enter a valid email address.";
  if (!isValidPHNumber(form.contact)) return "Please enter a valid 11-digit PH mobile number starting 09.";
  if ((form.notes ?? "").length > NOTES_MAX) return `Notes must be ${NOTES_MAX} characters or fewer.`;
  return null;
}

// ── The owner's own numbers ─────────────────────────────────────────
//
// The values above are the DEFAULTS. The owner can change the prices and
// limits in Rates & Settings (lib/settings.ts); applying
// them reassigns these exported bindings, and because ES module exports
// are live, every price, capacity check and limit in the app reads the new
// number on its next call — nothing that uses them had to change.
//
// Only lib/settings.ts calls this. Each field is validated there first.
export interface LimitValues {
  resortCapacity: number;
  venueCapacity: number;
  exclusiveDefaultGuests: number;
  venueRate: number;
  exclusiveFlatRate: number;
  sharedPerHeadRate: number;
  sharedNightRate: number;
  exclusiveNightRate: number;
  sharedStayRate: number;
  exclusiveStayRate: number;
  childDayRate: number;
  childNightRate: number;
  overtimeMax: number;
  overtimeRate: number;
  bookingWindowMonths: number;
  bookingHistoryMonths: number;
  rescheduleNoticeDays: number;
  maxStayDays: number;
  peopleMax: number;
}

export function applyLimitValues(v: LimitValues): void {
  RESORT_MAX_CAPACITY = v.resortCapacity;
  GUESTS_MAX = v.resortCapacity;
  GUESTS_SHARED_MAX = v.resortCapacity;
  RESORT_SHARED_CAPACITY = v.resortCapacity;
  VENUE_CAPACITY = v.venueCapacity;
  EXCLUSIVE_DEFAULT_GUESTS = Math.min(v.exclusiveDefaultGuests, v.resortCapacity);
  EVENT_VENUE_RATE = v.venueRate;
  EXCLUSIVE_FLAT_RATE = v.exclusiveFlatRate;
  SHARED_PER_HEAD_RATE = v.sharedPerHeadRate;
  SHARED_NIGHT_RATE = v.sharedNightRate;
  EXCLUSIVE_NIGHT_RATE = v.exclusiveNightRate;
  SHARED_STAY_RATE = v.sharedStayRate;
  EXCLUSIVE_STAY_RATE = v.exclusiveStayRate;
  CHILD_DAY_RATE = v.childDayRate;
  CHILD_NIGHT_RATE = v.childNightRate;
  OVERTIME_MAX = v.overtimeMax;
  OVERTIME_RATE = v.overtimeRate;
  BOOKING_WINDOW_MONTHS = v.bookingWindowMonths;
  BOOKING_HISTORY_MONTHS = v.bookingHistoryMonths;
  RESCHEDULE_NOTICE_DAYS = v.rescheduleNoticeDays;
  MAX_STAY_DAYS = v.maxStayDays;
  OVERRIDE_GUESTS_MAX = v.peopleMax;
}
