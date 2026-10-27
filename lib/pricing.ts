// ── Booking price, in one place
//
// Pure: no React, no database, no network. The same function runs in the
// browser (Book Now, Walk-In, the Packages admin) to show a breakdown, and
// on the server (/api/payment, /api/bookings) to decide what is actually
// charged. Because it is literally the same code, the two can never
// disagree — and a total edited in DevTools changes nothing, since the
// server works it out again from the booking's details.
//
// The rules (agreed with the owner):
//
//   Pool, Shared      ₱200 per guest, per slot. Not offered for Whole Day.
//   Pool, Exclusive   ₱6,000 per slot.
//   Events Venue      ₱5,000 per slot. Always exclusive.
//   Room              its own rate, per slot.
//   Day overtime      ₱500/hr, max 2 hrs, admin only (see OVERTIME_MAX).
//
// No automatic discounts: a booking built by hand pays these rates, every
// day of a stay alike. A package's own price (Packages & Prices) is where
// any deal lives. Until 2026-10-27 there were four: 5% Exclusive, 10%
// bundle, 8% room in a package, 15% each extra day.

import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";
import {
  EXCLUSIVE_FLAT_RATE,
  SHARED_PER_HEAD_RATE,
  EVENT_VENUE_RATE,
  OVERTIME_RATE,
} from "@/lib/validators";
import { SLOTS, multiDayProblem } from "@/lib/resort";
import { getBookingResource, getBookingSlot, getBookingTier } from "@/lib/utils";

export { OVERTIME_RATE };

export interface PriceInput {
  /** Set when booking a fixed-price package; omit for a custom booking. */
  pkg?: { price: number; requiresRoom?: boolean } | null;
  resource: BookingResource;
  tier: BookingTier;
  slot: BookingSlot;
  guests: number;
  /** Day overtime hours — only ever set by staff. */
  overtime: number;
  /** The chosen rooms' own per-slot prices. */
  roomPrices: number[];
  /** How many days the stay runs for. 1 (the default) is a single day.
   *  The tour and the rooms are charged for each day; overtime is not,
   *  because staff add it once, on the day it actually happened. */
  days?: number;
}

export interface PriceBreakdown {
  /** Pool part (0 for venue-only, and for a package). */
  poolFee: number;
  /** Venue part (0 when no venue, and for a package). */
  venueFee: number;
  overtimeFee: number;
  /** Rooms, already × slots and × days. */
  roomsFee: number;
  total: number;
  /** 50% down payment, rounded up to the peso. */
  down: number;
  /** How many single slots are paid for (Whole Day = 2). */
  slots: 1 | 2;
  /** Days charged for. */
  days: number;
  /** What one day of the stay costs, before overtime. */
  perDay: number;
  /** Kept for screens that still show one "tour" line: pool + venue. */
  tourBase: number;
}

/** Is this combination offered at all? Returns a reason when it isn't.
 *
 *  `days` defaults to 1 so the call sites that only validate a shape (the
 *  Packages admin, /api/packages) need not pass it.
 *
 *  A Staycation (the WholeDay slot) is Exclusive only: it promises the
 *  resort is the group's own, right through, for up to MAX_STAY_DAYS. It
 *  was briefly offered Shared because picking a second date used to move
 *  a Day Tour there on its own, pushing small groups into a buyout they
 *  never chose. The calendar no longer switches the visit type, so a guest
 *  only reaches a Staycation by choosing it. The Day and Night Tours are
 *  still offered at both tiers.
 *
 *  A Staycation is a stay at the resort, so it is never the events venue
 *  on its own: Resort & pool, or Resort & pool + Events Venue. The owner's
 *  own packages are exempt (`isPackage`) — they decide what a package
 *  includes, and a venue-only package at Staycation hours is theirs to
 *  offer. */
export function pricingProblem(
  resource: BookingResource,
  tier: BookingTier,
  slot: BookingSlot,
  days = 1,
  isPackage = false
): string | null {
  if (slot === "WholeDay" && tier !== "Exclusive") {
    return `The ${SLOTS.WholeDay.label} is Exclusive only. Choose the Day or Night Tour to share the pool.`;
  }
  // Pool + Venue is an event with the resort to itself: a party in the
  // hall beside strangers in a shared pool is the complaint it avoids.
  if (resource === "Pool+Venue" && tier !== "Exclusive") {
    return "Resort & pool + Events Venue is Exclusive only — the whole resort is yours for the event.";
  }
  if (slot === "WholeDay" && resource === "Venue" && !isPackage) {
    return `A ${SLOTS.WholeDay.label} includes the resort. Choose Resort & pool, or Resort & pool + Events Venue.`;
  }
  return multiDayProblem(slot, days);
}

