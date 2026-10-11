import { FakeDb } from "./fakeDb";
import { inDays, makeBookingRow } from "./fixtures";

export const poolFacility = { id: 1, category: "Amenity", name: "Swimming Pool", icon: "pool", status: "Available", room_id: null, last_used_booking_id: null, last_used_guest_name: null, last_checked_at: null, notes: "", before_use_checklist: null, after_use_checklist: null, area: "Pool", description: "", show_on_site: true, active: true, created_at: "" };
export const venueFacility = { ...poolFacility, id: 2, name: "Events Venue", icon: "tent", area: "Venue" };
export const room1 = { id: 1, name: "Room 1", beds: "1 Queen", capacity: 4, price: 1500, description: "", img: "x", gallery: [], created_at: "" };
export const roomFacility = { ...poolFacility, id: 10, category: "Room", name: "Room 1", icon: "bed", room_id: 1, area: null };

export function freshDb(db: FakeDb) {
  db.tables = {};
  db.failures = {};
  db.log = [];
  db.seed("closed_dates", []).seed("packages", []).seed("rooms", [room1])
    .seed("facilities", [poolFacility, venueFacility, roomFacility])
    .seed("bookings", []).seed("payments", []).seed("damage_records", []).seed("damage_rates", [])
    .seed("facility_inspections", []).seed("date_change_requests", []).seed("inventory", []);
  return db;
}

export const draft = (o: Record<string, unknown> = {}) => ({
  resource: "Pool", tier: "Shared", slot: "Day", guests: 10, rooms: [], overtime: 0,
  date: inDays(7), endDate: inDays(7), name: "Juan Dela Cruz", email: "juan@gmail.com",
  contact: "09171234567", notes: "", payFull: false, ...o,
});

export { makeBookingRow, inDays };
