/**
 * The clock on each Dashboard card, and the encrypted copy behind the
 * owner's password eye.
 */

import { cardTimer, type OpsCard } from "@/lib/operations";
import { sealPassword, openPassword } from "@/lib/staff.server";
import type { Booking } from "@/types/booking";

// Local times, like the rest of the occupancy code (the resort's machines run on Manila time).
const at = (h: number, m = 0, day = 14) => new Date(2026, 9, day, h, m, 0, 0);

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: "SW-1", name: "Test", date: "2026-10-14", guests: 4, package: "Day Tour",
    status: "Confirmed", slot: "Day", ...over,
  } as unknown as Booking;
}

function card(column: OpsCard["column"], b: Booking, extra: Partial<OpsCard> = {}): OpsCard {
  return { b, stage: "arriving", prepared: true, overdue: false, timeUp: false, endsAt: null, view: "today", column, ...extra };
}

describe("Arriving", () => {
  it("is blue before the arrival time and red once it has passed", () => {
    const c = card("arriving", booking()); // Day Tour starts 7:00 AM
    expect(cardTimer(c, at(6, 15))).toMatchObject({ tone: "blue" });
    expect(cardTimer(c, at(6, 15))!.label).toBe("Arrives in 45 min");
    expect(cardTimer(c, at(7, 0))).toMatchObject({ tone: "red" });
    expect(cardTimer(c, at(7, 25))!.label).toBe("Late 25 min");
  });

  it("uses the arrival time the guest gave over the slot start", () => {
    const c = card("arriving", booking({ arrivalTime: "09:30" }));
    expect(cardTimer(c, at(9, 0))).toMatchObject({ tone: "blue" });
    expect(cardTimer(c, at(9, 31))).toMatchObject({ tone: "red" });
  });
});

describe("On site", () => {
  const b = booking({ checkedInAt: at(7, 5).toISOString() });
  const c = card("onsite", b, { stage: "onsite", endsAt: at(17, 0) });

  it("is green inside the booked hours", () => {
    expect(cardTimer(c, at(12, 0))).toMatchObject({ tone: "green" });
  });
  it("turns orange for the last 30 minutes, then red a minute past the end", () => {
    expect(cardTimer(c, at(16, 29))).toMatchObject({ tone: "green" });
    expect(cardTimer(c, at(16, 30))).toMatchObject({ tone: "orange" });
    expect(cardTimer(c, at(17, 0))).toMatchObject({ tone: "orange", label: "Check-out due now" });
    expect(cardTimer(c, at(17, 1))).toMatchObject({ tone: "red" });
    expect(cardTimer(c, at(17, 1))!.label).toBe("Overdue 1 min");
  });
});

describe("Balance to collect", () => {
  const out = (h: number, m = 0) => booking({ checkedOutAt: at(h, m).toISOString() });
  it("is orange while they have only just left, red after two hours", () => {
    expect(cardTimer(card("settle", out(17, 0)), at(17, 40))).toMatchObject({ tone: "orange" });
    expect(cardTimer(card("settle", out(17, 0)), at(19, 0))).toMatchObject({ tone: "red" });
  });
  it("is red when the check-out was on another day", () => {
    expect(cardTimer(card("settle", out(23, 0)), at(8, 0, 15))).toMatchObject({ tone: "red" });
  });
});

describe("Owner's password eye", () => {
  const OLD = process.env.SESSION_SECRET;
  beforeAll(() => { process.env.SESSION_SECRET = "x".repeat(40); });
  afterAll(() => { process.env.SESSION_SECRET = OLD; });

  it("seals a password so it is not readable, and opens it again", () => {
    const sealed = sealPassword("pool-palm-sun42")!;
    expect(sealed).toBeTruthy();
    expect(sealed).not.toContain("pool-palm-sun42");
    expect(openPassword(sealed)).toBe("pool-palm-sun42");
  });
  it("gives a different sealed copy each time", () => {
    expect(sealPassword("same")).not.toBe(sealPassword("same"));
  });
  it("will not open a copy that was changed, or after the secret changes", () => {
    const sealed = sealPassword("secret-word")!;
    expect(openPassword(sealed.slice(0, -2) + "AA")).toBeNull();
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(openPassword(sealed)).toBeNull();
    process.env.SESSION_SECRET = "x".repeat(40);
  });
  it("seals nothing without a proper secret", () => {
    process.env.SESSION_SECRET = "short";
    expect(sealPassword("anything")).toBeNull();
    process.env.SESSION_SECRET = "x".repeat(40);
  });
});
