/* A room added to a booking built by hand is charged at its full rate:
 * there is no automatic discount. Only a package the owner set up with
 * its own room deal takes money off a room. */
import { priceBooking } from "@/lib/pricing";

const base = { resource: "Pool" as const, tier: "Shared" as const, guests: 4, overtime: 0 };

describe("rooms on a booking built by hand", () => {
  it("cost their full rate per tour, whatever else is booked", () => {
    for (const slot of ["Day", "Night"] as const) {
      const p = priceBooking({ ...base, slot, roomPrices: [2500, 2000] });
      expect(p.roomsFee).toBe(4500);
      expect(p.roomsOff).toBe(0);
    }
    // A Staycation is two tours a day, for every day.
    const stay = priceBooking({ ...base, tier: "Exclusive", slot: "WholeDay", roomPrices: [2500], days: 2 });
    expect(stay.roomsFee).toBe(2500 * 2 * 2);
    expect(stay.roomsOff).toBe(0);
    expect(stay.extraDaysOff).toBe(0);
  });

  it("only get money off inside a package with its own room deal", () => {
    const pkg = { price: 5000, requiresRoom: true, roomDeal: { type: "percent" as const, value: 10 } };
    expect(priceBooking({ ...base, pkg, slot: "Day", roomPrices: [2000] }).roomsOff).toBe(200);
    expect(priceBooking({ ...base, pkg: { price: 5000, requiresRoom: true }, slot: "Day", roomPrices: [2000] }).roomsOff).toBe(0);
  });
});
