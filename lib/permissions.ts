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
  FrontDesk: "Bookings, walk-ins, payments, check-in, no-shows, guest messages and closing the day. Refunds, voids, cancellations and removals go to the super admin.",
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
  | "bookings.noshow"       // mark a no-show, and approve the new date the guest then picks
  | "bookings.refunded"     // mark a resort-cancelled booking refunded, after arranging it with the guest
  // Owner's decisions — front desk may request these
  | "bookings.cancel"       // cancel a booking
  | "bookings.resortCancel" // "Cancel (resort can't host)"
  | "bookings.delete"
  | "payments.refund"       // retired: refunds are arranged with the guest and marked with bookings.refunded
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
  | "calendar.manage"       // close or reopen dates (front desk may, without asking)
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
  "bookings.edit", "payments.record", "expenses.record", "messages.handle", "bookings.noshow", "bookings.refunded",
  "bookings.cancel", "bookings.resortCancel", "bookings.delete", "payments.refund",
  "payments.void", "expenses.void", "payments.writeOff", "day.close",
  "reschedules.decide", "requests.decide", "catalog.manage", "facilities.manage",
  "inventory.manage", "inventory.delete", "facilities.delete", "calendar.manage", "staff.manage", "settings.manage",
  "facilities.view", "facilities.status", "facilities.inspect", "facilities.clean",
  "inventory.view", "inventory.use", "inventory.buy",
];

/* The built-in defaults. The super admin can change what Front desk and
   Caretaker may do (Staff Accounts → Roles & permissions); those choices
   are applied over these by applyRoleOverrides, on the server before every
   check and in each person's browser from /api/auth/me. */
const DEFAULT_GRANTS: Record<StaffRole, ReadonlySet<Permission>> = {
  Owner: new Set(ALL),
  FrontDesk: new Set<Permission>([
    "ops.view", "bookings.view",
    "bookings.edit", "payments.record", "expenses.record", "messages.handle",
    // The desk is who sees a group not turn up, so it marks the no-show and
    // handles the new date the guest picks, without waiting on the owner.
    "bookings.noshow",
    // Refunds are agreed with the guest by call or chat; whoever did that
    // marks the booking refunded, without waiting on the owner.
    "bookings.refunded",
    // The counter handles the money, including counting the drawer at the
    // end of the day. The owner is told when a count comes out short or
    // over (their My Tasks), and every closing is in the activity log.
    "day.close",
    // Closing or reopening a date on the Booking Calendar: the desk does it
    // straight away, no request to the owner (it's in the activity log).
    "calendar.manage",
    "facilities.view", "facilities.status", "inventory.view", "inventory.use", "inventory.buy",
  ]),
  Caretaker: new Set<Permission>([
    "ops.view", "bookings.view",
    "facilities.view", "facilities.status", "facilities.inspect", "facilities.clean",
    "inventory.view", "inventory.use",
  ]),
};

/** Actions a role may ASK the owner to do, though it can't do them itself. */
const DEFAULT_REQUESTABLE: Record<StaffRole, ReadonlySet<Permission>> = {
  Owner: new Set(),
  FrontDesk: new Set<Permission>([
    "bookings.cancel", "bookings.resortCancel", "bookings.delete",
    "payments.refund", "payments.void", "expenses.void", "payments.writeOff",
    "inventory.delete", "facilities.delete",
  ]),
  Caretaker: new Set<Permission>([
    "inventory.delete", "facilities.delete",
  ]),
};

let GRANTS: Record<StaffRole, ReadonlySet<Permission>> = { ...DEFAULT_GRANTS };
let REQUESTABLE: Record<StaffRole, ReadonlySet<Permission>> = { ...DEFAULT_REQUESTABLE };

/** Never anyone's but a super admin's, so nobody can be locked out of
 *  fixing the accounts, the settings or the approvals. */
export const LOCKED_PERMISSIONS: Permission[] = ["staff.manage", "settings.manage", "requests.decide", "reschedules.decide"];

/** What one role may do: itself, or by asking the super admin. */
export interface RolePermissionSet { grants: Permission[]; requests: Permission[] }
export type EditableRole = "FrontDesk" | "Caretaker";
export const EDITABLE_ROLES: EditableRole[] = ["FrontDesk", "Caretaker"];
export type RoleOverrides = Partial<Record<EditableRole, RolePermissionSet>>;

export function defaultRolePermissions(role: EditableRole): RolePermissionSet {
  return { grants: ALL.filter((p) => DEFAULT_GRANTS[role].has(p)), requests: ALL.filter((p) => DEFAULT_REQUESTABLE[role].has(p)) };
}

/** A clean set from anything stored or sent: known permissions only, the
 *  locked ones never, and nothing both allowed and asked for. */
