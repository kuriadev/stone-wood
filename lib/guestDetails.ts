// ── A guest correcting their own details
//
// From Manage booking a guest can change the name, email and mobile number
// on their booking -- nothing else (the date, guests and package go through
// their own flows). After a change they wait DETAILS_COOLDOWN_HOURS before
// the next one, so a booking can't be handed around by changing the email
// over and over. POST /api/bookings/[id]/details applies it.
//
// Pure: the page and the server share it.

export let DETAILS_COOLDOWN_HOURS = 12;
/** Rates & Settings sets it (lib/settings.ts). */
export function applyDetailsValues(v: { cooldownHours: number }): void { DETAILS_COOLDOWN_HOURS = v.cooldownHours; }

/** When the guest may change their details again, or null when they may now. */
export function detailsCooldownUntil(lastChange: string | undefined | null, now: Date = new Date()): Date | null {
  if (!lastChange) return null;
  const t = Date.parse(lastChange);
  if (!Number.isFinite(t)) return null;
  const until = new Date(t + DETAILS_COOLDOWN_HOURS * 60 * 60 * 1000);
  return until > now ? until : null;
}

/** "Nov 10, 6:35 PM" in Manila. */
export function cooldownLabel(until: Date): string {
  return until.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
