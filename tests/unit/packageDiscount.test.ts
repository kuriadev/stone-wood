// A promo on a package: money off its regular price, optionally until a
// date, and charged -- the quote and the walk-in window price through
// packagePriceToday.
import { cleanPackageDiscount, packagePriceToday, packageLinkPrices, promoUntilLabel } from "@/lib/pricing";

describe("cleanPackageDiscount", () => {
  it("treats blank or zero as no promo", () => {
    expect(cleanPackageDiscount(null, 4000)).toEqual({ ok: true, discount: null });
    expect(cleanPackageDiscount({ type: "percent", value: "" }, 4000)).toEqual({ ok: true, discount: null });
    expect(cleanPackageDiscount({ type: "amount", value: 0 }, 4000)).toEqual({ ok: true, discount: null });
  });

  it("keeps percentages whole and between 1 and 90", () => {
    expect(cleanPackageDiscount({ type: "percent", value: 20 }, 4000)).toEqual({ ok: true, discount: { type: "percent", value: 20 } });
    expect(cleanPackageDiscount({ type: "percent", value: 95 }, 4000).ok).toBe(false);
    expect(cleanPackageDiscount({ type: "percent", value: 12.5 }, 4000).ok).toBe(false);
  });

  it("keeps a peso discount below the price", () => {
    expect(cleanPackageDiscount({ type: "amount", value: 500 }, 4000).ok).toBe(true);
    expect(cleanPackageDiscount({ type: "amount", value: 4000 }, 4000).ok).toBe(false);
  });

  it("checks the end date", () => {
    expect(cleanPackageDiscount({ type: "percent", value: 10, until: "2026-11-30" }, 4000))
      .toEqual({ ok: true, discount: { type: "percent", value: 10, until: "2026-11-30" } });
    expect(cleanPackageDiscount({ type: "percent", value: 10, until: "30/11/2026" }, 4000).ok).toBe(false);
  });
});

describe("packagePriceToday", () => {
  const pkg = { price: 4000, discount: { type: "percent" as const, value: 20, until: "2026-11-30" } };

  it("charges the promo price while the promo runs, through its last day", () => {
    expect(packagePriceToday(pkg, "2026-10-28")).toEqual({ pay: 3200, regular: 4000, off: 800, badge: "20% OFF", until: "2026-11-30" });
    expect(packagePriceToday(pkg, "2026-11-30").pay).toBe(3200);
  });

  it("goes back to the regular price the day after", () => {
    expect(packagePriceToday(pkg, "2026-12-01")).toEqual({ pay: 4000, regular: 4000, off: 0, badge: null });
  });

  it("takes a peso amount off, and runs with no end date", () => {
    expect(packagePriceToday({ price: 4000, discount: { type: "amount", value: 500 } }, "2030-01-01"))
      .toMatchObject({ pay: 3500, off: 500, badge: "₱500 OFF" });
  });

  it("is the regular price with no promo", () => {
    expect(packagePriceToday({ price: 4000 }, "2026-10-28").pay).toBe(4000);
  });
});

describe("packageLinkPrices", () => {
  const base = { resource: "Pool" as const, status: "Shared" as const, slotMode: "Single" as const, capacity: 15, price: 4000 };

  it("carries the promo price, struck against the regular one", () => {
    expect(packageLinkPrices({ ...base, discount: { type: "percent", value: 25 } }, "2026-10-28")).toEqual({ price: 3000, listPrice: 4000 });
  });

  it("without a promo, carries the regular price", () => {
    expect(packageLinkPrices(base, "2026-10-28").price).toBe(4000);
  });
});

it("labels the end date", () => {
  expect(promoUntilLabel(`${new Date().getFullYear()}-11-30`)).toBe("until 30 Nov");
  expect(promoUntilLabel()).toBe("");
});
