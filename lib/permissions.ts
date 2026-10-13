// ── Who may do what
//
// The one table that decides it. The server checks every admin route
// against it (requirePermission in lib/auth.ts), and the admin screens read
// the same table to hide what a role can't use and to relabel what it can
// only ask for — so the screen and the server can never disagree.
//
// Pure data and functions: safe to import from client components.
//
// ── Three roles, matched to how StoneWood actually runs ──
//
//   Owner      Everything. Works the floor too, so nothing is hidden from
//              them, and they are the only one who can approve a request.
//   FrontDesk  The counter: bookings, walk-ins, payments, check-in and
//              settling a balance, guest messages.
//   Caretaker  The facilities: preparing them, the check-out inspection,
//              cleaning, upkeep, and the supplies those use.
//
// ── Requests ──
//
// Some actions cost the owner money or can't be undone: a refund, voiding a
// payment, cancelling or deleting a booking, writing off a balance, closing
// the day's cash count, removing a stock item or a facility, closing or
// reopening dates on the calendar. Front desk and caretakers can still
// start them; the server records the attempt as a request
// (lib/ownerRequests.server.ts) and the owner approves it with one tap.
// Nothing critical disappears on anyone's say-so but the owner's.
// REQUESTABLE says which.

import type { AdminTab } from "@/types/admin";

export type StaffRole = "Owner" | "FrontDesk" | "Caretaker";

export const STAFF_ROLES: StaffRole[] = ["Owner", "FrontDesk", "Caretaker"];

export const ROLE_LABEL: Record<StaffRole, string> = {
  Owner: "Super admin",
  FrontDesk: "Front desk",
  Caretaker: "Caretaker",
};

/** One line per role, for the Staff screen. */
export const ROLE_HINT: Record<StaffRole, string> = {
  Owner: "Approval and supervision. Can still do everything: approving requests, prices and staff accounts included.",
  FrontDesk: "Bookings, walk-ins, payments, check-in, guest messages and closing the day. Refunds, voids, cancellations and removals go to the super admin.",
  Caretaker: "Preparing facilities, check-out inspections, cleaning, pool upkeep and supplies. Works from a phone.",
};

export type Permission =
  // Reading
  | "ops.view"              // Daily Operations data (bookings, payments, inspections…)
  | "bookings.view"
  | "activity.viewAll"      // the whole activity log; others see their own lines
  // The counter
  | "bookings.edit"         // walk-ins, details, confirm, move, add a charge, check-in, archive, guest link, email
  | "payments.record"       // down payments, balances, penalties, settling
  | "expenses.record"
  | "messages.handle"       // guest messages and replies
  // Owner's decisions — front desk may request these
  | "bookings.cancel"       // cancel / mark a no-show
  | "bookings.resortCancel" // "Cancel (resort can't host)"
  | "bookings.delete"
  | "payments.refund"       // guest chose a refund, send a refund
  | "payments.void"
  | "expenses.void"
  | "payments.writeOff"     // settle a stay with money still unpaid
  | "day.close"             // the day's cash count
  // Owner only
  | "reschedules.decide"
  | "requests.decide"
  | "catalog.manage"        // rooms, packages, gallery, closed dates, damage rates, site maintenance
  | "facilities.manage"     // add/remove/rename facilities, edit checklists
  | "inventory.manage"      // items, minimums, upkeep schedule, supply defaults
  | "inventory.delete"      // remove a stock item (others request it)
  | "facilities.delete"     // remove or stop offering a facility (others request it)
  | "calendar.manage"       // close or reopen dates (front desk requests it)
  | "staff.manage"
  | "settings.manage"
  // The facilities
  | "facilities.view"
  | "facilities.status"     // mark a facility under maintenance / available, notes
  | "facilities.inspect"    // preparation and check-out inspections
  | "facilities.clean"
  | "inventory.view"
  | "inventory.use"         // record supplies used, breakage, a stock count
  | "inventory.buy";        // record a purchase (also an expense)

const ALL: Permission[] = [
  "ops.view", "bookings.view", "activity.viewAll",
  "bookings.edit", "payments.record", "expenses.record", "messages.handle",
  "bookings.cancel", "bookings.resortCancel", "bookings.delete", "payments.refund",
  "payments.void", "expenses.void", "payments.writeOff", "day.close",
  "reschedules.decide", "requests.decide", "catalog.manage", "facilities.manage",
  "inventory.manage", "inventory.delete", "facilities.delete", "calendar.manage", "staff.manage", "settings.manage",
  "facilities.view", "facilities.status", "facilities.inspect", "facilities.clean",
  "inventory.view", "inventory.use", "inventory.buy",
];

