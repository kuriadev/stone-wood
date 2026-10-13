/* Who can book several dates, and what it costs.
 *
 * The rule the owner set: the Day and Night Tours are SINGLE-DATE visits.
 * Only the Staycation (the WholeDay slot) can span dates, because it is
 * the only slot that keeps the resort the guest's overnight. The calendar
 * never moves a booking there by itself; the guest chooses it.
 *
 * A Staycation is Exclusive only, and every day after the first carries
 * MULTI_DAY_DISCOUNT_PCT.
 */

import { priceBooking, pricingProblem } from "@/lib/pricing";
import { getPackageTier } from "@/lib/utils";
import { allowsMultiDay, multiDayProblem, MULTI_DAY_SLOT, SLOTS } from "@/lib/resort";
import {
  EXCLUSIVE_FLAT_RATE, SHARED_PER_HEAD_RATE, PACKAGE_BUNDLE_DISCOUNT_PCT,
  MULTI_DAY_DISCOUNT_PCT, MAX_STAY_DAYS, OVERTIME_RATE,
} from "@/lib/validators";

const pool = (over: Partial<Parameters<typeof priceBooking>[0]> = {}) =>
  priceBooking({ resource: "Pool", tier: "Shared", slot: "Day", guests: 10, overtime: 0, roomPrices: [], ...over });

/** One Whole Day, Exclusive: two slots at the flat rate, less the 10% bundle. */
const WHOLE_DAY_EXCLUSIVE = EXCLUSIVE_FLAT_RATE * 2 - Math.round(EXCLUSIVE_FLAT_RATE * 2 * PACKAGE_BUNDLE_DISCOUNT_PCT);

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

describe("days after the first are discounted", () => {
  it("charges one day at the full rate", () => {
    const one = pool({ slot: "WholeDay", tier: "Exclusive", days: 1 });
    expect(one.stayDiscount).toBe(0);
    expect(one.total).toBe(WHOLE_DAY_EXCLUSIVE);
  });

  it("takes 15% off the second and third day", () => {
    const three = pool({ slot: "WholeDay", tier: "Exclusive", days: 3 });
    const extra = Math.round(WHOLE_DAY_EXCLUSIVE * 2 * MULTI_DAY_DISCOUNT_PCT);
    expect(three.stayDiscount).toBe(extra);
    expect(three.total).toBe(WHOLE_DAY_EXCLUSIVE * 3 - extra);
    // Concretely: P32,400 becomes P29,160.
    expect(three.total).toBeLessThan(WHOLE_DAY_EXCLUSIVE * 3);
  });

  it("makes each extra day cheaper than the first", () => {
    const one = pool({ slot: "WholeDay", tier: "Exclusive", days: 1 }).total;
    const two = pool({ slot: "WholeDay", tier: "Exclusive", days: 2 }).total;
    expect(two - one).toBeLessThan(one);
  });

  it("discounts the room along with the tour", () => {
    // The stay discount is on the repeat of a whole day, not on one part
    // of it, so a room booked for the stay is discounted too.
    const withRoom = pool({ slot: "WholeDay", tier: "Exclusive", days: 3, roomPrices: [1500] });
    const perDay = WHOLE_DAY_EXCLUSIVE + 1500 * 2;
    expect(withRoom.perDay).toBe(perDay);
    expect(withRoom.stayDiscount).toBe(Math.round(perDay * 2 * MULTI_DAY_DISCOUNT_PCT));
  });

  it("does not discount overtime, which is charged once", () => {
    // Overtime is added by staff on the day it actually happened.
    const b = pool({ slot: "Day", tier: "Exclusive", overtime: 2, days: 1 });
    expect(b.overtimeFee).toBe(2 * OVERTIME_RATE);
    expect(b.total).toBe(b.perDay + 2 * OVERTIME_RATE);
  });
});

describe("a three-day Staycation", () => {
  it("halves the total for the down payment, rounded up", () => {
    const stay = pool({ slot: "WholeDay", tier: "Exclusive", guests: 6, days: 3 });
    expect(stay.total).toBe(WHOLE_DAY_EXCLUSIVE * 3 - Math.round(WHOLE_DAY_EXCLUSIVE * 2 * MULTI_DAY_DISCOUNT_PCT));
    expect(stay.down).toBe(Math.ceil(stay.total / 2));
  });
});
