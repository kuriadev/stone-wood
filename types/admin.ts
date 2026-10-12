// AdminCredentials used to live here. Admin auth moved server-side in
// lib/auth.ts — the credentials are env vars compared with a timing-safe
// hash and never reach the browser, so there is no client-side shape for
// them any more.

export type AdminTab =
  | "Operations"
  | "Tasks"
  | "Staff"
  | "Settings"
  | "Activity"
  | "Bookings"
  | "Occupancy"
  | "Rooms"
  | "Packages"
  | "Facilities"
  | "Gallery"
  | "Inventory"
  | "Sales"
  | "Reports"
  | "Customer Service"
  | "Maintenance";

export interface CustomerMessage {
  id: number;
  name: string;
  email: string;
  type: string;
  message: string;
  date: string;
  createdAt?: string;
  archivedAt?: string;
}

/** Something front desk asked the owner to do (lib/ownerRequests.server.ts):
 *  a refund, a void, a cancellation… It happens only if the owner approves. */
export interface OwnerRequest {
  id: number;
  /** The permission it needs, e.g. "payments.void". */
  kind: import("@/lib/permissions").Permission;
  /** "Void a payment" */
  label: string;
  status: "Pending" | "Approved" | "Declined" | "Withdrawn";
  method: string;
  path: string;
  /** One line the owner can decide on: "Void the ₱2,000 GCash payment on SW-10150 (Juan)." */
  summary: string;
  reason: string;
  bookingId: string | null;
  requestedBy: string | null;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Why the last approval attempt failed; the request stays Pending. */
  lastError: string | null;
}
