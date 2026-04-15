export interface AdminCredentials {
  username: string;
  password: string;
}

export type AdminTab =
  | "Dashboard"
  | "Bookings"
  | "On-Site"
  | "Occupancy"
  | "Rooms"
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
  archivedAt?: string;
}
