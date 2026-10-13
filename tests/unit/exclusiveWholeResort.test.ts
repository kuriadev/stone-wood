/* Exclusive means the whole resort, the events venue included.
 *
 * checkPoolCapacity only looks at bookings that use the pool, and a
 * venue-only booking does not. So a group could rent just the hall on the
 * date of someone's Exclusive buyout, and a buyout could be made on a date
 * whose hall another group already had, while the guest was told "the whole
 * resort is yours". checkBookingAvailability now closes both directions.
 *
 * And Resort visit + Events Venue is Exclusive only: an event with the
 * resort to itself, never a party beside strangers in a shared pool.
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

describe("an Exclusive buyout keeps the events venue to itself", () => {
  it("refuses a venue-only booking on a buyout's date, in either slot", () => {
    expect(checkBookingAvailability(DATE, "Day", 20, "Exclusive", "Venue", [buyout]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "Night", 20, "Exclusive", "Venue", [buyout]).ok).toBe(false);
  });

  it("refuses a buyout on a date whose hall another group has", () => {
    expect(checkBookingAvailability(DATE, "Night", 10, "Exclusive", "Pool", [hall]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "WholeDay", 10, "Exclusive", "Pool", [hall]).ok).toBe(false);
    expect(checkBookingAvailability(DATE, "Night", 10, "Exclusive", "Pool+Venue", [hall]).ok).toBe(false);
  });

  it("treats a Pool + Venue buyout as the whole resort too", () => {
    const party = booking({ id: "P1", resource: "Pool+Venue", tier: "Exclusive", slot: "Day" });
    expect(checkBookingAvailability(DATE, "Night", 20, "Exclusive", "Venue", [party]).ok).toBe(false);
  });

  it("still lets a group rent only the hall beside shared tours", () => {
    expect(checkBookingAvailability(DATE, "Day", 20, "Exclusive", "Venue", [shared]).ok).toBe(true);
    // and shared groups can still join a date whose hall is rented
    expect(checkBookingAvailability(DATE, "Day", 5, "Shared", "Pool", [hall]).ok).toBe(true);
  });

  it("does not count a venue-only booking as a whole-resort buyout", () => {
    // Venue bookings are stored as Exclusive, but they don't take the pool.
    expect(checkBookingAvailability(DATE, "Night", 5, "Shared", "Pool", [hall]).ok).toBe(true);
  });
});

describe("Resort visit + Events Venue is Exclusive only", () => {
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
