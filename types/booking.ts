export type BookingStatus = "On Hold" | "Confirmed" | "Completed" | "Cancelled";
export type BookingPackage = "Day Tour" | "Day Tour + Room" | "Event / Function" | "On-Site Reservation";

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
}