export function priceBooking(input: PriceInput): PriceBreakdown {
  const { pkg, resource, slot, guests, overtime, roomPrices } = input;
  // A stay repeats the same day, so it is priced a day at a time and then
  // multiplied.
  const days = Math.max(1, Math.floor(input.days ?? 1));
  const slots = SLOTS[slot].span;
  const usesPool = resource !== "Venue";
  const usesVenue = resource !== "Pool";
  // The venue is always exclusive, whatever tier was passed.
  const tier: BookingTier = usesPool ? input.tier : "Exclusive";
  const exclusivePool = usesPool && tier === "Exclusive";

  const poolFee = !usesPool ? 0 : exclusivePool ? EXCLUSIVE_FLAT_RATE * slots : guests * SHARED_PER_HEAD_RATE * slots;
  const venueFee = usesVenue ? EVENT_VENUE_RATE * slots : 0;

  // Overtime exists only on a Day booking.
  const overtimeFee = slot === "Day" ? Math.max(0, overtime) * OVERTIME_RATE : 0;

  const roomsFee = roomPrices.reduce((sum, p) => sum + p, 0) * slots;

  // A package's own price replaces the pool + venue part. The owner sets it
  // in the Packages tab.
  const stayFee = pkg ? pkg.price : poolFee + venueFee;

  const perDay = stayFee + roomsFee;
  const total = perDay * days + overtimeFee;
  return {
    poolFee: pkg ? 0 : poolFee * days,
    venueFee: pkg ? 0 : venueFee * days,
    overtimeFee,
    roomsFee: roomsFee * days,
    total,
    down: Math.ceil(total / 2),
    slots,
    days,
    perDay,
    tourBase: stayFee * days,
  };
}

/** What a package "should" cost under the rules above, before any room.
 *  Used to seed the packages and to show the owner the standard price
 *  next to the one they set. */
export function standardPackagePrice(p: {
  resource: BookingResource;
  tier: BookingTier;
  slotMode: "Single" | "WholeDay";
  capacity: number;
}): { price: number; listPrice: number } {
  const b = priceBooking({
    resource: p.resource,
    tier: p.tier,
    slot: p.slotMode === "WholeDay" ? "WholeDay" : "Day",
    guests: p.capacity,
    overtime: 0,
    roomPrices: [],
  });
  return { price: b.tourBase, listPrice: b.poolFee + b.venueFee };
}

/** What a package is worth next to building the same booking by hand in
 *  Book Now, which any guest can now do (pool, venue or both).
 *
 *    diy        what that booking costs on its own (before any room)
 *    save       how much less the package costs; 0 when it doesn't
 *    compare    the price to show struck through: `diy`, only when the
 *               package really is cheaper
 *
 *  This replaced the admin-typed list price on the public pages, which
 *  could claim a saving the guest didn't get by booking the same thing
 *  themselves. Rooms aren't counted: they depend on which room the guest
 *  picks. */
export function packageValue(p: {
  resource: BookingResource;
  status: BookingTier;
  slotMode: "Single" | "WholeDay";
  capacity: number;
  price: number;
}): { diy: number; save: number; compare?: number } {
  const diy = standardPackagePrice({ resource: p.resource, tier: p.status, slotMode: p.slotMode, capacity: p.capacity }).price;
  const save = Math.max(0, diy - p.price);
  return { diy, save, compare: save > 0 ? diy : undefined };
}

/** The label stored on the booking. Shown to people through
 *  packageAvailed(), which adds Shared or Exclusive. */
export function bookingLabel(opts: {
  packageTitle?: string;
  resource: BookingResource;
  slot: BookingSlot;
  hasRoom: boolean;
}): string {
  const when = SLOTS[opts.slot].label; // "Day Tour" / "Night Tour" / "Staycation"
  const room = opts.hasRoom ? " + Room" : "";
  if (opts.packageTitle) return `${opts.packageTitle} (${when})`;
  if (opts.resource === "Venue") return `Event Venue Rental (${when})`;
  if (opts.resource === "Pool+Venue") return `${when} + Event Venue${room}`;
  return `${when}${room}`;
}

/** A self-built booking's label with its tier in front: "Exclusive Day
 *  Tour + Room". The venue on its own has no pool to share, so it reads
 *  as it is. */
export function labelWithTier(label: string, tier: BookingTier, resource: BookingResource): string {
  return resource === "Venue" ? label : `${tier} ${label}`;
}

/** What the guest availed, the way they read it: a package keeps its own
 *  name ("Private Pool (Day Tour)"); a booking they built themselves says
 *  Shared or Exclusive ("Exclusive Day Tour").
 *
 *  The stored label never carried the tier, so a 2-guest Exclusive Day
 *  Tour read "Day Tour" on a ₱5,700 receipt and looked overcharged. Worked
 *  out when shown rather than stored, so older bookings read the same way
 *  and the stored label stays what /api/bookings/[id]/charge compares. */
export function packageAvailed(b: Booking): string {
  const resource = getBookingResource(b);
  const made = bookingLabel({ resource, slot: getBookingSlot(b), hasRoom: (b.rooms?.length ?? 0) > 0 });
  // Only a name this system made up gets the tier; a package keeps its title.
  return b.package === made ? labelWithTier(made, getBookingTier(b), resource) : String(b.package ?? "");
}
