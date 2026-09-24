import type { Booking, BookingResource, BookingSlot, BookingTier, PackageDeepLink } from "@/types/booking";
import { occupiedSlots } from "@/lib/resort";
import type { Facility } from "@/types/facility";
import {
  GUESTS_SHARED_MAX,
  RESORT_SHARED_CAPACITY,
} from "@/lib/validators";

/** Philippine Peso formatter */
export function fmt(n: number): string {
  return `₱${Number(n).toLocaleString()}`;
}

/** Builds the "/book?..." query string for a package deep link — shared by
 *  every place a "Book Package" click can happen (Home's package cards, the
 *  Packages page) so they stay in sync rather than each hand-rolling the
 *  same params. */
export function buildPackageBookingUrl(pkg: PackageDeepLink, resource: BookingResource, tier: BookingTier): string {
  const params = new URLSearchParams({
    resource,
    tier,
    pkgCode: pkg.code,
    pkgTitle: pkg.title,
    pkgPrice: String(pkg.price),
    pkgCapacity: String(pkg.capacity),
  });
  if (pkg.listPrice !== undefined) params.set("pkgListPrice", String(pkg.listPrice));
  if (pkg.requiresRoom) params.set("pkgRequiresRoom", "1");
  if (pkg.slotMode === "WholeDay") params.set("pkgSlotMode", "WholeDay");
  return `/book?${params.toString()}`;
}

/** Format a countdown timer (seconds → MM:SS) */
export function fmtTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Format a date string YYYY-MM-DD → "January 1, 2026" */
export function fmtDate(ds: string): string {
  if (!ds) return "Select a date";
  const [y, m, d] = ds.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(
    "en-PH",
    { month: "long", day: "numeric", year: "numeric" }
  );
}

/** "Shared" (pool shared with other same-day bookings) vs "Exclusive"
 *  (whole-pool buyout) — a smart DEFAULT suggested from guest count. The
 *  guest/staff can still override this explicitly (see BookingTier); this
 *  is only what gets pre-selected before they choose. */
export function getPackageTier(guests: number): BookingTier {
  return guests > GUESTS_SHARED_MAX ? "Exclusive" : "Shared";
}

/** A booking's resource, defaulting legacy (pre-Events-venue) records to
 *  "Pool". */
export function getBookingResource(b: Booking): BookingResource {
  return b.resource ?? "Pool";
}

/** A booking's tier, falling back to the guest-count default for legacy
 *  records that predate the explicit Shared/Exclusive choice. */
export function getBookingTier(b: Booking): BookingTier {
  return b.tier ?? getPackageTier(b.guests);
}

/** Does this booking use the pool at all? (false only for a Venue-only
 *  booking, e.g. a Zumba session that never touches the pool.) */
export function usesPool(b: Booking): boolean {
  return getBookingResource(b) !== "Venue";
}

/** Does this booking use the events venue? */
export function usesVenue(b: Booking): boolean {
  const r = getBookingResource(b);
  return r === "Venue" || r === "Pool+Venue";
}

/** Which slot a booking is in. Older records have no slot; their package
 *  label says "Night…" for night tours, and everything else was a day. */
export function getBookingSlot(b: Booking): BookingSlot {
  if (b.slot) return b.slot;
  return /^night/i.test(b.package ?? "") ? "Night" : "Day";
}

/** Single slots a booking holds, including the Night slot a Day booking
 *  takes over when staff add overtime. */
export function bookingHeldSlots(b: Booking): Array<"Day" | "Night"> {
  return occupiedSlots(getBookingSlot(b), b.overtime ?? 0);
}

const liveOn = (date: string, bookings: Booking[]) =>
  bookings.filter((b) => b.date === date && b.status !== "Cancelled");

/** Live pool-capacity readout for one slot of a date — e.g. "Shared: 22 of
 *  30 spots taken". Only counts Shared, pool-using bookings in that slot. */
export function getSharedPoolUsage(
  date: string,
  bookings: Booking[],
  slot: "Day" | "Night" = "Day"
): { used: number; max: number } {
  const used = liveOn(date, bookings)
    .filter((b) => usesPool(b) && getBookingTier(b) === "Shared" && bookingHeldSlots(b).includes(slot))
    .reduce((sum, b) => sum + b.guests, 0);
  return { used, max: RESORT_SHARED_CAPACITY };
}

const SLOT_WORD: Record<"Day" | "Night", string> = { Day: "Day Tour", Night: "Night Tour" };

/** Whether the pool has room for a new booking.
 *
 *  Shared bookings are checked per slot: the Day and Night are independent,
 *  so a Shared Day group never blocks a Night group, and Shared groups stack
 *  within a slot up to RESORT_SHARED_CAPACITY guests. A request with
 *  overtime also needs the Night slot completely free.
 *
 *  Exclusive is the exception, and it is deliberately NOT per slot: it is a
 *  whole-resort buyout of the DATE, as types/booking.ts has always defined
 *  it. This used to be enforced per slot, so an Exclusive Day buyout left
 *  the Night open — the calendar showed such a date as plainly available
 *  and a second group could book over a buyout. Confirmed as the intended
 *  rule by the owner on 2026-09-25. */
