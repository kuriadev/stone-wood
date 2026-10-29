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
import type { PackageDiscount } from "@/types/package";
import {
  EXCLUSIVE_FLAT_RATE,
  SHARED_PER_HEAD_RATE,
  EVENT_VENUE_RATE,
  OVERTIME_RATE,
  RESORT_MAX_CAPACITY,
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

/** The events hall's own capacity, separate from the pool's
 *  (RESORT_MAX_CAPACITY): a venue-only package can hold up to this many. */
export const VENUE_CAPACITY = 50;

/** The most guests a package of this kind can take. */
export const packageCapacityLimit = (resource: BookingResource) =>
  resource === "Venue" ? VENUE_CAPACITY : RESORT_MAX_CAPACITY;

// ── Package promos ─────────────────────────────────────────────────
// A package keeps its regular price; a promo takes money off it, as a
// percentage or a peso amount, optionally until a date. The discounted
// price is what is CHARGED (the booking quote and the walk-in window both
// price a package through packagePriceToday), so what a guest is shown is
// what they pay.

export const PACKAGE_DISCOUNT_MAX_PCT = 90;

export type DiscountResult = { ok: true; discount: PackageDiscount | null } | { ok: false; error: string };

/** A clean promo from anything (the form, the API), checked against the
 *  package's regular price. Blank or zero means no promo. */
export function cleanPackageDiscount(raw: unknown, price: number): DiscountResult {
  if (raw === null || raw === undefined || raw === "") return { ok: true, discount: null };
  const r = (typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = r.type === "amount" ? "amount" : r.type === "percent" ? "percent" : null;
  const value = Number(r.value);
  if (!type || r.value === "" || r.value === null || r.value === undefined || value === 0) return { ok: true, discount: null };
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: "The discount must be a positive number." };
  if (type === "percent" && (value < 1 || value > PACKAGE_DISCOUNT_MAX_PCT || !Number.isInteger(value))) {
    return { ok: false, error: `A percentage discount is a whole number from 1 to ${PACKAGE_DISCOUNT_MAX_PCT}.` };
  }
  if (type === "amount" && (!Number.isInteger(value) || value >= price)) {
    return { ok: false, error: `A peso discount has to be a whole amount less than the price (${price.toLocaleString()}).` };
  }
  let until: string | undefined;
  if (r.until !== undefined && r.until !== null && r.until !== "") {
    until = String(r.until);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until))) return { ok: false, error: "The promo end date isn't a real date." };
  }
  return { ok: true, discount: { type, value, ...(until ? { until } : {}) } };
}

/** What a package costs on `today` ("YYYY-MM-DD", Manila): the regular
 *  price, and the promo price when a promo is running. */
export function packagePriceToday(
  p: { price: number; discount?: PackageDiscount | null },
  today: string,
): { pay: number; regular: number; off: number; badge: string | null; until?: string } {
  const regular = p.price;
  const d = p.discount;
  const running = !!d && d.value > 0 && (!d.until || d.until >= today);
  if (!running || !d) return { pay: regular, regular, off: 0, badge: null };
  const off = d.type === "percent"
    ? Math.round((regular * Math.min(d.value, PACKAGE_DISCOUNT_MAX_PCT)) / 100)
    : Math.min(d.value, Math.max(0, regular - 1));
  if (off <= 0) return { pay: regular, regular, off: 0, badge: null };
  return {
    pay: regular - off,
    regular,
    off,
    badge: d.type === "percent" ? `${d.value}% OFF` : `₱${off.toLocaleString()} OFF`,
    until: d.until,
  };
}

/** The price and struck-through price a booking link carries for a
 *  package: the promo against the regular price while one runs, else the
 *  Book Now comparison (packageValue). The server re-prices regardless. */
export function packageLinkPrices(
  p: { resource: BookingResource; status: BookingTier; slotMode: "Single" | "WholeDay"; capacity: number; price: number; discount?: PackageDiscount | null },
  today: string,
): { price: number; listPrice?: number } {
  const t = packagePriceToday(p, today);
  if (t.off > 0) return { price: t.pay, listPrice: t.regular };
  return { price: p.price, listPrice: packageValue(p).compare };
}

/** "until 30 Nov" for a promo's end date. */
export function promoUntilLabel(until?: string): string {
  if (!until) return "";
  const [y, m, d] = until.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `until ${d} ${month}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}

/** What guests book with a package, in the owner's words. */
export const PACKAGE_RESOURCE_LABEL: Record<BookingResource, string> = {
  Pool: "Resort & pool",
  Venue: "Events venue only",
  "Pool+Venue": "Resort & pool + events venue",
};

/** The pool access a package really gives. The events venue is never
 *  shared, so a venue-only package is Exclusive whatever was chosen; the
 *  form and the API both store it that way, so the badge cannot say
 *  "Shared" about something a guest gets to themselves. */
export function packageTier(resource: BookingResource, status: BookingTier): BookingTier {
  return resource === "Venue" ? "Exclusive" : status;
}

/** Can Shared be chosen for this setup? null when it can, else why not. */
export function sharedNotAllowed(resource: BookingResource, slotMode: "Single" | "WholeDay"): string | null {
  if (resource === "Venue") return "The events venue is always private: one group at a time.";
  if (resource === "Pool+Venue") return "Pool + events venue is Exclusive only: the whole resort is the group's for the event.";
  if (slotMode === "WholeDay") return `A ${SLOTS.WholeDay.label} is Exclusive only.`;
  return null;
}

/** Why a package can't be offered as set up, or null. The admin form shows
 *  it and keeps Save off; the packages API refuses it. */
export function packageSetupProblem(p: { resource: BookingResource; status: BookingTier; slotMode: "Single" | "WholeDay"; capacity: number }): string | null {
  const tier = packageTier(p.resource, p.status);
  const problem = pricingProblem(p.resource, tier, p.slotMode === "WholeDay" ? "WholeDay" : "Day", 1, true);
  if (problem) return problem;
  if (!Number.isFinite(p.capacity) || p.capacity < 1) return "Capacity must be at least 1.";
  const limit = packageCapacityLimit(p.resource);
  if (p.capacity > limit) {
    return p.resource === "Venue"
      ? `Capacity can be at most ${limit}, what the events venue holds.`
      : `Capacity can be at most ${limit}, the resort's limit (Rates & Settings). A bigger package could never be booked.`;
  }
  return null;
}

/** "Shared pool", "Exclusive · Pool + venue", "Events venue" -- the short
 *  badge on a package card that says what it really is. */
export function packageSetupLabel(p: { resource: BookingResource; status: BookingTier; requiresRoom?: boolean }): string {
  const tier = packageTier(p.resource, p.status);
  const what = p.resource === "Venue" ? "Events venue" : p.resource === "Pool+Venue" ? `${tier} · Pool + venue` : `${tier} pool`;
  return p.requiresRoom ? `${what} · Room` : what;
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
