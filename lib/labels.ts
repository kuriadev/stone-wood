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
  Confirmed: "Confirmed booking",
  // Checked out; the stay is over.
  Completed: "Completed booking",
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
  // A QR Ph code scanned at the front desk. Stored as "GCash" (the value
  // older rows use); the resort only takes cash and QR Ph.
  GCash: "QR Ph",
};

/** QR Ph is the one online way to pay: the resort's PayMongo account shows
 *  a QR Ph code, and the guest scans it with whichever e-wallet they use.
 *  These are the e-wallets that pay a PayMongo QR Ph code (PayMongo's own
 *  list, paymongo.com/qrph). Banks are not listed: the resort takes cash
 *  and QR Ph e-wallets only. */
export const QRPH_WALLETS = [
  { name: "GCash", icon: "/images/wallets/gcash.png" },
  { name: "Maya", icon: "/images/wallets/maya.png" },
] as const;
/** "GCash, Maya or any e-wallet that accepts QR Ph" */
export const QRPH_WALLETS_TEXT = `${QRPH_WALLETS.map((w) => w.name).join(", ")} or any e-wallet that accepts QR Ph`;

/** Label for any stored value; falls back to the value itself. */
export function labelOf<K extends string>(map: Record<K, string>, value: string | null | undefined): string {
  if (!value) return "";
  return (map as Record<string, string>)[value] ?? value;
}

export const statusLabel = (s: string | null | undefined) =>
  s === NO_SHOW ? "No-show" : s === REFUNDED ? "Refunded" : labelOf(BOOKING_STATUS_LABEL, s);

/* ── No-show ──
 * Stored as Cancelled, so availability, money (what was paid is kept) and
 * archiving treat it exactly like one. Only "Mark no-show" on a guest's
 * card sets the flag that tells it apart (20261106120000_booking_no_show).
 * A booking cancelled any other way is Cancelled, whatever its reason says. */
export const NO_SHOW = "NoShow" as const;
export const isNoShow = (b: { status: string; noShow?: boolean }) => b.status === "Cancelled" && b.noShow === true;
/** "No-show: <note>" for a no-show's detail line, whatever was typed. */
export const noShowLine = (reason: string | null | undefined) => {
  const note = (reason ?? "").trim().replace(/^no[\s-]?show\b[\s:.,-]*/i, "").trim();
  return `No-show: ${note || "the group did not arrive."}`;
};
/* ── Refunded ──
 * Stored as Cancelled with the refund marked sent ("Mark as refunded", after
 * the refund was agreed with the guest). Shown and filtered as its own
 * status so the list tells a refunded booking from a plain cancellation. */
export const REFUNDED = "Refunded" as const;
export const isRefunded = (b: { status: string; refundStatus?: string | null }) => b.status === "Cancelled" && b.refundStatus === "Sent";
/** The status a booking is filtered and counted under: its stored status,
 *  NO_SHOW for a no-show, or REFUNDED once its refund was returned. */
export const statusKey = (b: { status: string; noShow?: boolean; refundStatus?: string | null }) =>
  isNoShow(b) ? NO_SHOW : isRefunded(b) ? REFUNDED : b.status;
/** The status label for one booking. "Pending" means two different waits:
 *  an online booking is already paid and waits for the admin to accept it,
 *  while a walk-in saved before any money came in waits for payment (it
 *  confirms itself on the first payment — app/api/payments). */
export const bookingStatusLabel = (b: { status: string; source?: string | null; noShow?: boolean; refundStatus?: string | null }) =>
  b.status === "Pending" && b.source === "Walk-In" ? "Awaiting payment" : statusLabel(statusKey(b));
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
  Operations: "Dashboard",              // the home screen: today's work, money and quick actions
  Tasks: "My Tasks",                    // the caretaker's phone screen: prepare, inspect, clean, upkeep
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
  Maintenance: "Website Maintenance",   // the switch that closes the public site
  Activity: "Activity History",         // was "Audit Log"
  Staff: "Staff Accounts",
  Settings: "Rates & Settings",
};

export const adminTabLabel = (t: AdminTab) => ADMIN_TAB_LABEL[t] ?? t;

/** Sidebar sections, top to bottom. */
// Six sections, one per kind of work. Each role sees only the screens it can
// open (canOpenTab), so a section with none of them disappears: a caretaker
// sees Today and Facilities, front desk adds Reservations and Money, and the
// super admin sees all six.
export const ADMIN_NAV_GROUPS: { label: string; tabs: AdminTab[] }[] = [
  { label: "TODAY", tabs: ["Operations", "Tasks"] },
  // Guest messages are about reservations, so they sit with them.
  { label: "RESERVATIONS", tabs: ["Bookings", "Occupancy", "Customer Service"] },
  { label: "MONEY", tabs: ["Sales", "Reports"] },
  { label: "FACILITIES", tabs: ["Facilities", "Inventory"] },
  { label: "WEBSITE", tabs: ["Rooms", "Packages", "Gallery", "Maintenance"] },
  // Who works here, the rates they work to, and the record of what was done.
  { label: "SETUP & HISTORY", tabs: ["Staff", "Settings", "Activity"] },
];
