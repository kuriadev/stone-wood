/* The pool and the events venue are booked independently.
 *
 * Owner's rule from 2026-10-27: an Exclusive pool buyout keeps the pool to
 * one group, and another group may still rent the events venue in the same
 * tour; a group that has the hall doesn't stop someone else buying out the
 * pool. Each part is still one group's: the hall takes one event per tour,
 * and an Exclusive pool takes no one else in the pool. (From 2026-09-25 an
 * Exclusive buyout took the hall too.)
 *
 * And Resort & pool + Events Venue is Exclusive only: an event with the
 * pool to itself, never a party beside strangers in a shared pool.
 */

import type { Booking } from "@/types/booking";
import { pricingProblem } from "@/lib/pricing";
import { checkBookingAvailability, getPackageTier } from "@/lib/utils";

const DATE = "2026-10-20";
const booking = (over: Partial<Booking>): Booking => ({
  id: "B1", name: "Test", contact: "", email: "", date: DATE,
  guests: 10, package: "Day Tour", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  slot: "Day", resource: "Pool", tier: "Shared",
  ...over,
});

const hall = booking({ id: "V1", resource: "Venue", tier: "Exclusive", slot: "Day", package: "Events Venue" });
const buyout = booking({ id: "X1", resource: "Pool", tier: "Exclusive", slot: "Day" });
const shared = booking({ id: "S1", resource: "Pool", tier: "Shared", slot: "Day", guests: 5 });
const party = booking({ id: "P1", resource: "Pool+Venue", tier: "Exclusive", slot: "Day" });

describe("the pool and the events venue are booked independently", () => {
  it("rents the hall to another group during an Exclusive pool buyout", () => {
    expect(checkBookingAvailability(DATE, "Day", 20, "Exclusive", "Venue", [buyout]).ok).toBe(true);
    expect(checkBookingAvailability(DATE, "Night", 20, "Exclusive", "Venue", [buyout]).ok).toBe(true);
  });

  it("lets a group buy out the pool while another group has the hall", () => {
    expect(checkBookingAvailability(DATE, "Day", 10, "Exclusive", "Pool", [hall]).ok).toBe(true);
    expect(checkBookingAvailability(DATE, "WholeDay", 10, "Exclusive", "Pool", [hall]).ok).toBe(true);
  });

  it("still takes one event per tour in the hall", () => {
    expect(checkBookingAvailability(DATE, "Day", 20, "Exclusive", "Venue", [hall]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "Day", 10, "Exclusive", "Pool+Venue", [hall]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "Day", 20, "Exclusive", "Venue", [party]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "Night", 20, "Exclusive", "Venue", [party]).ok).toBe(true);
  });

  it("still keeps an Exclusive pool to one group", () => {
    expect(checkBookingAvailability(DATE, "Day", 10, "Exclusive", "Pool", [buyout]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "Day", 5, "Shared", "Pool", [party]).ok).toBe(false);
  });

  it("leaves the hall alone when a buyout's overtime runs into the evening", () => {
    const late = booking({ id: "X2", resource: "Pool", tier: "Exclusive", slot: "Day", overtime: 2 });
    expect(checkBookingAvailability(DATE, "Night", 20, "Exclusive", "Venue", [late]).ok).toBe(true);
  });

  it("lets shared groups and the hall share a tour", () => {
    expect(checkBookingAvailability(DATE, "Day", 20, "Exclusive", "Venue", [shared]).ok).toBe(true);
    expect(checkBookingAvailability(DATE, "Day", 5, "Shared", "Pool", [hall]).ok).toBe(true);
  });
});

describe("Resort & pool + Events Venue is Exclusive only", () => {
  it("refuses it Shared, for tours and stays alike", () => {
    expect(pricingProblem("Pool+Venue", "Shared", "Day")).not.toBeNull();
    expect(pricingProblem("Pool+Venue", "Shared", "Night")).not.toBeNull();
    expect(pricingProblem("Pool+Venue", "Exclusive", "Day")).toBeNull();
  });

  it("defaults it to Exclusive whatever the group size", () => {
    expect(getPackageTier(4, "Day", "Pool+Venue")).toBe("Exclusive");
    expect(getPackageTier(4, "Day", "Pool")).toBe("Shared");
  });
});
