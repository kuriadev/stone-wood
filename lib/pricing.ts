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
// day of a stay alike. A package (Packages & Prices) is where any deal
// lives: its own price, and money off its price, its room or each extra
// day of a stay, set package by package. Until 2026-10-27 there were four
// resort-wide percentages instead: 5% Exclusive, 10% bundle, 8% room in a
// package, 15% each extra day.

import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";
import type { PackageDiscount, PackageDealPart } from "@/types/package";
import {
  exclusiveRateFor,
  sharedRateFor,
  EVENT_VENUE_RATE,
  OVERTIME_RATE,
  RESORT_MAX_CAPACITY,
  VENUE_CAPACITY,
} from "@/lib/validators";
import { SLOTS, multiDayProblem } from "@/lib/resort";
import { getBookingResource, getBookingSlot, getBookingTier } from "@/lib/utils";

export { OVERTIME_RATE };

export interface PriceInput {
  /** Set when booking a fixed-price package; omit for a custom booking.
   *  `price` is what the package costs today (packagePricing), and the two
   *  deals are the ones running today, if any. */
  pkg?: { price: number; requiresRoom?: boolean; roomDeal?: Deal | null; extraDayDeal?: Deal | null } | null;
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
  /** Rooms, already × slots and × days, after any package room deal. */
  roomsFee: number;
  /** What the package's room deal took off the rooms, all days. */
  roomsOff: number;
  /** What the package's extra-day deal took off, all days after the first. */
  extraDaysOff: number;
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
 *  (RESORT_MAX_CAPACITY): a venue-only booking or package can hold up to
 *  this many. The owner sets it in Rates & Settings (lib/validators.ts);
 *  re-exported here for the places that already read it from pricing. */
export { VENUE_CAPACITY };

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

/** A deal as priceBooking takes it: already known to be running. */
export type Deal = Pick<PackageDiscount, "type" | "value">;

export type DiscountResult = { ok: true; discount: PackageDiscount | null } | { ok: false; error: string };

/** What each part is called in the admin form and in error messages. */
export const DEAL_PART_LABEL: Record<PackageDealPart, string> = {
  price: "Package price",
  room: "Room",
  extraDay: "Each extra day",
};

/** One clean deal from anything (the form, the API). Blank or zero means
 *  none. `below`: a peso amount has to stay under it (the package's own
 *  price). A room or an extra day has no single price to check against, so
 *  a peso amount there is capped at what it comes off instead (dealOff). */
function cleanDeal(raw: unknown, part: PackageDealPart, below?: number): DiscountResult {
  if (raw === null || raw === undefined || raw === "") return { ok: true, discount: null };
  const r = (typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = r.type === "amount" ? "amount" : r.type === "percent" ? "percent" : null;
  const value = Number(r.value);
  if (!type || r.value === "" || r.value === null || r.value === undefined || value === 0) return { ok: true, discount: null };
  // The price promo keeps its original wording; the others say which part.
  const on = part === "price" ? "" : `${DEAL_PART_LABEL[part]} discount: `;
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: `${on}The discount must be a positive number.` };
  if (type === "percent" && (value < 1 || value > PACKAGE_DISCOUNT_MAX_PCT || !Number.isInteger(value))) {
    return { ok: false, error: `${on}A percentage discount is a whole number from 1 to ${PACKAGE_DISCOUNT_MAX_PCT}.` };
  }
  if (type === "amount" && !Number.isInteger(value)) {
    return { ok: false, error: `${on}A peso discount has to be a whole amount.` };
  }
  if (type === "amount" && below !== undefined && value >= below) {
    return { ok: false, error: `${on}A peso discount has to be a whole amount less than the price (${below.toLocaleString()}).` };
  }
  let until: string | undefined;
  if (r.until !== undefined && r.until !== null && r.until !== "") {
    until = String(r.until);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until))) return { ok: false, error: `${on}The promo end date isn't a real date.` };
  }
  return { ok: true, discount: { type, value, ...(until ? { until } : {}) } };
}

/** A clean promo from anything (the form, the API), checked against the
 *  package's regular price. Blank or zero means no promo. */
export function cleanPackageDiscount(raw: unknown, price: number): DiscountResult {
  return cleanDeal(raw, "price", price);
}

/** One part's deal, checked the way cleanPackageDeals checks it: the admin
 *  form shows each row's own problem under that row. */
