import type { BookingStatus } from "@/types/booking";
import type { PaymentMethod, PaymentType } from "@/types/finance";
import type { BookingMoney } from "@/lib/finance";
import type { AdminTab } from "@/types/admin";

/* ── What staff and guests READ for a stored value ────────────────────────
 *
 * The database keeps short, stable words ("Pending", "Forfeited",
 * "PayMongo"). Queries, filters and the API keep using them, unchanged.
 * Everything a person reads goes through one of these maps instead, so the
 * wording can change here without touching a single query.
 *
 * Rule for new labels: say what state the thing is in from the reader's
 * side, in plain words, and keep it short enough for a pill (≈ 3 words).
 */

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  // Paid online (or entered by staff) and waiting for the admin to accept.
  Pending: "Awaiting approval",
  Confirmed: "Confirmed",
  // Checked out; the stay is over.
  Completed: "Stay completed",
  Cancelled: "Cancelled",
  // The resort could not host it; the guest picks a new date or a refund.
  ResortCancelled: "Guest choosing new date",
};

export const MONEY_STATE_LABEL: Record<BookingMoney["state"], string> = {
  "Paid in full": "Fully paid",
  "Partially paid": "Partly paid",
  Unpaid: "Not paid",
  // Guest cancelled (or did not come); the resort kept what was paid.
  Forfeited: "Non-refundable cancellation",
  Refunded: "Refunded",
  "Held for guest": "On hold for guest",
  "Refund owed": "Pending refund to guest",
};

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  Downpayment: "Down payment",
  Balance: "Balance",
  Full: "Full payment",
  // Charged after the post-stay inspection.
  Penalty: "Damage fee",
  Refund: "Refund",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  // The online checkout. Stored as "PayMongo", the processor; guests and
  // staff know it as the QR Ph code they scanned.
  PayMongo: "QR Ph",
  Cash: "Cash",
  GCash: "GCash",
  "Bank Transfer": "Bank transfer",
};

/** Label for any stored value; falls back to the value itself. */
export function labelOf<K extends string>(map: Record<K, string>, value: string | null | undefined): string {
  if (!value) return "";
  return (map as Record<string, string>)[value] ?? value;
}

export const statusLabel = (s: string | null | undefined) => labelOf(BOOKING_STATUS_LABEL, s);
/** The status label for one booking. "Pending" means two different waits:
 *  an online booking is already paid and waits for the admin to accept it,
 *  while a walk-in saved before any money came in waits for payment (it
 *  confirms itself on the first payment — app/api/payments). */
export const bookingStatusLabel = (b: { status: string; source?: string | null }) =>
  b.status === "Pending" && b.source === "Walk-In" ? "Awaiting payment" : statusLabel(b.status);
export const moneyLabel = (s: string | null | undefined) => labelOf(MONEY_STATE_LABEL, s);
export const payTypeLabel = (s: string | null | undefined) => labelOf(PAYMENT_TYPE_LABEL, s);
export const payMethodLabel = (s: string | null | undefined) => labelOf(PAYMENT_METHOD_LABEL, s);
/** "Down payment · QR Ph" — the line every payment list prints. */
export const paymentLine = (p: { type: string; method: string }) => `${payTypeLabel(p.type)} · ${payMethodLabel(p.method)}`;

/* ── Admin navigation ─────────────────────────────────────────────────────
 *
 * The AdminTab ids ("Occupancy", "Activity", …) are what every switch in
 * Admin.tsx routes on, so they stay. This is what the sidebar and each
 * screen's heading PRINT — one name per screen, the same in both places.
 */
export const ADMIN_TAB_LABEL: Record<AdminTab, string> = {
  Operations: "Today's Tasks",          // arrivals, preparation, check-out, closing, cash count
  Bookings: "All Bookings",
  Occupancy: "Booking Calendar",
  Facilities: "Facilities & Inspections",
  Inventory: "Supplies & Equipment",
  Sales: "Payments & Expenses",
  Reports: "Reports",
  Rooms: "Rooms",
  Packages: "Packages & Prices",
  Gallery: "Website Photos",
  "Customer Service": "Guest Messages",
  Maintenance: "Website On/Off",        // the switch that closes the public site
  Activity: "Activity History",         // was "Audit Log"
};

export const adminTabLabel = (t: AdminTab) => ADMIN_TAB_LABEL[t] ?? t;

/** Sidebar sections, top to bottom. */
export const ADMIN_NAV_GROUPS: { label: string; tabs: AdminTab[] }[] = [
  { label: "TODAY", tabs: ["Operations"] },
  { label: "RESERVATIONS", tabs: ["Bookings", "Occupancy"] },
  { label: "RESORT UPKEEP", tabs: ["Facilities", "Inventory"] },
  { label: "MONEY", tabs: ["Sales", "Reports"] },
  { label: "WHAT GUESTS SEE", tabs: ["Rooms", "Packages", "Gallery"] },
  { label: "GUESTS", tabs: ["Customer Service"] },
  { label: "WEBSITE", tabs: ["Maintenance"] },
  // Everything done in the system, not just money, so not under Money.
  { label: "HISTORY", tabs: ["Activity"] },
];
