// ── What the guest pages know about other bookings
//
// GET /api/availability is public, so it sends each booking reduced to what
// availability needs — no id, name, email, contact, notes or amounts. The
// guest pages then turn each of those back into a Booking (slotToBooking)
// so AvailabilityCalendar, BookingDatePicker and the capacity helpers in
// lib/utils work on it unchanged. Personal fields are blank.

import type { Booking, BookingResource, BookingSlot, BookingStatus, BookingTier } from "@/types/booking";
import type { FacilityStatus } from "@/types/facility";

export interface AvailabilitySlot {
  date: string;
  /** Last day of the stay. Missing or null before the multi-day
   *  migration, when every booking was a single day. */
  end_date?: string | null;
  guests: number;
  status: BookingStatus;
  rooms: number[];
  resource: BookingResource | null;
  tier: BookingTier | null;
  slot: BookingSlot | null;
  /** Day overtime hours — a Day group with overtime also holds the Night. */
  overtime: number;
  /** Only used to tell a legacy night booking (no slot) from a day one. */
  package: string;
}

/**
 * The parts of a facility a guest is allowed to see.
 *
 * Deliberately narrow. A Facility row also carries `notes`, the caretaker
 * checklists, `lastUsedBookingId` and `lastUsedGuestName` — that last one is
 * a previous guest's name, so the whole row can never be returned publicly.
 * Only what blocks a booking is exposed.
 */
export interface AvailabilityFacility {
  id: number;
  category: "Amenity" | "Room";
  name: string;
  status: FacilityStatus;
  room_id: number | null;
}

/** One public slot as a Booking, for the shared availability helpers. */
export function slotToBooking(s: AvailabilitySlot, i: number): Booking {
  return {
    id: `slot-${i}`,
    name: "",
    contact: "",
    email: "",
    date: s.date,
    // Without it every stay reads as its first day alone, and the guest
    // calendar offers the rest of it as free.
    endDate: s.end_date ?? s.date,
    guests: s.guests,
    // Only whether it starts with "Night" matters (older rows have no
    // slot); nothing personal is in a package label.
    package: s.package ?? "",
    rooms: s.rooms ?? [],
    overtime: s.overtime ?? 0,
    total: 0,
    downpayment: 0,
    status: s.status,
    paymentProof: false,
    notes: "",
    resource: s.resource ?? undefined,
    tier: s.tier ?? undefined,
    slot: s.slot ?? undefined,
  };
}
