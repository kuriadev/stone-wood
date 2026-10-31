// ── How long guests' bookings are kept (data retention)
//
// The owner chooses, in Rates & Settings: off (keep everything, the
// default), or delete finished bookings once their stay is more than N
// months in the past. Runs by itself once a day when switched on, and the
// owner can also run it by hand.
//
// What goes: the booking and the guest details on it (name, email, phone,
// notes), with its inspections, damage records and date-change requests.
// What stays: the money. Payments are kept for the books, with the guest's
// name replaced and the link to the deleted booking cleared, so Sales and
// Reports still add up. The activity log is never edited.
//
// Only finished bookings: Completed or Cancelled, and not with a refund
// still owed. Anything pending, confirmed, or waiting on the guest is kept
// whatever its age. Pure; tested in tests/unit/retention.test.ts.

export interface RetentionSettings {
  enabled: boolean;
  /** Keep a finished booking this many months after its stay ended. */
  months: number;
}

export interface RetentionState extends RetentionSettings {
  lastRunAt?: string | null;
  lastDeleted?: number | null;
}

export const RETENTION_KEY = "data_retention";
export const DEFAULT_RETENTION: RetentionSettings = { enabled: false, months: 12 };
export const RETENTION_MIN_MONTHS = 1;
export const RETENTION_MAX_MONTHS = 120;
/** The choices offered first; any whole number in range is accepted. */
export const RETENTION_PRESETS = [6, 12, 24, 36, 60];

export type RetentionCheck = { ok: true; settings: RetentionSettings } | { ok: false; error: string };

export function validateRetention(raw: unknown): RetentionCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const enabled = r.enabled === true;
  const months = Number(r.months ?? DEFAULT_RETENTION.months);
  if (!Number.isInteger(months) || months < RETENTION_MIN_MONTHS || months > RETENTION_MAX_MONTHS) {
    return { ok: false, error: `Choose how many months to keep bookings: ${RETENTION_MIN_MONTHS} to ${RETENTION_MAX_MONTHS}.` };
  }
  return { ok: true, settings: { enabled, months } };
}

/** The last day a stay may have ended on and still be deleted: `months`
 *  before today. A stay that ended on the cutoff itself is kept. */
export function retentionCutoff(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export interface PurgeCandidate {
  status: string;
  date: string;
  endDate?: string | null;
  refundStatus?: string | null;
}

/** True when this booking is old enough, and finished enough, to delete. */
export function isPurgeable(b: PurgeCandidate, cutoff: string): boolean {
  if (b.status !== "Completed" && b.status !== "Cancelled") return false;
  if (b.refundStatus === "Owed") return false;
  const ended = b.endDate && b.endDate >= b.date ? b.endDate : b.date;
  return ended < cutoff;
}

/** "12 months" / "1 year" / "2 years 6 months", for the settings screen. */
export function monthsLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ") || "0 months";
}