export function cleanRoleSet(raw: unknown): RolePermissionSet | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { grants?: unknown; requests?: unknown };
  const pick = (v: unknown) => (Array.isArray(v) ? v : []).filter((p): p is Permission => (ALL as string[]).includes(p as string) && !LOCKED_PERMISSIONS.includes(p as Permission));
  const grants = [...new Set(pick(r.grants))];
  const requests = [...new Set(pick(r.requests))].filter((p) => !grants.includes(p));
  return { grants, requests };
}

export function validateRoleOverrides(raw: unknown): RoleOverrides {
  const out: RoleOverrides = {};
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const role of EDITABLE_ROLES) {
    const set = cleanRoleSet(r[role]);
    if (set) out[role] = set;
  }
  return out;
}

/** Use these choices (missing roles keep the defaults). The super admin's
 *  own powers never change. */
export function applyRoleOverrides(o: RoleOverrides): void {
  GRANTS = { ...DEFAULT_GRANTS };
  REQUESTABLE = { ...DEFAULT_REQUESTABLE };
  for (const role of EDITABLE_ROLES) {
    const set = o[role];
    if (!set) continue;
    GRANTS[role] = new Set(set.grants);
    REQUESTABLE[role] = new Set(set.requests);
  }
}

/** Every permission a super admin can hand out, in plain words, grouped
 *  the way the Roles & permissions window shows them. */
export const PERMISSION_INFO: { perm: Permission; group: string; label: string; hint: string; requestable?: boolean }[] = [
  { perm: "ops.view", group: "Seeing", label: "See today's work", hint: "Bookings, payments and inspections behind My Tasks and the Dashboard." },
  { perm: "bookings.view", group: "Seeing", label: "See the booking calendar", hint: "Who is booked on which date." },
  { perm: "activity.viewAll", group: "Seeing", label: "See everyone's activity", hint: "The whole Activity History, not only their own lines." },
  { perm: "bookings.edit", group: "Bookings", label: "Handle bookings", hint: "Dashboard, walk-ins, details, confirm, move, add charges, check in and out." },
  { perm: "messages.handle", group: "Bookings", label: "Answer guest messages", hint: "Customer Service and replies." },
  { perm: "bookings.noshow", group: "Bookings", label: "Mark a no-show", hint: "And approve the new date the guest picks within 20 days.", requestable: true },
  { perm: "bookings.refunded", group: "Bookings", label: "Mark a booking refunded", hint: "After agreeing the refund with the guest by call or chat (resort cancellations only)." },
  { perm: "bookings.cancel", group: "Bookings", label: "Cancel a booking", hint: "", requestable: true },
  { perm: "bookings.resortCancel", group: "Bookings", label: "Cancel because the resort can't host", hint: "The guest then picks a new date or a refund.", requestable: true },
  { perm: "bookings.delete", group: "Bookings", label: "Delete a booking", hint: "", requestable: true },
  { perm: "payments.record", group: "Money", label: "Record payments", hint: "Down payments, balances, penalties and settling a stay." },
  { perm: "expenses.record", group: "Money", label: "Record expenses", hint: "Money spent." },
  { perm: "day.close", group: "Money", label: "Close the day", hint: "Count the cash box.", requestable: true },
  { perm: "payments.void", group: "Money", label: "Void a payment", hint: "", requestable: true },
  { perm: "expenses.void", group: "Money", label: "Void an expense", hint: "", requestable: true },
  { perm: "payments.writeOff", group: "Money", label: "Close a stay with money unpaid", hint: "", requestable: true },
  { perm: "facilities.view", group: "Facilities", label: "See facilities", hint: "Facility Management." },
  { perm: "facilities.status", group: "Facilities", label: "Mark facilities available or under maintenance", hint: "And add notes." },
  { perm: "facilities.inspect", group: "Facilities", label: "Prepare and inspect facilities", hint: "Before arrival and at check-out." },
  { perm: "facilities.clean", group: "Facilities", label: "Mark facilities cleaned", hint: "" },
  { perm: "facilities.manage", group: "Facilities", label: "Add and edit facilities", hint: "Names, checklists, website photos." },
  { perm: "facilities.delete", group: "Facilities", label: "Remove a facility", hint: "", requestable: true },
  { perm: "inventory.view", group: "Supplies", label: "See supplies", hint: "Supplies & Equipment." },
  { perm: "inventory.use", group: "Supplies", label: "Record supplies used", hint: "Use, breakage and stock counts." },
  { perm: "inventory.buy", group: "Supplies", label: "Record a purchase", hint: "Also saved as an expense." },
  { perm: "inventory.manage", group: "Supplies", label: "Add and edit supply items", hint: "Items, minimums and the upkeep schedule." },
  { perm: "inventory.delete", group: "Supplies", label: "Remove a supply item", hint: "", requestable: true },
  { perm: "catalog.manage", group: "Website & calendar", label: "Edit rooms, packages and the website", hint: "Photos, home page cards, damage rates." },
  { perm: "calendar.manage", group: "Website & calendar", label: "Close or reopen dates", hint: "", requestable: true },
];

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
