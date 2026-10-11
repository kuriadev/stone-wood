/**
 * TC-01 (calendar reflects availability), TC-04 (over-capacity blocked) and the
 * "real-time calendar synchronisation" rule: a cancelled booking must free its
 * slot, and every new booking must close it, using the same functions the
 * public calendar and the server both call.
 */
import { checkBookingAvailability, checkRangeAvailability, roomsTakenOn, roomsTakenInRange, holdsDate } from "@/lib/utils";
import { RESORT_MAX_CAPACITY } from "@/lib/validators";
import { makeBooking, inDays, pinToday } from "../helpers/fixtures";

// Pinned at module load (not beforeAll): the date constants below are built during collection.
pinToday();
afterAll(() => jest.useRealTimers());

const D = inDays(7);
const shared = (guests: number, slot: any = "Day", extra: any = {}) =>
  makeBooking({ id: `S${guests}${slot}`, guests, slot, tier: "Shared", resource: "Pool", date: D, ...extra });

describe("Shared pool capacity (TC-04)", () => {
  it("the resort holds 30 shared guests per slot", () => {
    expect(RESORT_MAX_CAPACITY).toBe(30);
  });

  it("accepts a group that exactly fills the slot", () => {
    expect(checkBookingAvailability(D, "Day", 20, "Shared", "Pool", [shared(10)]).ok).toBe(true);
  });

  it("blocks a group that would exceed the remaining capacity, and says why", () => {
    const r = checkBookingAvailability(D, "Day", 21, "Shared", "Pool", [shared(10)]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Shared capacity is full/);
    expect(r.reason).toMatch(/10\/30/);
  });

  it("Day and Night are independent: a full Day does not block the Night", () => {
    const fullDay = [shared(30, "Day")];
    expect(checkBookingAvailability(D, "Day", 1, "Shared", "Pool", fullDay).ok).toBe(false);
    expect(checkBookingAvailability(D, "Night", 30, "Shared", "Pool", fullDay).ok).toBe(true);
  });

  it("other dates are unaffected", () => {
    expect(checkBookingAvailability(inDays(8), "Day", 30, "Shared", "Pool", [shared(30)]).ok).toBe(true);
  });
});

describe("Exclusive buyouts take the whole date", () => {
  it("an Exclusive booking blocks every other booking that date", () => {
    const ex = makeBooking({ tier: "Exclusive", guests: 30, slot: "Day", date: D });
    expect(checkBookingAvailability(D, "Night", 1, "Shared", "Pool", [ex]).ok).toBe(false);
  });
  it("a new Exclusive request needs the date completely clear", () => {
    const r = checkBookingAvailability(D, "Day", 30, "Exclusive", "Pool", [shared(2, "Night")]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already has bookings/);
  });
});

describe("Events venue is one event per slot (TC-03/04)", () => {
  const venue = makeBooking({ resource: "Venue", tier: "Exclusive", slot: "Day", date: D, guests: 20 });
  it("blocks a second venue booking in the same slot, allows the other slot", () => {
    expect(checkBookingAvailability(D, "Day", 10, "Exclusive", "Venue", [venue]).ok).toBe(false);
    expect(checkBookingAvailability(D, "Night", 10, "Exclusive", "Venue", [venue]).ok).toBe(true);
  });
});

describe("Overtime", () => {
  it("a Day group with overtime also holds the Night", () => {
    const ot = shared(5, "Day", { overtime: 1 });
    const r = checkBookingAvailability(D, "Night", 1, "Shared", "Pool", [ot]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/overtime/);
  });
});

describe("Maintenance closures", () => {
  const closed = (name: string) => [{ id: 1, category: "Amenity", name, status: "Under Maintenance" }] as any;
  it("pool Under Maintenance blocks pool bookings", () => {
    expect(checkBookingAvailability(D, "Day", 1, "Shared", "Pool", [], closed("Swimming Pool")).reason).toMatch(/pool is temporarily closed/);
  });
  it("venue Under Maintenance blocks venue bookings only", () => {
    expect(checkBookingAvailability(D, "Day", 1, "Exclusive", "Venue", [], closed("Events Venue")).ok).toBe(false);
    expect(checkBookingAvailability(D, "Day", 1, "Shared", "Pool", [], closed("Events Venue")).ok).toBe(true);
  });
});

describe("Calendar synchronisation: bookings close slots, cancellations reopen them (TC-01, TC-06-cancel)", () => {
  it("Cancelled and ResortCancelled bookings no longer hold the date", () => {
    expect(holdsDate({ status: "Confirmed" })).toBe(true);
    expect(holdsDate({ status: "Pending" })).toBe(true);
    expect(holdsDate({ status: "Cancelled" })).toBe(false);
    expect(holdsDate({ status: "ResortCancelled" })).toBe(false);
  });

  it("a full slot reopens the moment its booking is cancelled", () => {
    const live = shared(30);
    expect(checkBookingAvailability(D, "Day", 5, "Shared", "Pool", [live]).ok).toBe(false);
    expect(checkBookingAvailability(D, "Day", 5, "Shared", "Pool", [{ ...live, status: "Cancelled" }]).ok).toBe(true);
  });

  it("a Pending booking already holds the slot (no double booking before the owner accepts)", () => {
    expect(checkBookingAvailability(D, "Day", 5, "Shared", "Pool", [shared(30, "Day", { status: "Pending" })]).ok).toBe(false);
  });
});

describe("Rooms are per slot", () => {
  const withRoom = makeBooking({ rooms: [7], slot: "Day", date: D });
  it("a Day guest's room is free again for the Night, but not for another Day guest", () => {
    expect(roomsTakenOn(D, "Day", [withRoom]).has(7)).toBe(true);
    expect(roomsTakenOn(D, "Night", [withRoom]).has(7)).toBe(false);
  });
  it("a Whole Day booking holds the room for both slots", () => {
    const whole = makeBooking({ rooms: [7], slot: "WholeDay", tier: "Exclusive", date: D });
    expect(roomsTakenOn(D, "Night", [whole]).has(7)).toBe(true);
  });
});

describe("Multi-day stays", () => {
  const stay = makeBooking({ date: inDays(10), endDate: inDays(12), guests: 30, slot: "Day", rooms: [3] });
  it("every day of the range is checked, and the failing day is named", () => {
    const r = checkRangeAvailability(inDays(9), inDays(11), "Day", 5, "Shared", "Pool", [stay]);
    expect(r.ok).toBe(false);
    expect(r.date).toBe(inDays(10));
  });
  it("a room taken on any day of the range cannot be sold for the whole stay", () => {
    expect(roomsTakenInRange(inDays(9), inDays(11), "Day", [stay]).has(3)).toBe(true);
    expect(roomsTakenInRange(inDays(13), inDays(14), "Day", [stay]).has(3)).toBe(false);
  });
});
