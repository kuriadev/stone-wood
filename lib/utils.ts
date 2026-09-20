import type { Room } from "@/types/room";
import type { Booking, BookingFoodItem, BookingResource, BookingTier, PackageDeepLink } from "@/types/booking";
import type { MenuItem } from "@/types/menu";
import type { InventoryItem } from "@/types/inventory";
import type { Facility } from "@/types/facility";
import {
  GUESTS_SHARED_MAX,
  RESORT_SHARED_CAPACITY,
  EVENT_VENUE_RATE,
  EXCLUSIVE_FLAT_RATE,
  SHARED_PER_HEAD_RATE,
  EXCLUSIVE_DISCOUNT_PCT,
  COMBO_DISCOUNT_PCT,
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
  if (pkg.foodDiscountPct !== undefined) params.set("pkgFoodDiscountPct", String(pkg.foodDiscountPct));
  return `/book?${params.toString()}`;
}

/** The tour's base price before rooms, overtime, discounts or food — the
 *  one number that actually depends on Shared vs Exclusive. An Exclusive
 *  buyout is one flat fee for the whole (fixed-size) resort; a Shared
 *  booking bills per attending head, since the pool is split with whoever
 *  else books that date. */
export function calcTourBase(guests: number, tier: BookingTier): number {
  return tier === "Exclusive" ? EXCLUSIVE_FLAT_RATE : guests * SHARED_PER_HEAD_RATE;
}

/** Calculate total booking price — tour base (tier-dependent) + overtime +
 *  selected rooms. Discounts are computed and shown separately (see
 *  calcExclusiveDiscount/calcComboDiscount) rather than folded in here, so
 *  the price breakdown can show a guest exactly what earned each discount
 *  instead of a single opaque number. */
export function calcTotal(
  guests: number,
  overtime: number,
  selRooms: number[],
  allRooms: Room[],
  tier: BookingTier = "Shared"
): number {
  let t = calcTourBase(guests, tier);
  if (overtime > 0) t += overtime * 500;
  selRooms.forEach((rid) => {
    const r = allRooms.find((x) => x.id === rid);
    if (r) t += r.price;
  });
  return t;
}

/** Reward for an Exclusive buyout, applied to the tour base only (never to
 *  rooms, the venue fee, or food). */
export function calcExclusiveDiscount(tier: BookingTier, guests: number): number {
  return tier === "Exclusive" ? Math.round(calcTourBase(guests, tier) * EXCLUSIVE_DISCOUNT_PCT) : 0;
}

/** True once at least one Combo-category item is in the order — that's what
 *  unlocks the combo discount on the whole food subtotal. */
export function hasComboItem(order: BookingFoodItem[], menuItems: MenuItem[]): boolean {
  return order.some((line) => menuItems.find((m) => m.id === line.itemId)?.category === "Combo");
}

/** Discount on the food subtotal, unlocked by ordering at least one Combo
 *  item. */
export function calcComboDiscount(order: BookingFoodItem[], menuItems: MenuItem[]): number {
  if (!hasComboItem(order, menuItems)) return 0;
  return Math.round(calcFoodTotal(order) * COMBO_DISCOUNT_PCT);
}

/** A package's own built-in food discount (see ResortPackage.foodDiscountPct)
 *  — applies to the WHOLE food subtotal regardless of what's in it, unlike
 *  calcComboDiscount which only unlocks on a Combo item. The two can stack. */