const GRANTS: Record<StaffRole, ReadonlySet<Permission>> = {
  Owner: new Set(ALL),
  FrontDesk: new Set<Permission>([
    "ops.view", "bookings.view",
    "bookings.edit", "payments.record", "expenses.record", "messages.handle",
    // The counter handles the money, including counting the drawer at the
    // end of the day. The owner is told when a count comes out short or
    // over (their My Tasks), and every closing is in the activity log.
    "day.close",
    "facilities.view", "facilities.status", "inventory.view", "inventory.use", "inventory.buy",
  ]),
  Caretaker: new Set<Permission>([
    "ops.view", "bookings.view",
    "facilities.view", "facilities.status", "facilities.inspect", "facilities.clean",
    "inventory.view", "inventory.use",
  ]),
};

/** Actions a role may ASK the owner to do, though it can't do them itself. */
const REQUESTABLE: Record<StaffRole, ReadonlySet<Permission>> = {
  Owner: new Set(),
  FrontDesk: new Set<Permission>([
    "bookings.cancel", "bookings.resortCancel", "bookings.delete",
    "payments.refund", "payments.void", "expenses.void", "payments.writeOff",
    "inventory.delete", "facilities.delete", "calendar.manage",
  ]),
  Caretaker: new Set<Permission>([
    "inventory.delete", "facilities.delete",
  ]),
};

export const isStaffRole = (v: unknown): v is StaffRole =>
  typeof v === "string" && (STAFF_ROLES as string[]).includes(v);

export function can(role: StaffRole | null | undefined, perm: Permission): boolean {
  return !!role && GRANTS[role].has(perm);
}

/** True when this role can't do `perm` itself but may send it to the owner. */
export function canRequest(role: StaffRole | null | undefined, perm: Permission): boolean {
  return !!role && !can(role, perm) && REQUESTABLE[role].has(perm);
}

export function permissionsOf(role: StaffRole): Permission[] {
  return ALL.filter((p) => GRANTS[role].has(p));
}

export function requestableOf(role: StaffRole): Permission[] {
  return ALL.filter((p) => REQUESTABLE[role].has(p));
}

/** What a request is for, in the owner's words. */
export const REQUEST_LABEL: Partial<Record<Permission, string>> = {
  "bookings.cancel": "Cancel a booking",
  "bookings.resortCancel": "Cancel (resort can't host)",
  "bookings.delete": "Delete a booking",
  "payments.refund": "Refund",
  "payments.void": "Void a payment",
  "expenses.void": "Void an expense",
  "payments.writeOff": "Close a stay with money unpaid",
  "day.close": "Close the day",
  "inventory.delete": "Remove a stock item",
  "facilities.delete": "Remove or stop offering a facility",
  "calendar.manage": "Close or reopen a date",
};

// ── Screens ──────────────────────────────────────────────────────────
/** The permission that opens each admin screen. The Dashboard and the
 *  bookings list are the counter's (they are mostly money); a caretaker
 *  works from My Tasks and can still see the calendar. */
const TAB_PERMISSION: Record<AdminTab, Permission> = {
  Operations: "bookings.edit",
  // Everyone has My Tasks; what is on it depends on the role (TasksTab).
  Tasks: "ops.view",
  Bookings: "bookings.edit",
  Occupancy: "bookings.view",
  Facilities: "facilities.view",
  Inventory: "inventory.view",
  Sales: "payments.record",
  Reports: "payments.record",
  Rooms: "catalog.manage",
  Packages: "catalog.manage",
  Gallery: "catalog.manage",
  "Customer Service": "messages.handle",
  Maintenance: "catalog.manage",
  Staff: "staff.manage",
  Settings: "settings.manage",
  Activity: "ops.view",
};

export function canOpenTab(role: StaffRole | null | undefined, tab: AdminTab): boolean {
  return can(role, TAB_PERMISSION[tab]);
}

/** Where each role lands after signing in. */
export function landingTab(role: StaffRole | null | undefined): AdminTab {
  return role === "Caretaker" ? "Tasks" : "Operations";
}
