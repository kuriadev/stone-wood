/** "Pending" = received, waiting for the admin to accept (was "Paid" before
 *  the sales module: that word now only ever means money actually received). */
export type BookingStatus = "Pending" | "Confirmed" | "Completed" | "Cancelled";
export type BookingPackage =
  | "Day Tour"
  | "Day Tour + Room"
  | "Night Tour"
  | "Night Tour + Room"
  | "On-Site Reservation";

/** Where the reservation was made. Older records (before this field
 *  existed) have no source and are treated as "Online". */
export type BookingSource = "Online" | "Walk-In";

/** Which physical resource(s) this booking actually uses. "Pool" is the
 *  original tour-style booking; "Venue" is the events hall rented on its
 *  own (no pool at all — e.g. a Zumba session); "Pool+Venue" is a full
 *  buyout of both together. Undefined on legacy records ⇒ "Pool", since
 *  the events venue didn't exist yet when they were created. */
export type BookingResource = "Pool" | "Venue" | "Pool+Venue";

/** "Shared" = the pool may be used by other same-day Shared bookings too;
 *  "Exclusive" = whole-resort buyout, no other booking allowed that date.
 *  Chosen explicitly by the guest/staff rather than only inferred from
 *  guest count. Undefined on legacy records ⇒ derived from guest count via
 *  getPackageTier(). Only meaningful when resource includes "Pool" — a
 *  Venue-only booking is always exclusive to the venue by definition. */
export type BookingTier = "Shared" | "Exclusive";

/** When a booking happens. Day 7 AM–5 PM, Night 7 PM–12 AM, Whole Day both
 *  (see lib/resort.ts). Each slot has its own pool capacity, venue and
 *  rooms, so a Day group and a Night group can share a date. */
export type BookingSlot = "Day" | "Night" | "WholeDay";

/** Carries a Home-page package's fixed pricing into Book Now via deep link
 *  (see app/book/page.tsx's ?pkg=... query params). A package is a
 *  one-time, non-customizable purchase — guests, tier and resource are all
 *  fixed by the package itself, so the only choices left in Book Now are
 *  the date (and a room, if the package includes one). `listPrice` is only set when the
 *  package carries a bundle discount (e.g. Pool + Events Venue), so the UI
 *  can show the pre-discount price struck through next to the real one. */
export interface PackageDeepLink {
  code: string;
  title: string;
  price: number;
  listPrice?: number;
  capacity: number;
  /** True when the guest still needs to pick ONE room in Book Now — see
   *  ResortPackage.requiresRoom. */
  requiresRoom?: boolean;
  /** "Single": guest picks Day or Night. "WholeDay": fixed to both. */
  slotMode?: PackageSlotMode;
}

/** Whether a package is booked for one slot of the guest's choice, or is
 *  a Whole Day package. */
export type PackageSlotMode = "Single" | "WholeDay";

export interface Booking {
  id: string;
  name: string;
  contact: string;
  email: string;
  date: string;
  guests: number;
  package: BookingPackage | string;
  rooms: number[];
  overtime: number;
  total: number;
  downpayment: number;
  status: BookingStatus;
  paymentProof: boolean;
  notes: string;
  createdAt?: number;
  cancelReason?: string | null;
  /** "Online" (guest booked through the website) or "Walk-In" (staff
   *  encoded it at the front desk). Undefined on legacy records ⇒ Online. */
  source?: BookingSource;
  /** Which resource(s) this booking uses. Undefined ⇒ "Pool" (legacy). */
  resource?: BookingResource;
  /** Shared vs Exclusive, when resource includes "Pool". Undefined ⇒
   *  derived from guest count. */
  tier?: BookingTier;
  /** True once staff has archived this reservation out of the active
   *  Bookings list — only ever set on a "Completed" or "Cancelled" booking.
   *  Archived bookings are hidden from the normal filters/counts but stay
   *  in the same array so they can be restored, and so Facilities'
   *  reservation history can still find them. */
  archived?: boolean;
  /** ISO timestamp of when this booking was archived. */
  archivedAt?: string;
  /** PayMongo payment intent that paid the down payment (online only). */
  paymentIntentId?: string;
  /** Day / Night / Whole Day. Undefined on older records ⇒ read from the
   *  package label (see getBookingSlot). */
  slot?: BookingSlot;
  /** "HH:MM", walk-ins only. */
  arrivalTime?: string;
  /** Client → server only, on a walk-in create: the money taken at the desk
   *  as the booking was encoded. The server records it in the payments
   *  ledger; it is never stored on the booking itself. */
  initialPayment?: {
    type: "Downpayment" | "Full";
    method: "Cash" | "GCash" | "Bank Transfer";
    amount: number;
    reference?: string;
  };
}
