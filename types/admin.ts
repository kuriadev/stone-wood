// AdminCredentials used to live here. Admin auth moved server-side in
// lib/auth.ts — the credentials are env vars compared with a timing-safe
// hash and never reach the browser, so there is no client-side shape for
// them any more.

export type AdminTab =
  | "Dashboard"
  | "Bookings"
  | "Walk-In"
  | "Occupancy"
  | "Rooms"
  | "Packages"
  | "Facilities"
  | "Gallery"
  | "Inventory"
  | "Analytics"
  | "Reports"
  | "Customer Service";

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