export function checkPoolCapacity(
  date: string,
  slot: BookingSlot,
  guests: number,
  tier: BookingTier,
  bookings: Booking[],
  overtime = 0
): { ok: boolean; reason?: string } {
  const live = liveOn(date, bookings).filter(usesPool);

  // ── Whole-date rules, before any per-slot arithmetic ────────────────
  // An Exclusive booking anywhere on this date closes the date outright,
  // and a new Exclusive request needs the date completely clear.
  const heldExclusive = live.find((b) => getBookingTier(b) === "Exclusive");
  if (heldExclusive) {
    return {
      ok: false,
      reason: `The resort is booked Exclusive that date (${SLOT_WORD[occupiedSlots(getBookingSlot(heldExclusive), heldExclusive.overtime ?? 0)[0]]}) — an Exclusive booking takes the whole day.`,
    };
  }
  if (tier === "Exclusive" && live.length > 0) {
    return {
      ok: false,
      reason: "An Exclusive booking takes the whole date, and that date already has bookings.",
    };
  }

  // Past this point every booking involved is Shared, in both directions:
  // an Exclusive booking already ON the date, and an Exclusive booking being
  // REQUESTED, have both returned above. That leaves overtime as the only
  // thing that can still block a slot — it is what makes a Shared group
  // occupy a slot it did not book.
  for (const s of occupiedSlots(slot, overtime)) {
    const inSlot = live.filter((b) => bookingHeldSlots(b).includes(s));
    if (inSlot.length === 0) continue;

    // Someone else's Day group stays past 5 PM, so the Night is not free.
    // This used to report "the pool is already booked Exclusive for the
    // Night Tour", which named the wrong cause: there is no Exclusive
    // booking here, and staff reading it would go looking for one.
    const runsLate = inSlot.find(
      (b) => s === "Night" && getBookingSlot(b) === "Day" && (b.overtime ?? 0) > 0
    );
    if (runsLate) {
      const hrs = runsLate.overtime ?? 0;
      return {
        ok: false,
        reason: `The Day Tour that date runs ${hrs} ${hrs === 1 ? "hour" : "hours"} of overtime into the evening, so the Night Tour isn't free.`,
      };
    }

    // The mirror case: THIS request is a Day with overtime and so needs the
    // Night, but a Night group already has it.
    if (s === "Night" && slot === "Day" && overtime > 0) {
      return {
        ok: false,
        reason: "The Night Tour is booked that date — overtime isn't possible (5–7 PM is cleaning time).",
      };
    }

    const { used, max } = getSharedPoolUsage(date, bookings, s);
    if (used + guests > max) {
      return { ok: false, reason: `The ${SLOT_WORD[s]}'s Shared capacity is full that date (${used}/${max}).` };
    }
  }
  return { ok: true };
}

/** Whether the events venue is free. One event per slot, independent of
 *  the pool. */
export function checkVenueAvailability(
  date: string,
  slot: BookingSlot,
  bookings: Booking[],
  overtime = 0
): { ok: boolean; reason?: string } {
  const wanted = occupiedSlots(slot, overtime);
  const clash = liveOn(date, bookings).find(
    (b) => usesVenue(b) && bookingHeldSlots(b).some((s) => wanted.includes(s))
  );
  return clash
    ? { ok: false, reason: "The events venue is already booked for that time." }
    : { ok: true };
}

/** Is the named facility open for customer use right now? Missing from the
 *  list entirely defaults to available (so a resort that hasn't set up
 *  Facilities yet isn't accidentally locked out of bookings), but an
 *  explicit "Under Maintenance" status blocks it. */
export function isFacilityOpen(name: string, facilities: Facility[]): boolean {
  const f = facilities.find((x) => x.name === name);
  return !f || f.status !== "Under Maintenance";
}

/** Whether the pool itself (as opposed to date/headcount capacity) is open
 *  for booking — flips false the moment staff marks "Swimming Pool" Under
 *  Maintenance in Facilities. */
export function isPoolOpen(facilities: Facility[]): boolean {
  return isFacilityOpen("Swimming Pool", facilities);
}

/** Whether the events venue is open for booking. */
export function isVenueOpen(facilities: Facility[]): boolean {
  return isFacilityOpen("Events Venue", facilities);
}

/** A room is bookable only while its own linked Facility isn't flagged
 *  Under Maintenance — lets staff pull a single room out of circulation
 *  (a leak, a broken aircon) without touching the others. */
export function isRoomOpen(roomId: number, facilities: Facility[]): boolean {
  const f = facilities.find((x) => x.category === "Room" && x.roomId === roomId);
  return !f || f.status !== "Under Maintenance";
}

/** Combined availability check for a booking request, covering whichever
 *  resource(s) it uses, in whichever slot(s) it occupies. `facilities` is
 *  optional — omit it and only the date/headcount rules apply. */
export function checkBookingAvailability(
  date: string,
  slot: BookingSlot,
  guests: number,
  tier: BookingTier,
  resource: BookingResource,
  bookings: Booking[],
  facilities?: Facility[],
  overtime = 0
): { ok: boolean; reason?: string } {
  if (resource !== "Venue") {
    if (facilities && !isPoolOpen(facilities)) {
      return { ok: false, reason: "The pool is temporarily closed for maintenance." };
    }
    const pool = checkPoolCapacity(date, slot, guests, tier, bookings, overtime);
    if (!pool.ok) return pool;
  }
  if (resource !== "Pool") {
    if (facilities && !isVenueOpen(facilities)) {
      return { ok: false, reason: "The events venue is temporarily closed for maintenance." };
    }
    const venue = checkVenueAvailability(date, slot, bookings, overtime);
    if (!venue.ok) return venue;
  }
  return { ok: true };
}

/** Rooms already taken on `date` during `slot` by another (non-cancelled)
 *  booking. Rooms are rented per slot — the 5–7 PM gap is enough to turn
 *  a room over — so a Day guest's room is free again for the Night. */
export function roomsTakenOn(date: string, slot: BookingSlot, bookings: Booking[], overtime = 0): Set<number> {
  const wanted = occupiedSlots(slot, overtime);
  const taken = new Set<number>();
  for (const b of liveOn(date, bookings)) {
    if (!bookingHeldSlots(b).some((s) => wanted.includes(s))) continue;
    for (const r of b.rooms ?? []) taken.add(r);
  }
  return taken;
}