export function cleanPackageDealPart(part: PackageDealPart, raw: unknown, price: number): DiscountResult {
  return cleanDeal(raw, part, part === "price" ? price : undefined);
}

export type DealsResult =
  | { ok: true; discount: PackageDiscount | null; roomDiscount: PackageDiscount | null; extraDayDiscount: PackageDiscount | null }
  | { ok: false; error: string };

/** All of a package's deals, checked together. A room deal only means
 *  something on a package that includes a room, and an extra-day deal only
 *  on a Staycation (the one kind of package that can run past a day), so
 *  either is dropped -- not refused -- on a package it can't apply to. */
export function cleanPackageDeals(b: {
  price: number;
  requiresRoom?: boolean;
  slotMode?: string;
  discount?: unknown;
  roomDiscount?: unknown;
  extraDayDiscount?: unknown;
}): DealsResult {
  const price = cleanPackageDiscount(b.discount, b.price);
  if (!price.ok) return price;
  const room: DiscountResult = b.requiresRoom ? cleanDeal(b.roomDiscount, "room") : { ok: true, discount: null };
  if (!room.ok) return room;
  const day: DiscountResult = b.slotMode === "WholeDay" ? cleanDeal(b.extraDayDiscount, "extraDay") : { ok: true, discount: null };
  if (!day.ok) return day;
  return { ok: true, discount: price.discount, roomDiscount: room.discount, extraDayDiscount: day.discount };
}

/** How the three deals sit in the one `discount` column: the price promo
 *  at the top, as it always was (so older code still reads it), and the
 *  other two under `room` and `extraDay`. */
export type DiscountColumn = Partial<PackageDiscount> & { room?: PackageDiscount; extraDay?: PackageDiscount };

export function packDiscounts(p: {
  discount?: PackageDiscount | null;
  roomDiscount?: PackageDiscount | null;
  extraDayDiscount?: PackageDiscount | null;
}): DiscountColumn | null {
  const col: DiscountColumn = { ...(p.discount ?? {}) };
  if (p.roomDiscount) col.room = p.roomDiscount;
  if (p.extraDayDiscount) col.extraDay = p.extraDayDiscount;
  return Object.keys(col).length ? col : null;
}

/** The column back into the three deals. Anything unusable is no deal. */
export function unpackDiscounts(col: unknown): {
  discount?: PackageDiscount;
  roomDiscount?: PackageDiscount;
  extraDayDiscount?: PackageDiscount;
} {
  if (!col || typeof col !== "object") return {};
  const one = (raw: unknown): PackageDiscount | undefined => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const value = Number(d.value);
    if ((d.type !== "percent" && d.type !== "amount") || !Number.isFinite(value) || value <= 0) return undefined;
    return { type: d.type, value, ...(typeof d.until === "string" && d.until ? { until: d.until } : {}) };
  };
  const c = col as Record<string, unknown>;
  const out: { discount?: PackageDiscount; roomDiscount?: PackageDiscount; extraDayDiscount?: PackageDiscount } = {};
  const price = one(c), room = one(c.room), day = one(c.extraDay);
  if (price) out.discount = price;
  if (room) out.roomDiscount = room;
  if (day) out.extraDayDiscount = day;
  return out;
}

/** The deal if it runs on `today` ("YYYY-MM-DD", Manila), else null. */
export function dealToday(d: PackageDiscount | null | undefined, today: string): Deal | null {
  return d && d.value > 0 && (!d.until || d.until >= today) ? { type: d.type, value: d.value } : null;
}

/** What a deal takes off `amount`. A peso deal never takes more than the
 *  amount itself. */
export function dealOff(d: Deal | null | undefined, amount: number): number {
  if (!d || !(amount > 0) || !(d.value > 0)) return 0;
  return d.type === "percent"
    ? Math.round((amount * Math.min(d.value, PACKAGE_DISCOUNT_MAX_PCT)) / 100)
    : Math.min(Math.round(d.value), amount);
}

/** "8% off", "₱300 off". */
export function dealText(d: Deal): string {
  return d.type === "percent" ? `${d.value}% off` : `₱${d.value.toLocaleString()} off`;
}

/** Everything priceBooking needs about a package on `today`: its price
 *  (the promo price while one runs) and the room and extra-day deals that
 *  are running. The server quote, the walk-in window and the walk-in
 *  server check all price a package through this, so all three agree. */