export function calcPackageFoodDiscount(order: BookingFoodItem[], pct: number | undefined): number {
  if (!pct) return 0;
  return Math.round(calcFoodTotal(order) * pct);
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

/** Generate a new booking ID based on existing count */
export function genBookingId(count: number): string {
  return `SW-${10007 + count}`;
}

/** Sum of a food order's line items (qty × price). */
export function calcFoodTotal(order: BookingFoodItem[]): number {
  return order.reduce((sum, item) => sum + item.qty * item.price, 0);
}

/** A menu item is sellable when staff has it switched on AND (it has no
 *  recipe, or every ingredient it needs still has stock left). This is what
 *  drives the "auto sold-out when an ingredient runs out" behavior. */
export function isMenuItemSellable(item: MenuItem, inventory: InventoryItem[]): boolean {
  if (!item.available) return false;
  if (!item.recipe || item.recipe.length === 0) return true;
  return item.recipe.every((line) => {
    const stock = inventory.find((i) => i.id === line.ingredientId);
    return !!stock && stock.qty >= line.qtyPerOrder;
  });
}

/** Deduct the ingredients consumed by a food order from inventory. Called
 *  once a booking's food order is placed, so stock reflects what was sold. */
export function deductRecipeStock(
  order: BookingFoodItem[],
  menuItems: MenuItem[],
  inventory: InventoryItem[]
): InventoryItem[] {
  const usage = new Map<number, number>();
  order.forEach((line) => {
    const item = menuItems.find((m) => m.id === line.itemId);
    item?.recipe?.forEach((r) => {
      usage.set(r.ingredientId, (usage.get(r.ingredientId) ?? 0) + r.qtyPerOrder * line.qty);
    });
  });
  if (usage.size === 0) return inventory;
  return inventory.map((i) =>
    usage.has(i.id) ? { ...i, qty: Math.max(0, i.qty - usage.get(i.id)!) } : i
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

/** Live pool-capacity readout for a date — e.g. "Shared: 22 of 60 spots
 *  taken". Only counts Shared, pool-using bookings; an Exclusive pool
 *  booking occupies the pool entirely but isn't part of this headcount. */
export function getSharedPoolUsage(date: string, bookings: Booking[]): { used: number; max: number } {
  const used = bookings
    .filter((b) => b.date === date && b.status !== "Cancelled" && usesPool(b) && getBookingTier(b) === "Shared")
    .reduce((sum, b) => sum + b.guests, 0);
  return { used, max: RESORT_SHARED_CAPACITY };
}

/** Whether `date` still has pool room for a new booking of `guests` people
 *  at the given `tier`. Rule: an Exclusive pool booking (existing or
 *  requested) has the pool entirely to itself for that date — it can't
 *  share a date with any other pool booking. Shared pool bookings can stack
 *  on the same date up to RESORT_SHARED_CAPACITY total guests. A Venue-only
 *  booking on the same date doesn't affect this at all — the venue and the
 *  pool are independent resources. */
export function checkPoolCapacity(
  date: string,
  guests: number,
  tier: BookingTier,
  bookings: Booking[]
): { ok: boolean; reason?: string } {
  const sameDayPool = bookings.filter(
    (b) => b.date === date && b.status !== "Cancelled" && usesPool(b)
  );
  if (sameDayPool.length === 0) return { ok: true };

  const existingExclusive = sameDayPool.some((b) => getBookingTier(b) === "Exclusive");
  if (existingExclusive) {
    return { ok: false, reason: "The pool is already booked Exclusive that date." };
  }

  if (tier === "Exclusive") {
    return { ok: false, reason: "The pool already has Shared bookings that date — an Exclusive buyout needs a date with none." };
  }

  const { used, max } = getSharedPoolUsage(date, bookings);
  if (used + guests > max) {
    return { ok: false, reason: `The pool's Shared capacity is full that date (${used}/${max}) — please pick another date.` };
  }

  return { ok: true };
}

/** Whether the events venue is free on `date`. The venue is always
 *  exclusive to whoever books it — one booking per date, independent of
 *  whatever's happening at the pool that same day. */
export function checkVenueAvailability(date: string, bookings: Booking[]): { ok: boolean; reason?: string } {
  const taken = bookings.some(
    (b) => b.date === date && b.status !== "Cancelled" && usesVenue(b)
  );
  return taken
    ? { ok: false, reason: "The events venue is already booked that date." }
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
 *  resource(s) it actually uses. `facilities` is optional so existing call
 *  sites that don't have it yet keep working — omit it and only the
 *  date/headcount rules apply. */
export function checkBookingAvailability(
  date: string,
  guests: number,
  tier: BookingTier,
  resource: BookingResource,
  bookings: Booking[],
  facilities?: Facility[]
): { ok: boolean; reason?: string } {
  if (resource !== "Venue") {
    if (facilities && !isPoolOpen(facilities)) {
      return { ok: false, reason: "The pool is temporarily closed for maintenance." };
    }
    const pool = checkPoolCapacity(date, guests, tier, bookings);
    if (!pool.ok) return pool;
  }
  if (resource !== "Pool") {
    if (facilities && !isVenueOpen(facilities)) {
      return { ok: false, reason: "The events venue is temporarily closed for maintenance." };
    }
    const venue = checkVenueAvailability(date, bookings);
    if (!venue.ok) return venue;
  }
  return { ok: true };
}

/** Flat fee for the events venue when it's part of the booking. */
export function calcVenueFee(resource: BookingResource): number {
  return resource === "Venue" || resource === "Pool+Venue" ? EVENT_VENUE_RATE : 0;
}
