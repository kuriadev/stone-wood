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
export const NAME_MAX = 60;
export const NOTES_MAX = 200;

/** The resort's actual physical ceiling — how many people can be on-site for
 *  the pool/amenities at once, full stop. One number now drives everything
 *  guest-count related: the max guests a single booking will accept, the
 *  guest count an Exclusive buyout is fixed to (a buyout means the WHOLE
 *  capacity is reserved, not however many people happen to show up), and the
 *  running total every date's Shared bookings are capped against together.
 *  PLACEHOLDER — tune to the venue's real headcount limit. */
export const RESORT_MAX_CAPACITY = 30;

export const GUESTS_MIN = 1;
/** No single booking can ask for more guests than the resort can physically
 *  hold. */
export const GUESTS_MAX = RESORT_MAX_CAPACITY;

/** Guest count at/below which a booking defaults to "Shared" (the resort's
 *  pool/venue is shared with other same-day bookings) rather than
 *  "Exclusive" (whole-resort buyout — no other booking allowed that day).
 *  Only used as a smart DEFAULT before the guest/staff explicitly picks a
 *  tier — see getPackageTier() in lib/utils.ts. */
export const GUESTS_SHARED_MAX = RESORT_MAX_CAPACITY;

/** Total guests allowed across all concurrent "Shared" bookings on one date
 *  — the same physical ceiling as RESORT_MAX_CAPACITY, since Shared bookings
 *  are just multiple parties splitting that one capacity. */
export const RESORT_SHARED_CAPACITY = RESORT_MAX_CAPACITY;

/** Events venue, per slot (Day or Night). Lowered from ₱8,000 after
 *  comparing Rizal resorts: party/function halls there rent for about
 *  ₱5,000 per slot (e.g. Tyvo Resort's A/C hall, 8 hrs; Casa de Amarella's
 *  day rate). Always exclusive — one event per slot. */
export const EVENT_VENUE_RATE = 5000;

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

/** Flat price for an Exclusive (whole-resort) buyout, however many of the
 *  fixed RESORT_MAX_CAPACITY guests actually attend. */
export const EXCLUSIVE_FLAT_RATE = 6000;

/** Per-guest rate for a Shared booking. */
export const SHARED_PER_HEAD_RATE = 200;

// ────────────────────────────────────────────────────────────────────
// DISCOUNTS
// Shown as their own line items in the price breakdown, never silently
// folded into a total, so a guest can see exactly what earned the discount.
// All PLACEHOLDERS — tune the percentages to whatever promotions the resort
// actually wants to run.
// ────────────────────────────────────────────────────────────────────

// Two discounts, and they never stack on the same part of the price:
//   • 5% Exclusive — an exclusive POOL buyout for one slot (₱6,000 → ₱5,700).
//     It exists because Exclusive competes with Shared per-head pricing;
//     the venue has no Shared option, so it doesn't get it.
//   • 10% Bundle — booking more than one thing together: Whole Day (two
//     slots), or Pool + Venue. Replaces the 5%.
// Applied everywhere by lib/pricing.ts — custom bookings, packages and
// walk-ins alike — so a package can never cost more than the same booking
// built by hand.

/** Exclusive pool buyout, one slot. */
export const EXCLUSIVE_DISCOUNT_PCT = 0.05;

/** Bundles: Whole Day, and Pool + Venue. */
export const PACKAGE_BUNDLE_DISCOUNT_PCT = 0.10;

/** A room booked as part of a "Pool + Room" package costs less than renting
 *  it on its own — applied to that one room's own price. Keeps the
 *  incentive on both sides: the guest saves on the room, the resort still
 *  sells the room (which would otherwise sit empty) plus the pool slot. */
export const ROOM_BUNDLE_DISCOUNT_PCT = 0.08;

export const OVERTIME_MIN = 0;
/** Day Tour overtime is admin-only and capped at 2 hours (5–7 PM): it can
 *  only use the cleaning gap before the Night slot, and only when the
 *  Night slot is free. Anyone wanting the evening books Whole Day instead —
 *  selling the night as ₱500/hr overtime would undercut the Night Tour.
 *  The Night Tour and Whole Day have no overtime. */
export const OVERTIME_MAX = 2;
/** Per hour of Day Tour overtime. */
export const OVERTIME_RATE = 500;

/** How far ahead a guest may reserve. */
export const BOOKING_WINDOW_MONTHS = 3;

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

/** Local midnight today. */
export function startOfToday(): Date {
  return dayjs().startOf("day").toDate();
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
 * The bookable range: from today until whichever comes FIRST —
 *   • BOOKING_WINDOW_MONTHS ahead of today, or
 *   • 31 December of the current year.
 * The year clamp is what keeps the calendar inside the current year even
 * when the three-month window would otherwise spill into January.
 */
export function getBookingWindow(): { min: Date; max: Date } {
  const min = dayjs().startOf("day");
  // dayjs clamps the month-length rollover itself: 31 Aug + 3 months is
  // 30 Nov, not 1 Dec. The hand-written guard this replaced did the same
  // thing with setDate(0).
  const ahead = min.add(BOOKING_WINDOW_MONTHS, "month");
  const endOfYear = min.endOf("year").startOf("day");

  return {
    min: min.toDate(),
    max: (ahead.isBefore(endOfYear) ? ahead : endOfYear).toDate(),
  };
}

/** True when dateStr is a real date inside the bookable window. */
export function isWithinBookingWindow(dateStr: string): boolean {
  const d = parseDateStr(dateStr);
  if (!d) return false;
  const { min, max } = getBookingWindow();
  return d >= min && d <= max;
}

/** Check if a booking date string is not in the past. */
export function isDateInFuture(dateStr: string): boolean {
  const d = parseDateStr(dateStr);
  return d !== null && d >= startOfToday();
}

/** Human-readable reason a date cannot be booked, or null when it can. */
export function describeDateProblem(dateStr: string): string | null {
  const d = parseDateStr(dateStr);
  if (!d) return "Please choose a date.";
  const { min, max } = getBookingWindow();
  if (d < min) return "That date has already passed.";
  if (d > max) {
    return `Reservations open up to ${BOOKING_WINDOW_MONTHS} months ahead — the latest bookable date is ${toDateStr(max)}.`;
  }
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
export function isValidEmail(email: string): boolean {
  const e = (email ?? "").trim();
  if (e.length === 0 || e.length > 254) return false;
  if (e.includes("..")) return false;
  if (e.startsWith(".") || e.startsWith("@")) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(e);
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
    // eslint-disable-next-line no-control-regex
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

export function validateOnsiteForm(form: {
  name: string;
  contact: string;
  email?: string;
}): string | null {
  if (!form.name.trim()) return "Full name is required.";
  if (!isValidName(form.name)) return `Please enter your full name (${NAME_MIN}–${NAME_MAX} letters).`;
  if (!isValidPHNumber(form.contact)) return "Please enter a valid 11-digit PH mobile number starting 09.";
  if (form.email !== undefined && !isGmailAddress(form.email)) {
    return "Please enter a valid Gmail address.";
  }
  return null;
}