export function packagePricing(
  p: {
    price: number;
    requiresRoom?: boolean;
    slotMode?: string;
    discount?: PackageDiscount | null;
    roomDiscount?: PackageDiscount | null;
    extraDayDiscount?: PackageDiscount | null;
  },
  today: string,
): { price: number; requiresRoom: boolean; roomDeal: Deal | null; extraDayDeal: Deal | null } {
  return {
    price: packagePriceToday(p, today).pay,
    requiresRoom: !!p.requiresRoom,
    roomDeal: p.requiresRoom ? dealToday(p.roomDiscount, today) : null,
    extraDayDeal: p.slotMode === "WholeDay" ? dealToday(p.extraDayDiscount, today) : null,
  };
}

/** The deals a guest sees beside a package's price today: "Room 8% off",
 *  "Each extra day 15% off". The price promo has its own badge. */
export function packageExtraDeals(
  p: { requiresRoom?: boolean; slotMode?: string; roomDiscount?: PackageDiscount | null; extraDayDiscount?: PackageDiscount | null },
  today: string,
): { part: "room" | "extraDay"; text: string; until?: string }[] {
  const out: { part: "room" | "extraDay"; text: string; until?: string }[] = [];
  const room = p.requiresRoom ? dealToday(p.roomDiscount, today) : null;
  if (room) out.push({ part: "room", text: `Room ${dealText(room)}`, until: p.roomDiscount?.until });
  const day = p.slotMode === "WholeDay" ? dealToday(p.extraDayDiscount, today) : null;
  if (day) out.push({ part: "extraDay", text: `Each extra day ${dealText(day)}`, until: p.extraDayDiscount?.until });
  return out;
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

/** The prices a booking link carries for a package: the price and the
 *  struck-through price (the promo against the regular price while one
 *  runs, else the Book Now comparison, packageValue), and any room or
 *  extra-day deal running today, so Book Now can show them. The server
 *  re-prices regardless. */
export function packageLinkPrices(
  p: {
    resource: BookingResource; status: BookingTier; slotMode: "Single" | "WholeDay"; capacity: number; price: number;
    requiresRoom?: boolean; discount?: PackageDiscount | null; roomDiscount?: PackageDiscount | null; extraDayDiscount?: PackageDiscount | null;
  },
  today: string,
): { price: number; listPrice?: number; roomDeal?: Deal; extraDayDeal?: Deal } {
  const t = packagePriceToday(p, today);
  const { roomDeal, extraDayDeal } = packagePricing(p, today);
  const deals = { ...(roomDeal ? { roomDeal } : {}), ...(extraDayDeal ? { extraDayDeal } : {}) };
  if (t.off > 0) return { price: t.pay, listPrice: t.regular, ...deals };
  return { price: p.price, listPrice: packageValue(p).compare, ...deals };
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

  // Each kind of booking at its own rate (Rates & Settings): a Staycation's
  // rate already covers both tours, so it isn't doubled here.
  const poolFee = !usesPool ? 0 : exclusivePool ? exclusiveRateFor(slot) : guests * sharedRateFor(slot);
  const venueFee = usesVenue ? EVENT_VENUE_RATE * slots : 0;

  // Overtime exists only on a Day booking.
  const overtimeFee = slot === "Day" ? Math.max(0, overtime) * OVERTIME_RATE : 0;

  // A package's room deal comes off each room's own rate, before the
  // rate is counted per slot.
  const roomDeal = pkg?.roomDeal ?? null;
  const roomsFull = roomPrices.reduce((sum, p) => sum + p, 0) * slots;
  const roomsFee = roomPrices.reduce((sum, p) => sum + p - dealOff(roomDeal, p), 0) * slots;

  // A package's own price replaces the pool + venue part. The owner sets it
  // in the Packages tab.
  const stayFee = pkg ? pkg.price : poolFee + venueFee;

  const perDay = stayFee + roomsFee;
  // A package's extra-day deal comes off every day after the first.
  const extraDays = days - 1;
  const extraDayOff = pkg && extraDays > 0 ? dealOff(pkg.extraDayDeal ?? null, perDay) : 0;
  const total = perDay * days - extraDayOff * extraDays + overtimeFee;
  return {
    poolFee: pkg ? 0 : poolFee * days,
    venueFee: pkg ? 0 : venueFee * days,
    overtimeFee,
    roomsFee: roomsFee * days,
    roomsOff: (roomsFull - roomsFee) * days,
    extraDaysOff: extraDayOff * extraDays,
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
