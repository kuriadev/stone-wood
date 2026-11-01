// ── Auto-archive and data retention (All bookings → the settings icon)
//
// Two steps, both run by themselves once a day (and by hand):
//
// 1. Archive. A finished booking (Completed or Cancelled, no refund still
//    owed) moves to the Archived list once its stay ended more than
//    `archiveMonths` months ago -- 2 by default. Archiving deletes nothing;
//    it can be restored any time.
//
// 2. Delete the archive. Off by default. When on, everything in the
//    Archived list is deleted for good on a date the owner sets: a day of
//    every month, or a day of one month every year.
//
// What a deletion removes: the booking and the guest details on it (name,
// email, phone, notes), with its inspections, damage records and
// date-change requests. What stays: the money. Payments are kept for the
// books, with the guest's name replaced and the link to the deleted
// booking cleared, so Sales and Reports still add up. The activity log is
// never edited.
//
// Pure; tested in tests/unit/retention.test.ts.

export type DeleteSchedule = "monthly" | "yearly";

export interface RetentionSettings {
  /** Move finished bookings to the archive by themselves. */
  archiveEnabled: boolean;
  /** ...this many months after the stay ended. */
  archiveMonths: number;
  /** Delete everything in the archive on the scheduled date. */
  enabled: boolean;
  schedule: DeleteSchedule;
  /** Day of the month, 1-31 (a short month uses its last day). */
  day: number;
  /** Month of the year, 1-12 -- yearly only. */
  month: number;
}

export interface RetentionState extends RetentionSettings {
  lastRunAt?: string | null;
  lastDeleted?: number | null;
  lastArchived?: number | null;
  /** The scheduled date the archive was last emptied for (YYYY-MM-DD). */
  lastPurgeOn?: string | null;
  /** The day automatic deletion was switched on: a scheduled date before
   *  it never counts, so switching it on doesn't delete straight away. */
  enabledOn?: string | null;
}

export const RETENTION_KEY = "data_retention";
export const DEFAULT_RETENTION: RetentionSettings = {
  archiveEnabled: true, archiveMonths: 2,
  enabled: false, schedule: "monthly", day: 1, month: 1,
};
export const ARCHIVE_MIN_MONTHS = 1;
export const ARCHIVE_MAX_MONTHS = 24;
/** The choices offered first; any whole number in range is accepted. */
export const ARCHIVE_PRESETS = [1, 2, 3, 6, 12];

export type RetentionCheck = { ok: true; settings: RetentionSettings } | { ok: false; error: string };

const whole = (v: unknown, fallback: number) => (v === undefined || v === null || v === "" ? fallback : Number(v));

export function validateRetention(raw: unknown): RetentionCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_RETENTION;
  const archiveEnabled = r.archiveEnabled === undefined ? d.archiveEnabled : r.archiveEnabled === true;
  const enabled = r.enabled === true;
  const archiveMonths = whole(r.archiveMonths, d.archiveMonths);
  const schedule: DeleteSchedule = r.schedule === "yearly" ? "yearly" : "monthly";
  const day = whole(r.day, d.day);
  const month = whole(r.month, d.month);
  if (!Number.isInteger(archiveMonths) || archiveMonths < ARCHIVE_MIN_MONTHS || archiveMonths > ARCHIVE_MAX_MONTHS) {
    return { ok: false, error: `Archive after ${ARCHIVE_MIN_MONTHS} to ${ARCHIVE_MAX_MONTHS} months.` };
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) return { ok: false, error: "Choose a day from 1 to 31." };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Choose a month." };
  return { ok: true, settings: { archiveEnabled, archiveMonths, enabled, schedule, day, month } };
}

const iso = (y: number, m: number, d: number) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d, last))).toISOString().slice(0, 10);
};

/** `months` calendar months before today, clamping short months. */
export function retentionCutoff(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 - months, 1));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, d);
}

/** The most recent scheduled deletion date on or before today. */
export function lastScheduledOn(today: string, s: Pick<RetentionSettings, "schedule" | "day" | "month">): string {
  const [y, m] = today.split("-").map(Number);
  if (s.schedule === "monthly") {
    const here = iso(y, m, s.day);
    if (here <= today) return here;
    const p = new Date(Date.UTC(y, m - 2, 1));
    return iso(p.getUTCFullYear(), p.getUTCMonth() + 1, s.day);
  }
  const here = iso(y, s.month, s.day);
  return here <= today ? here : iso(y - 1, s.month, s.day);
}

/** The next scheduled deletion date after today. */
export function nextScheduledOn(today: string, s: Pick<RetentionSettings, "schedule" | "day" | "month">): string {
  const [y, m] = today.split("-").map(Number);
  if (s.schedule === "monthly") {
    const here = iso(y, m, s.day);
    if (here > today) return here;
    const n = new Date(Date.UTC(y, m, 1));
    return iso(n.getUTCFullYear(), n.getUTCMonth() + 1, s.day);
  }
  const here = iso(y, s.month, s.day);
  return here > today ? here : iso(y + 1, s.month, s.day);
}

/** Is a scheduled deletion due today? Catches up a date that passed while
 *  nobody opened the Dashboard, but never one from before it was switched
 *  on, and never the same date twice. Returns the date it is due for. */
export function purgeDueFor(today: string, s: RetentionState): string | null {
  if (!s.enabled) return null;
  const due = lastScheduledOn(today, s);
  if (s.enabledOn && due < s.enabledOn) return null;
  if (s.lastPurgeOn && due <= s.lastPurgeOn) return null;
  return due;
}

export interface PurgeCandidate {
  status: string;
  date: string;
  endDate?: string | null;
  refundStatus?: string | null;
  archived?: boolean | null;
}

const finished = (b: PurgeCandidate) =>
  (b.status === "Completed" || b.status === "Cancelled") && b.refundStatus !== "Owed";

/** True when this booking is finished and its stay ended before `cutoff`. */
export function isPurgeable(b: PurgeCandidate, cutoff: string): boolean {
  if (!finished(b)) return false;
  const ended = b.endDate && b.endDate >= b.date ? b.endDate : b.date;
  return ended < cutoff;
}

/** Old enough to move to the archive by itself. */
export function isArchivable(b: PurgeCandidate, cutoff: string): boolean {
  return !b.archived && isPurgeable(b, cutoff);
}

/** In the archive and safe to delete for good (never one with a refund
 *  still owed, or one somebody restored to a live status). */
export function isDeletableFromArchive(b: PurgeCandidate): boolean {
  return !!b.archived && finished(b);
}

/** "12 months" / "1 year" / "2 years 6 months", for the settings screen. */
export function monthsLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ") || "0 months";
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "on the 1st of every month" / "every March 15". */
export function scheduleLabel(s: Pick<RetentionSettings, "schedule" | "day" | "month">): string {
  return s.schedule === "monthly"
    ? `on the ${ordinal(s.day)} of every month`
    : `every ${MONTH_NAMES[s.month - 1]} ${s.day}`;
}
