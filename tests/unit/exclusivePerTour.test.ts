/* An Exclusive buyout is per tour.
 *
 * The bug these tests pin: an Exclusive Day Tour closed the whole date, so
 * the Night Tour could not be booked at all, Shared or Exclusive. Exclusive
 * is priced per tour, so the Night was being given away with the Day.
 * Now an Exclusive booking closes only the slot(s) it holds: a Day leaves
 * the Night open, while a Staycation, or a Day with overtime, still takes
 * the evening too.
 */

import type { Booking } from "@/types/booking";
import { checkBookingAvailability, checkPoolCapacity } from "@/lib/utils";

const DATE = "2026-11-05";
const booking = (over: Partial<Booking>): Booking => ({
  id: "B1", name: "Test", contact: "", email: "", date: DATE,
  guests: 20, package: "Day Tour", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  slot: "Day", resource: "Pool", tier: "Exclusive",
  ...over,
});

const exclusiveDay = booking({ id: "XD" });
const exclusiveNight = booking({ id: "XN", slot: "Night", package: "Night Tour" });

describe("an Exclusive Day Tour leaves the Night open", () => {
  it("takes a Shared Night group", () => {
    expect(checkBookingAvailability(DATE, "Night", 10, "Shared", "Pool", [exclusiveDay]).ok).toBe(true);
  });

  it("takes an Exclusive Night buyout", () => {
    expect(checkBookingAvailability(DATE, "Night", 30, "Exclusive", "Pool", [exclusiveDay]).ok).toBe(true);
  });

  it("still refuses anyone else in the Day", () => {
    const shared = checkBookingAvailability(DATE, "Day", 5, "Shared", "Pool", [exclusiveDay]);
    expect(shared.ok).toBe(false);
    expect(shared.reason).toContain("Day Tour");
    expect(checkBookingAvailability(DATE, "Day", 5, "Exclusive", "Pool", [exclusiveDay]).ok).toBe(false);
  });

  it("refuses a Staycation, which needs both tours", () => {
    expect(checkBookingAvailability(DATE, "WholeDay", 10, "Exclusive", "Pool", [exclusiveDay]).ok).toBe(false);
  });
});

describe("an Exclusive Night Tour leaves the Day open", () => {
  it("takes Shared and Exclusive Day groups", () => {
    expect(checkBookingAvailability(DATE, "Day", 10, "Shared", "Pool", [exclusiveNight]).ok).toBe(true);
    expect(checkBookingAvailability(DATE, "Day", 30, "Exclusive", "Pool", [exclusiveNight]).ok).toBe(true);
  });

  it("refuses a Day with overtime, which would run into the Night", () => {
    expect(checkPoolCapacity(DATE, "Day", 10, "Shared", [exclusiveNight], 2).ok).toBe(false);
  });
});

describe("an Exclusive booking that holds the evening still closes it", () => {
  it("closes the Night behind an Exclusive Day with overtime, and says why", () => {
    const late = booking({ id: "XL", overtime: 2 });
    const r = checkPoolCapacity(DATE, "Night", 10, "Shared", [late]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("overtime");
  });

  it("closes both tours behind a Staycation", () => {
    const stay = booking({ id: "XS", slot: "WholeDay", package: "Staycation" });
    expect(checkPoolCapacity(DATE, "Day", 5, "Shared", [stay]).ok).toBe(false);
    expect(checkPoolCapacity(DATE, "Night", 5, "Shared", [stay]).ok).toBe(false);
  });
});

describe("an Exclusive request needs only its own tour clear", () => {
  it("is refused when its tour already has a Shared group", () => {
    const sharedNight = booking({ id: "SN", slot: "Night", tier: "Shared", guests: 5 });
    const r = checkPoolCapacity(DATE, "Night", 30, "Exclusive", [sharedNight]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Night Tour");
  });

  it("is allowed when only the other tour has a Shared group", () => {
    const sharedDay = booking({ id: "SD", tier: "Shared", guests: 5 });
    expect(checkPoolCapacity(DATE, "Night", 30, "Exclusive", [sharedDay]).ok).toBe(true);
  });
});
