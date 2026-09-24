export interface AdminCredentials {
  username: string;
  password: string;
}

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
