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
//   Discounts — never two on the same part of the price:
//     5%  Exclusive pool, one slot, nothing else bundled.
//     10% Bundle: Whole Day, or Pool (exclusive) + Venue. Applies to the
//         pool + venue part and replaces the 5%.
//     8%  A room booked as part of a package.
//     15% Every day of a stay AFTER the first. This one is on a different
//         axis from the others — they discount a PART of a day's price,
//         this discounts the repeat of a whole day — so it stacks with
//         them rather than replacing them.
//
// Whole Day ₱12,000 → ₱10,800. Party (pool + venue, one slot) ₱11,000 →
// ₱9,900. Grand (pool + venue, Whole Day) ₱22,000 → ₱19,800.

import type { BookingResource, BookingSlot, BookingTier } from "@/types/booking";
import {
  EXCLUSIVE_FLAT_RATE,
  SHARED_PER_HEAD_RATE,
  EVENT_VENUE_RATE,
  EXCLUSIVE_DISCOUNT_PCT,
  PACKAGE_BUNDLE_DISCOUNT_PCT,
  ROOM_BUNDLE_DISCOUNT_PCT,
  MULTI_DAY_DISCOUNT_PCT,
  OVERTIME_RATE,
} from "@/lib/validators";
import { SLOTS, multiDayProblem } from "@/lib/resort";

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
   *  because staff add it once, on the day it actually happened. Days
   *  after the first carry MULTI_DAY_DISCOUNT_PCT. */
  days?: number;
}

export interface PriceBreakdown {
  /** Pool part before discounts (0 for venue-only). */
  poolFee: number;
  /** Venue part before discounts (0 when no venue). */
  venueFee: number;
  /** 5% exclusive discount, when it applies. */
  exclusiveDiscount: number;
  /** 10% bundle discount, when it applies. */
  bundleDiscount: number;
  overtimeFee: number;
  /** Rooms before the package room discount (already × slots). */
  roomsFeeRaw: number;
  roomBundleDiscount: number;
  roomsFee: number;
  /** 15% off every day of the stay after the first. 0 for one day. */
  stayDiscount: number;
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
 *  on its own: Resort visit, or Resort visit + Events Venue. The owner's
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
    return "Resort visit + Events Venue is Exclusive only — the whole resort is yours for the event.";
  }
  if (slot === "WholeDay" && resource === "Venue" && !isPackage) {
    return `A ${SLOTS.WholeDay.label} includes the resort. Choose Resort visit, or Resort visit + Events Venue.`;
  }
  return multiDayProblem(slot, days);
}

export function priceBooking(input: PriceInput): PriceBreakdown {
  const { pkg, resource, slot, guests, overtime, roomPrices } = input;
  // A stay repeats the same day, so it is priced a day at a time and then
  // multiplied. Discounts are worked out per day and multiplied too, which
  // keeps every line consistent with the total instead of rounding twice.
  const days = Math.max(1, Math.floor(input.days ?? 1));
  const slots = SLOTS[slot].span;
  const usesPool = resource !== "Venue";
  const usesVenue = resource !== "Pool";
  // The venue is always exclusive, whatever tier was passed.
  const tier: BookingTier = usesPool ? input.tier : "Exclusive";
  const exclusivePool = usesPool && tier === "Exclusive";

  const poolFee = !usesPool ? 0 : exclusivePool ? EXCLUSIVE_FLAT_RATE * slots : guests * SHARED_PER_HEAD_RATE * slots;
  const venueFee = usesVenue ? EVENT_VENUE_RATE * slots : 0;

  // Only the exclusive parts earn a discount; a Shared pool is per head.
  const discountable = (exclusivePool ? poolFee : 0) + venueFee;
  const isBundle = slots === 2 || (exclusivePool && usesVenue);
  const bundleDiscount = isBundle ? Math.round(discountable * PACKAGE_BUNDLE_DISCOUNT_PCT) : 0;
  const exclusiveDiscount = !isBundle && exclusivePool ? Math.round(poolFee * EXCLUSIVE_DISCOUNT_PCT) : 0;

  // Overtime exists only on a Day booking.
  const overtimeFee = slot === "Day" ? Math.max(0, overtime) * OVERTIME_RATE : 0;

  const roomsFeeRaw = roomPrices.reduce((sum, p) => sum + p, 0) * slots;
  const roomBundleDiscount = pkg?.requiresRoom ? Math.round(roomsFeeRaw * ROOM_BUNDLE_DISCOUNT_PCT) : 0;
  const roomsFee = roomsFeeRaw - roomBundleDiscount;

  // A package's own price replaces the pool + venue part. It's seeded to
  // exactly what these rules give (see standardPackagePrice), and the
  // owner may set a promo price on top in the Packages tab.
  const stayFee = pkg ? pkg.price : poolFee + venueFee - bundleDiscount - exclusiveDiscount;

  const perDay = stayFee + roomsFee;
  // Days after the first are sold at the stay rate. Taken off the whole
  // of each extra day (tour and room together) rather than off one part,
  // because what is being discounted is the repeat itself.
  const stayDiscount = Math.round(perDay * Math.max(0, days - 1) * MULTI_DAY_DISCOUNT_PCT);
  const total = perDay * days - stayDiscount + overtimeFee;
  return {
    poolFee: pkg ? 0 : poolFee * days,
    venueFee: pkg ? 0 : venueFee * days,
    exclusiveDiscount: pkg ? 0 : exclusiveDiscount * days,
    bundleDiscount: pkg ? 0 : bundleDiscount * days,
    overtimeFee,
    roomsFeeRaw: roomsFeeRaw * days,
    roomBundleDiscount: roomBundleDiscount * days,
    roomsFee: roomsFee * days,
    stayDiscount,
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
 *  This replaced the admin-typed list price on the public pages. That was
 *  the pre-discount total (₱6,000 for a private pool), but booking it
 *  yourself already gets the same discount (₱5,700), so "SAVE ₱300" on a
 *  package at ₱5,700 claimed a saving that didn't exist. The 8% room
 *  discount (requiresRoom) is on top and isn't counted here: it depends on
 *  which room the guest picks. */
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

/** The label stored on the booking and shown on receipts. */
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
