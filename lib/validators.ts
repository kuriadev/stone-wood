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

export const GUESTS_MIN = 1;
/** Hard ceiling for a single day-tour booking. Adjust to the venue's real
 *  limit — the ₱100/head surcharge starts above 30, not at this number. */
export const GUESTS_MAX = 100;

export const OVERTIME_MIN = 0;
/** Day tour ends 5:00 PM; 7 hours of overtime reaches midnight. */
export const OVERTIME_MAX = 7;

/** How far ahead a guest may reserve. */
export const BOOKING_WINDOW_MONTHS = 3;

// ════════════════════════════════════════════════════════════════════
// DATES
// All helpers work on "YYYY-MM-DD" strings in LOCAL time. Parsing with
// new Date("2026-09-21") would be treated as UTC and can land on the
// previous day west of Greenwich, so the parts are split by hand.
// ════════════════════════════════════════════════════════════════════

/** Local midnight today. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse "YYYY-MM-DD" as a local date. Returns null if malformed. */
export function parseDateStr(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  dt.setHours(0, 0, 0, 0);
  // Rejects impossible dates such as 2026-02-31, which JS would roll over.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

/** Format a local Date back to "YYYY-MM-DD". */
export function toDateStr(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

/**
 * The bookable range: from today until whichever comes FIRST —
 *   • BOOKING_WINDOW_MONTHS ahead of today, or
 *   • 31 December of the current year.
 * The year clamp is what keeps the calendar inside the current year even
 * when the three-month window would otherwise spill into January.
 */
export function getBookingWindow(): { min: Date; max: Date } {
  const min = startOfToday();

  const ahead = new Date(min);
  ahead.setMonth(ahead.getMonth() + BOOKING_WINDOW_MONTHS);
  // Guard the month-length rollover: 30 Nov + 3 months is fine, but
  // 31 Aug + 3 months would land on 1 Dec without this correction.
  if (ahead.getDate() !== min.getDate()) ahead.setDate(0);

  const endOfYear = new Date(min.getFullYear(), 11, 31);
  endOfYear.setHours(0, 0, 0, 0);

  return { min, max: ahead < endOfYear ? ahead : endOfYear };
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

/** Strip anything that does not belong in a person's name, and cap length. */
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
