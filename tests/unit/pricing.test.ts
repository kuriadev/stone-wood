/**
 * TC-02 (fixed package price + summary) and TC-03 (manual/custom total computed
 * correctly). Pure functions: the browser and the server run this same code.
 * Rates from lib/validators.ts: shared ₱200/head/slot, exclusive ₱6,000/slot,
 * venue ₱5,000/slot, overtime ₱500/hr.
 */
import { priceBooking, pricingProblem, bookingLabel, standardPackagePrice } from "@/lib/pricing";

const base = { overtime: 0, roomPrices: [] as number[] };

describe("priceBooking — custom booking totals (TC-03)", () => {
  it("Shared pool is per head per slot, down payment is 50% rounded up", () => {
    const p = priceBooking({ ...base, resource: "Pool", tier: "Shared", slot: "Day", guests: 10 });
    expect(p.total).toBe(2000);
    expect(p.down).toBe(1000);
    const odd = priceBooking({ ...base, resource: "Pool", tier: "Shared", slot: "Day", guests: 3 });
    expect(odd.total).toBe(600);
    const oddDown = priceBooking({ ...base, resource: "Pool", tier: "Shared", slot: "Day", guests: 1, roomPrices: [333] });
    expect(oddDown.total).toBe(533);
    expect(oddDown.down).toBe(267); // ceil(533 / 2)
  });

  it("Exclusive pool, one slot: ₱6,000 less the 5% exclusive discount", () => {
    const p = priceBooking({ ...base, resource: "Pool", tier: "Exclusive", slot: "Day", guests: 30 });
    expect(p.exclusiveDiscount).toBe(300);
    expect(p.total).toBe(5700);
  });

  it("Whole Day exclusive: ₱12,000 less 10% bundle = ₱10,800 (no stacking with the 5%)", () => {
    const p = priceBooking({ ...base, resource: "Pool", tier: "Exclusive", slot: "WholeDay", guests: 30 });
    expect(p.slots).toBe(2);
    expect(p.bundleDiscount).toBe(1200);
    expect(p.exclusiveDiscount).toBe(0);
    expect(p.total).toBe(10800);
  });

  it("Pool + Venue, one slot: ₱11,000 → ₱9,900; Whole Day: ₱22,000 → ₱19,800", () => {
    expect(priceBooking({ ...base, resource: "Pool+Venue", tier: "Exclusive", slot: "Day", guests: 30 }).total).toBe(9900);
    expect(priceBooking({ ...base, resource: "Pool+Venue", tier: "Exclusive", slot: "WholeDay", guests: 30 }).total).toBe(19800);
  });

  it("Venue alone is ₱5,000 per slot and always exclusive, whatever tier is sent", () => {
    const p = priceBooking({ ...base, resource: "Venue", tier: "Shared", slot: "Night", guests: 5 });
    expect(p.venueFee).toBe(5000);
    expect(p.poolFee).toBe(0);
  });

  it("rooms are charged per slot, and ×2 on a Whole Day", () => {
    expect(priceBooking({ ...base, resource: "Pool", tier: "Shared", slot: "Day", guests: 5, roomPrices: [1500, 2000] }).total).toBe(1000 + 3500);
    expect(priceBooking({ ...base, resource: "Pool", tier: "Exclusive", slot: "WholeDay", guests: 30, roomPrices: [1500] }).total).toBe(10800 + 3000);
  });

  it("overtime is ₱500/hr and Day-only; a Night booking ignores it", () => {
    expect(priceBooking({ ...base, overtime: 2, resource: "Pool", tier: "Shared", slot: "Day", guests: 1 }).total).toBe(200 + 1000);
    expect(priceBooking({ ...base, overtime: 2, resource: "Pool", tier: "Shared", slot: "Night", guests: 1 }).overtimeFee).toBe(0);
  });

  it("a multi-day stay multiplies the day price but charges overtime once", () => {
    const p = priceBooking({ ...base, overtime: 1, resource: "Pool", tier: "Exclusive", slot: "Day", guests: 30, days: 3 });
    expect(p.total).toBe(5700 * 3 + 500);
    expect(p.days).toBe(3);
  });
});

describe("priceBooking — fixed packages (TC-02)", () => {
  it("a package price replaces the pool/venue part; guest count is irrelevant", () => {
    const p = priceBooking({ ...base, pkg: { price: 4500 }, resource: "Pool", tier: "Shared", slot: "Day", guests: 99 });
    expect(p.total).toBe(4500);
    expect(p.poolFee).toBe(0);
  });

  it("a package that includes a room gets the 8% room discount", () => {
    const p = priceBooking({ ...base, pkg: { price: 4500, requiresRoom: true }, resource: "Pool", tier: "Shared", slot: "Day", guests: 10, roomPrices: [2000] });
    expect(p.roomBundleDiscount).toBe(160);
    expect(p.total).toBe(4500 + 1840);
  });

  it("standardPackagePrice agrees with priceBooking (what the seed uses)", () => {
    expect(standardPackagePrice({ resource: "Pool", tier: "Exclusive", slotMode: "Single", capacity: 30 }).price).toBe(5700);
  });
});

describe("pricingProblem / bookingLabel", () => {
  it("rejects Shared Whole Day only", () => {
    expect(pricingProblem("Pool", "Shared", "WholeDay")).toMatch(/Exclusive/);
    expect(pricingProblem("Pool", "Exclusive", "WholeDay")).toBeNull();
    expect(pricingProblem("Venue", "Shared", "WholeDay")).toBeNull();
  });
  it("labels the summary line shown on receipts", () => {
    expect(bookingLabel({ resource: "Pool", slot: "Day", hasRoom: true })).toBe("Day Tour + Room");
    expect(bookingLabel({ resource: "Venue", slot: "Night", hasRoom: false })).toBe("Event Venue Rental (Night Tour)");
    expect(bookingLabel({ packageTitle: "Family Pack", resource: "Pool", slot: "Day", hasRoom: false })).toBe("Family Pack (Day Tour)");
  });
});
