/* An Exclusive buyout's guest count is the guest's own.
 *
 * It used to be forced to RESORT_MAX_CAPACITY in two places - a useEffect
 * in Book Now and again on the server in bookingQuote - on the reasoning
 * that a buyout reserves all 30 places. It does, but the price never
 * depended on the number (EXCLUSIVE_FLAT_RATE is flat), so forcing it
 * bought nothing and cost something: every buyout told staff to expect
 * thirty arrivals for what is usually a private group of five.
 *
 * These pin the two things that must stay true now that the count moves:
 * the price must not follow it, and the DATE must still be closed to
 * everyone else however few guests are named.
 */

import type { Booking } from "@/types/booking";
import { priceBooking } from "@/lib/pricing";
import { checkPoolCapacity, getSharedPoolUsage } from "@/lib/utils";
import {
  EXCLUSIVE_DEFAULT_GUESTS, RESORT_MAX_CAPACITY, GUESTS_MIN,
} from "@/lib/validators";

const booking = (over: Partial<Booking>): Booking => ({
  id: "B1", name: "Test", contact: "", email: "", date: "2026-10-20",
  guests: 10, package: "Whole Day", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  ...over,
});

const exclusive = (guests: number, slot: "Day" | "Night" | "WholeDay" = "WholeDay") =>
  priceBooking({ resource: "Pool", tier: "Exclusive", slot, guests, overtime: 0, roomPrices: [] });

describe("the price ignores the headcount", () => {
  it("charges the same for 5 as for 30", () => {
    expect(exclusive(EXCLUSIVE_DEFAULT_GUESTS).total).toBe(exclusive(RESORT_MAX_CAPACITY).total);
  });

  it("charges the same at every count in between, and at the floor", () => {
    const flat = exclusive(RESORT_MAX_CAPACITY).total;
    for (const n of [GUESTS_MIN, 2, 5, 11, 17, 29, RESORT_MAX_CAPACITY]) {
      expect(exclusive(n).total).toBe(flat);
    }
  });

  it("holds for a single slot and for a multi-day stay too", () => {
    expect(exclusive(5, "Day").total).toBe(exclusive(30, "Day").total);
    const five = priceBooking({ resource: "Pool", tier: "Exclusive", slot: "WholeDay", guests: 5, overtime: 0, roomPrices: [], days: 3 });
    const thirty = priceBooking({ resource: "Pool", tier: "Exclusive", slot: "WholeDay", guests: 30, overtime: 0, roomPrices: [], days: 3 });
    expect(five.total).toBe(thirty.total);
  });

  it("starts an Exclusive booking well below capacity", () => {
    // The point of the default: it must be a number a small private group
    // would recognise, not the resort's ceiling.
    expect(EXCLUSIVE_DEFAULT_GUESTS).toBeGreaterThanOrEqual(GUESTS_MIN);
    expect(EXCLUSIVE_DEFAULT_GUESTS).toBeLessThan(RESORT_MAX_CAPACITY);
  });
});

describe("the date is still bought outright", () => {
  const fiveGuestBuyout = [booking({
    date: "2026-10-20", endDate: "2026-10-22", slot: "WholeDay",
    tier: "Exclusive", guests: EXCLUSIVE_DEFAULT_GUESTS,
  })];

  it("closes the date to a Shared group, both slots, every day of the stay", () => {
    for (const d of ["2026-10-20", "2026-10-21", "2026-10-22"]) {
      for (const slot of ["Day", "Night", "WholeDay"] as const) {
        const r = checkPoolCapacity(d, slot, 2, "Shared", fiveGuestBuyout);
        expect(r.ok).toBe(false);
        expect(r.reason).toContain("Exclusive");
      }
    }
  });

  it("closes it to another Exclusive request too", () => {
    expect(checkPoolCapacity("2026-10-21", "WholeDay", 30, "Exclusive", fiveGuestBuyout).ok).toBe(false);
  });

  it("does not leak the buyout's 5 guests into the Shared tally", () => {
    // An Exclusive booking is not sharing the pool, so it must not read as
    // "5 of 30 spots taken" - the date is closed outright, not part full.
    expect(getSharedPoolUsage("2026-10-21", fiveGuestBuyout, "Day").used).toBe(0);
  });

  it("frees the date again once the stay ends", () => {
    expect(checkPoolCapacity("2026-10-23", "Day", 2, "Shared", fiveGuestBuyout).ok).toBe(true);
  });
});
