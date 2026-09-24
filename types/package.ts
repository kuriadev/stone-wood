import type { BookingResource, BookingTier, PackageSlotMode } from "@/types/booking";

/** A resort package as the admin manages it — the CMS-editable source of
 *  truth for what Home.tsx and the Packages page display, and for what a
 *  "BOOK PACKAGE" click carries into Book Now (see PackageDeepLink). A
 *  package is a fixed, one-time purchase: price and capacity are set here,
 *  not chosen by the guest. `active: false` hides it from customers without
 *  deleting it (and without breaking any booking that already references
 *  its code). */
export interface ResortPackage {
  id: number;
  code: string;
  title: string;
  resource: BookingResource;
  status: BookingTier;
  price: number;
  /** Pre-discount price, shown struck through, when this package bundles a
   *  discount (e.g. Pool + Events Venue). Omit when there's no bundle. */
  listPrice?: number;
  capacity: number;
  /** True when the guest still needs to pick ONE room in Book Now — the
   *  room's own price (minus ROOM_BUNDLE_DISCOUNT_PCT) is added on top of
   *  `price`, since a package can't fix a price for a room it hasn't
   *  chosen. */
  requiresRoom?: boolean;
  /** "Single": the guest picks Day or Night at booking and `price` is for
   *  one slot. "WholeDay": 7 AM–12 AM, and `price` covers both slots. */
  slotMode: PackageSlotMode;
  cover: string;
  gallery: { label: string; src: string; kind: string }[];
  blurb: string;
  includes: string[];
  note?: string;
  /** Hidden from customers (Home, Packages page, Walk-In) when false, but
   *  kept around for admin reference / existing bookings. */
  active: boolean;
}
