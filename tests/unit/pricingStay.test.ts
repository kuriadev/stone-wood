/* Who can book several dates, and what it costs.
 *
 * The rule the owner set: the Day and Night Tours are SINGLE-DATE visits.
 * Only the Whole Day can span dates, because it is the only slot that
 * keeps the resort the guest's overnight. Picking a second date moves the
 * booking to the Whole Day rather than refusing it.
 *
 * The money that rule depends on: a Whole Day used to be Exclusive-only,
 * so a family of six picking three dates was silently moved onto a
 * P10,800-a-day whole-resort buyout - P32,400 for a pool they wanted to
 * share. Whole Day is now offered Shared as well, and every day after the
 * first carries MULTI_DAY_DISCOUNT_PCT.
 */

import { priceBooking, pricingProblem } from "@/lib/pricing";
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
    expect(pricingProblem("Pool", "Shared", "WholeDay", 3)).toBeNull();
    // The default keeps the call sites that only validate a shape working.
    expect(pricingProblem("Pool", "Shared", "Day")).toBeNull();
  });
});

describe("a Whole Day is no longer Exclusive-only", () => {
  it("prices a small group's Whole Day per head, not as a buyout", () => {
    const six = pool({ slot: "WholeDay", tier: "Shared", guests: 6 });
    // Two slots at P200 a head.
    expect(six.total).toBe(SHARED_PER_HEAD_RATE * 6 * 2);
    expect(six.total).toBeLessThan(WHOLE_DAY_EXCLUSIVE);
  });

  it("still offers the buyout, and it wins for a big group", () => {
    const thirty = pool({ slot: "WholeDay", tier: "Shared", guests: 30 });
    const buyout = pool({ slot: "WholeDay", tier: "Exclusive", guests: 30 });
    expect(buyout.total).toBe(WHOLE_DAY_EXCLUSIVE);
    // Sharing stops being the cheaper answer once the group is big enough.
    expect(thirty.total).toBeGreaterThan(buyout.total);
  });

  it("no longer refuses the combination", () => {
    expect(pricingProblem("Pool", "Shared", "WholeDay")).toBeNull();
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

describe("the family this was for", () => {
  it("prices three days for six guests within reach", () => {
    const stay = pool({ slot: "WholeDay", tier: "Shared", guests: 6, days: 3 });
    const perDay = SHARED_PER_HEAD_RATE * 6 * 2; // P2,400
    expect(stay.perDay).toBe(perDay);
    expect(stay.total).toBe(perDay * 3 - Math.round(perDay * 2 * MULTI_DAY_DISCOUNT_PCT));
    // Against P32,400 under the old forced-Exclusive rule.
    expect(stay.total).toBeLessThan(WHOLE_DAY_EXCLUSIVE);
  });

  it("halves the total for the down payment, rounded up", () => {
    const stay = pool({ slot: "WholeDay", tier: "Shared", guests: 6, days: 3 });
    expect(stay.down).toBe(Math.ceil(stay.total / 2));
  });
});
