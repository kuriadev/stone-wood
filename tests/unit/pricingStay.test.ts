/* Who can book several dates, and what it costs.
 *
 * The rule the owner set: the Day and Night Tours are SINGLE-DATE visits.
 * Only the Staycation (the WholeDay slot) can span dates, because it is
 * the only slot that keeps the resort the guest's overnight. The calendar
 * never moves a booking there by itself; the guest chooses it.
 *
 * A Staycation is Exclusive only, and every day of it costs the same:
 * there are no automatic discounts (owner's call, 2026-10-27).
 */

import { priceBooking, pricingProblem } from "@/lib/pricing";
import { getPackageTier } from "@/lib/utils";
import { allowsMultiDay, multiDayProblem, MULTI_DAY_SLOT, SLOTS } from "@/lib/resort";
import {
  EXCLUSIVE_FLAT_RATE, SHARED_PER_HEAD_RATE, MAX_STAY_DAYS, OVERTIME_RATE,
} from "@/lib/validators";

const pool = (over: Partial<Parameters<typeof priceBooking>[0]> = {}) =>
  priceBooking({ resource: "Pool", tier: "Shared", slot: "Day", guests: 10, overtime: 0, roomPrices: [], ...over });

/** One Whole Day, Exclusive: two slots at the flat rate. */
const WHOLE_DAY_EXCLUSIVE = EXCLUSIVE_FLAT_RATE * 2;

describe("only the Whole Day can span dates", () => {
  it("lets the Whole Day run for several days", () => {
    expect(allowsMultiDay("WholeDay")).toBe(true);
    expect(multiDayProblem("WholeDay", MAX_STAY_DAYS)).toBeNull();
  });

  it("refuses a multi-date Day or Night Tour, and names the way out", () => {
    for (const slot of ["Day", "Night"] as const) {
      expect(allowsMultiDay(slot)).toBe(false);
      const why = multiDayProblem(slot, 2)!;
      expect(why).toContain(SLOTS[slot].label);
      expect(why).toContain(SLOTS[MULTI_DAY_SLOT].label);
    }
  });

  it("leaves single-date Day and Night bookings alone", () => {
    expect(multiDayProblem("Day", 1)).toBeNull();
    expect(multiDayProblem("Night", 1)).toBeNull();
  });

  it("is enforced by pricingProblem, which the server calls", () => {
    expect(pricingProblem("Pool", "Shared", "Day", 3)).not.toBeNull();
    expect(pricingProblem("Pool", "Exclusive", "WholeDay", 3)).toBeNull();
    // The default keeps the call sites that only validate a shape working.
    expect(pricingProblem("Pool", "Shared", "Day")).toBeNull();
  });
});

describe("a Staycation is Exclusive only", () => {
  it("refuses a Shared Staycation, on one date or several", () => {
    expect(pricingProblem("Pool", "Shared", "WholeDay")).not.toBeNull();
    expect(pricingProblem("Pool", "Shared", "WholeDay", 3)).not.toBeNull();
    expect(pricingProblem("Pool+Venue", "Shared", "WholeDay")).not.toBeNull();
  });

  it("allows the Exclusive one", () => {
    expect(pricingProblem("Pool", "Exclusive", "WholeDay")).toBeNull();
    expect(pool({ slot: "WholeDay", tier: "Exclusive", guests: 6 }).total).toBe(WHOLE_DAY_EXCLUSIVE);
  });

  it("defaults a Staycation to Exclusive, whatever the group size", () => {
    expect(getPackageTier(6, "WholeDay")).toBe("Exclusive");
    expect(getPackageTier(6, "Day")).toBe("Shared");
    expect(getPackageTier(6, "Night")).toBe("Shared");
  });

  it("is never the events venue on its own, except in the owner's packages", () => {
    expect(pricingProblem("Venue", "Exclusive", "WholeDay")).not.toBeNull();
    expect(pricingProblem("Venue", "Exclusive", "WholeDay", 2)).not.toBeNull();
    expect(pricingProblem("Pool+Venue", "Exclusive", "WholeDay")).toBeNull();
    expect(pricingProblem("Pool", "Exclusive", "WholeDay")).toBeNull();
    // A package (e.g. "Events Venue — Whole Day") is the owner's to define.
    expect(pricingProblem("Venue", "Exclusive", "WholeDay", 1, true)).toBeNull();
    // The tours can still be venue-only.
    expect(pricingProblem("Venue", "Exclusive", "Day")).toBeNull();
    expect(pricingProblem("Venue", "Exclusive", "Night")).toBeNull();
  });

  it("still offers the tours at both tiers", () => {
    for (const slot of ["Day", "Night"] as const) {
      expect(pricingProblem("Pool", "Shared", slot)).toBeNull();
      expect(pricingProblem("Pool", "Exclusive", slot)).toBeNull();
    }
  });
});

describe("every day of a stay costs the same", () => {
  it("charges one day at the flat rate", () => {
    expect(pool({ slot: "WholeDay", tier: "Exclusive", days: 1 }).total).toBe(WHOLE_DAY_EXCLUSIVE);
    // A single Exclusive tour is the plain rate too: no 5% off any more.
    expect(pool({ slot: "Day", tier: "Exclusive", days: 1 }).total).toBe(EXCLUSIVE_FLAT_RATE);
  });

  it("charges the second and third day like the first", () => {
    expect(pool({ slot: "WholeDay", tier: "Exclusive", days: 3 }).total).toBe(WHOLE_DAY_EXCLUSIVE * 3);
  });

  it("charges a room for every day of the stay", () => {
    const withRoom = pool({ slot: "WholeDay", tier: "Exclusive", days: 3, roomPrices: [1500] });
    const perDay = WHOLE_DAY_EXCLUSIVE + 1500 * 2;
    expect(withRoom.perDay).toBe(perDay);
    expect(withRoom.total).toBe(perDay * 3);
  });

  it("adds overtime once, on the day it happened", () => {
    const b = pool({ slot: "Day", tier: "Exclusive", overtime: 2, days: 1 });
    expect(b.overtimeFee).toBe(2 * OVERTIME_RATE);
    expect(b.total).toBe(b.perDay + 2 * OVERTIME_RATE);
  });

  it("prices the pool and venue together at their plain rates", () => {
    const party = pool({ resource: "Pool+Venue", tier: "Exclusive", slot: "Day" });
    expect(party.poolFee + party.venueFee).toBe(party.total);
  });

  it("keeps a package's own price for the pool and venue part", () => {
    const pkg = priceBooking({ pkg: { price: 5000, requiresRoom: true }, resource: "Pool", tier: "Exclusive", slot: "Day", guests: 10, overtime: 0, roomPrices: [2000] });
    expect(pkg.total).toBe(5000 + 2000);
  });
});

describe("a three-day Staycation", () => {
  it("halves the total for the down payment, rounded up", () => {
    const stay = pool({ slot: "WholeDay", tier: "Exclusive", guests: 6, days: 3 });
    expect(stay.total).toBe(WHOLE_DAY_EXCLUSIVE * 3);
    expect(stay.down).toBe(Math.ceil(stay.total / 2));
  });
});
