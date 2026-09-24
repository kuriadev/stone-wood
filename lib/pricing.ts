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
  OVERTIME_RATE,
} from "@/lib/validators";
import { SLOTS } from "@/lib/resort";

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
  total: number;
  /** 50% down payment, rounded up to the peso. */
  down: number;
  /** How many single slots are paid for (Whole Day = 2). */
  slots: 1 | 2;
  /** Kept for screens that still show one "tour" line: pool + venue. */
  tourBase: number;
}

/** Is this combination offered at all? Returns a reason when it isn't. */
export function pricingProblem(resource: BookingResource, tier: BookingTier, slot: BookingSlot): string | null {
  if (slot === "WholeDay" && resource !== "Venue" && tier === "Shared") {
    return "Whole Day is only offered as an Exclusive booking.";
  }
  return null;
}

export function priceBooking(input: PriceInput): PriceBreakdown {
  const { pkg, resource, slot, guests, overtime, roomPrices } = input;
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

  const total = stayFee + overtimeFee + roomsFee;
  return {
    poolFee: pkg ? 0 : poolFee,
    venueFee: pkg ? 0 : venueFee,
    exclusiveDiscount: pkg ? 0 : exclusiveDiscount,
    bundleDiscount: pkg ? 0 : bundleDiscount,
    overtimeFee,
    roomsFeeRaw,
    roomBundleDiscount,
    roomsFee,
    total,
    down: Math.ceil(total / 2),
    slots,
    tourBase: stayFee,
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

/** The label stored on the booking and shown on receipts. */
export function bookingLabel(opts: {
  packageTitle?: string;
  resource: BookingResource;
  slot: BookingSlot;
  hasRoom: boolean;
}): string {
  const when = SLOTS[opts.slot].label; // "Day Tour" / "Night Tour" / "Whole Day"
  const room = opts.hasRoom ? " + Room" : "";
  if (opts.packageTitle) return `${opts.packageTitle} (${when})`;
  if (opts.resource === "Venue") return `Event Venue Rental (${when})`;
  if (opts.resource === "Pool+Venue") return `${when} + Event Venue${room}`;
  return `${when}${room}`;
}
