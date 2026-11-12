// A package's deals: money off its price, its room, or each extra day of a
// stay, set package by package in Packages & Prices. All three live in the
// one `discount` column and are charged through priceBooking.
import {
  cleanPackageDeals, cleanPackageDealPart, packDiscounts, unpackDiscounts, dealOff, dealToday, dealText,
  packagePricing, packageExtraDeals, packageLinkPrices, priceBooking,
} from "@/lib/pricing";
import { buildPackageBookingUrl, parseLinkDeal } from "@/lib/utils";
import { rowToPackage, packageToRow } from "@/lib/supabase";
import type { PackageRow } from "@/types/database";

describe("cleanPackageDeals", () => {
  const base = { price: 10800, requiresRoom: true, slotMode: "WholeDay" };

  it("keeps each part that applies", () => {
    expect(cleanPackageDeals({
      ...base,
      discount: { type: "percent", value: 10 },
      roomDiscount: { type: "percent", value: 8, until: "2026-12-31" },
      extraDayDiscount: { type: "amount", value: 1000 },
    })).toEqual({
      ok: true,
      discount: { type: "percent", value: 10 },
      roomDiscount: { type: "percent", value: 8, until: "2026-12-31" },
      extraDayDiscount: { type: "amount", value: 1000 },
    });
  });

  it("drops a room deal on a package without a room, and an extra-day deal on a single stay", () => {
    expect(cleanPackageDeals({
      price: 5700, requiresRoom: false, slotMode: "Single",
      roomDiscount: { type: "percent", value: 8 }, extraDayDiscount: { type: "percent", value: 15 },
    })).toEqual({ ok: true, discount: null, roomDiscount: null, extraDayDiscount: null });
  });

  it("refuses a bad value and says which part it is", () => {
    const r = cleanPackageDeals({ ...base, roomDiscount: { type: "percent", value: 95 } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Room discount: /);
    const d = cleanPackageDeals({ ...base, extraDayDiscount: { type: "amount", value: 12.5 } });
    expect(!d.ok && d.error).toMatch(/^Each extra day discount: .*whole amount/);
  });

  it("still holds the price promo below the price, with its old wording", () => {
    const r = cleanPackageDeals({ ...base, discount: { type: "amount", value: 10800 } });
    expect(!r.ok && r.error).toBe("A peso discount has to be a whole amount less than the price (10,800).");
  });

  it("lets a peso room discount be any whole amount: it is capped per room when charged", () => {
    expect(cleanPackageDealPart("room", { type: "amount", value: 5000 }, 4000)).toEqual({ ok: true, discount: { type: "amount", value: 5000 } });
  });
});

describe("the discount column", () => {
  it("keeps the price promo at the top, so older code still reads it", () => {
    const col = packDiscounts({
      discount: { type: "percent", value: 10 },
      roomDiscount: { type: "percent", value: 8 },
      extraDayDiscount: { type: "percent", value: 15, until: "2026-12-31" },
    });
    expect(col).toEqual({ type: "percent", value: 10, room: { type: "percent", value: 8 }, extraDay: { type: "percent", value: 15, until: "2026-12-31" } });
    expect(unpackDiscounts(col)).toEqual({
      discount: { type: "percent", value: 10 },
      roomDiscount: { type: "percent", value: 8 },
      extraDayDiscount: { type: "percent", value: 15, until: "2026-12-31" },
    });
  });

  it("reads a column written before room and extra-day deals existed", () => {
    expect(unpackDiscounts({ type: "amount", value: 500, until: "2026-11-30" })).toEqual({ discount: { type: "amount", value: 500, until: "2026-11-30" } });
  });

  it("holds a room deal on its own, and nothing at all as null", () => {
    expect(unpackDiscounts(packDiscounts({ roomDiscount: { type: "amount", value: 300 } }))).toEqual({ roomDiscount: { type: "amount", value: 300 } });
    expect(packDiscounts({})).toBeNull();
    expect(unpackDiscounts(null)).toEqual({});
    expect(unpackDiscounts({ type: "percent", value: "junk", room: "x" })).toEqual({});
  });

  it("goes through the package row and back", () => {
    const row = {
      id: 7, code: "WHOLE-DAY-STAY", title: "Whole Day Stay", resource: "Pool", status: "Exclusive", price: 10800, list_price: null,
      discount: { room: { type: "percent", value: 8 }, extraDay: { type: "percent", value: 15 } },
      capacity: 30, requires_room: true, slot_mode: "WholeDay", cover: "x", gallery: [], blurb: "", includes: [], note: null, active: true, created_at: "",
    } as unknown as PackageRow;
    const p = rowToPackage(row);
    expect(p.discount).toBeUndefined();
    expect(p.roomDiscount).toEqual({ type: "percent", value: 8 });
    expect(p.extraDayDiscount).toEqual({ type: "percent", value: 15 });
    expect(packageToRow(p).discount).toEqual(row.discount);
  });
});

describe("dealOff and dealToday", () => {
  it("rounds a percentage to the peso and never takes more than the amount", () => {
    expect(dealOff({ type: "percent", value: 8 }, 2500)).toBe(200);
    expect(dealOff({ type: "percent", value: 15 }, 14801)).toBe(2220);
    expect(dealOff({ type: "amount", value: 3000 }, 2000)).toBe(2000);
    expect(dealOff(null, 2000)).toBe(0);
  });

  it("runs through its last day, then stops", () => {
    const d = { type: "percent" as const, value: 8, until: "2026-11-30" };
    expect(dealToday(d, "2026-11-30")).toEqual({ type: "percent", value: 8 });
    expect(dealToday(d, "2026-12-01")).toBeNull();
    expect(dealText({ type: "amount", value: 1500 })).toBe("₱1,500 off");
  });
});

describe("priceBooking with a package's deals", () => {
  const stay = { resource: "Pool" as const, tier: "Exclusive" as const, guests: 30, overtime: 0 };

  it("takes the room deal off the room's rate, for each slot", () => {
    // Day or Night: one slot.
    const day = priceBooking({ ...stay, slot: "Day", roomPrices: [2500], pkg: { price: 5700, requiresRoom: true, roomDeal: { type: "percent", value: 8 } } });
    expect(day).toMatchObject({ roomsFee: 2300, roomsOff: 200, total: 8000 });
    // A Staycation is two slots.
    const whole = priceBooking({ ...stay, slot: "WholeDay", roomPrices: [2500], pkg: { price: 10800, requiresRoom: true, roomDeal: { type: "percent", value: 8 } } });
    expect(whole).toMatchObject({ roomsFee: 4600, roomsOff: 400, total: 15400 });
  });

  it("takes the extra-day deal off every day after the first, room included", () => {
    const p = priceBooking({
      ...stay, slot: "WholeDay", roomPrices: [2000], days: 3,
      pkg: { price: 10800, requiresRoom: true, extraDayDeal: { type: "percent", value: 15 } },
    });
    // A day is 10,800 + 2,000 × 2 = 14,800; days 2 and 3 are 2,220 off each.
    expect(p).toMatchObject({ perDay: 14800, extraDaysOff: 4440, total: 14800 * 3 - 4440 });
  });

  it("stacks the room deal under the extra-day deal", () => {
    const p = priceBooking({
      ...stay, slot: "WholeDay", roomPrices: [2500], days: 2,
      pkg: { price: 10800, requiresRoom: true, roomDeal: { type: "amount", value: 500 }, extraDayDeal: { type: "amount", value: 1000 } },
    });
    // Room 2,000 × 2 slots; a day 14,800; the second 1,000 off.
    expect(p).toMatchObject({ roomsFee: 8000, roomsOff: 2000, extraDaysOff: 1000, total: 28600 });
  });

  it("changes nothing on a booking built by hand", () => {
    const p = priceBooking({ ...stay, slot: "WholeDay", roomPrices: [2500], days: 2 });
    expect(p).toMatchObject({ roomsOff: 0, extraDaysOff: 0, total: (12000 + 5000) * 2 });
  });
});

describe("packagePricing", () => {
  const pkg = {
    price: 10800, requiresRoom: true, slotMode: "WholeDay",
    discount: { type: "percent" as const, value: 10, until: "2026-11-15" },
    roomDiscount: { type: "percent" as const, value: 8 },
    extraDayDiscount: { type: "percent" as const, value: 15, until: "2026-11-10" },
  };

  it("gives what is running today", () => {
    expect(packagePricing(pkg, "2026-11-08")).toEqual({
      price: 9720, requiresRoom: true, roomDeal: { type: "percent", value: 8 }, extraDayDeal: { type: "percent", value: 15 },
    });
    expect(packagePricing(pkg, "2026-11-12")).toEqual({ price: 9720, requiresRoom: true, roomDeal: { type: "percent", value: 8 }, extraDayDeal: null });
  });

  it("ignores a room deal without a room and an extra-day deal on a single stay", () => {
    expect(packagePricing({ ...pkg, requiresRoom: false, slotMode: "Single" }, "2026-11-08")).toMatchObject({ roomDeal: null, extraDayDeal: null });
  });

  it("names them for the guest's card", () => {
    expect(packageExtraDeals(pkg, "2026-11-08")).toEqual([
      { part: "room", text: "Room 8% off", until: undefined },
      { part: "extraDay", text: "Each extra day 15% off", until: "2026-11-10" },
    ]);
  });
});

describe("the booking link", () => {
  it("carries the room and extra-day deals to Book Now", () => {
    const p = {
      resource: "Pool" as const, status: "Exclusive" as const, slotMode: "WholeDay" as const, capacity: 30, price: 10800,
      requiresRoom: true, roomDiscount: { type: "percent" as const, value: 8 }, extraDayDiscount: { type: "amount" as const, value: 1000 },
    };
    const prices = packageLinkPrices(p, "2026-11-08");
    expect(prices).toMatchObject({ price: 10800, roomDeal: { type: "percent", value: 8 }, extraDayDeal: { type: "amount", value: 1000 } });
    const url = new URL("http://x" + buildPackageBookingUrl({ code: "WHOLE-DAY-STAY", title: "Whole Day Stay", capacity: 30, requiresRoom: true, slotMode: "WholeDay", ...prices }, "Pool", "Exclusive"));
    expect(url.searchParams.get("pkgRoomOff")).toBe("percent-8");
    expect(parseLinkDeal(url.searchParams.get("pkgRoomOff"))).toEqual({ type: "percent", value: 8 });
    expect(parseLinkDeal(url.searchParams.get("pkgDayOff"))).toEqual({ type: "amount", value: 1000 });
  });

  it("ignores a link deal that isn't one", () => {
    expect(parseLinkDeal("percent-95")).toBeUndefined();
    expect(parseLinkDeal("free-room")).toBeUndefined();
    expect(parseLinkDeal(null)).toBeUndefined();
  });
});
