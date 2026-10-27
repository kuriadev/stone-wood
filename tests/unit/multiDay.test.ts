/* What a booking of several days actually is, per slot.
 *
 * The three slots leave very different gaps between their cycles, so a run
 * of them means three different things (lib/resort.ts):
 *
 *   Day Tour    5 PM -> 7 AM: a 14-hour gap. The guest goes home and comes
 *               back. Three days is three separate daytime visits.
 *   Night Tour  5 AM -> 7 PM: the mirror. Three days is three nights, and
 *               the stay ends at 5 AM on the morning AFTER the last date.
 *   Whole Day   5 AM -> 7 AM: only the turnover. A run is ONE unbroken stay.
 *
 * The bug these tests pin: rooms were matched on the booked slot alone, so
 * a three-day Day Tour released its room every night of the run and the
 * system would sell it to a Night group while the guest's things were still
 * in it and they were coming back at 7 the next morning.
 */

import type { Booking } from "@/types/booking";
import { roomHoldSlots, roomsTakenOn, roomsTakenInRange, checkPoolCapacity } from "@/lib/utils";
import { stayWindowLabel, getOccupancyWindow } from "@/lib/occupancy";
import { stayPatternNote, stayUnit, isContinuousStay } from "@/lib/resort";

/** A confirmed booking with only the fields these rules read. */
const booking = (over: Partial<Booking>): Booking => ({
  id: "B1", name: "Test", contact: "", email: "", date: "2026-10-10",
  guests: 10, package: "Day Tour", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  ...over,
});

describe("roomHoldSlots — a stay keeps its room through the gaps", () => {
  it("holds a Day run's room overnight on every date but the last", () => {
    // Oct 10-12 Day Tour. The guest leaves at 5 PM on the 10th and 11th and
    // is back at 7 AM — the room is theirs those nights. On the 12th they
    // leave for good, so that night is free again.
    const b = booking({ date: "2026-10-10", endDate: "2026-10-12", slot: "Day", rooms: [3] });

    expect(roomHoldSlots(b, "2026-10-10")).toEqual(["Day", "Night"]);
    expect(roomHoldSlots(b, "2026-10-11")).toEqual(["Day", "Night"]);
    expect(roomHoldSlots(b, "2026-10-12")).toEqual(["Day"]);
  });

  it("holds a Night run's room through the daytime on every date but the first", () => {
    // Oct 10-12 Night Tour. They arrive at 7 PM on the 10th, so that
    // daytime is still sellable. They leave at 5 AM on the 11th and 12th
    // and come back that evening, so those daytimes are held.
    const b = booking({ date: "2026-10-10", endDate: "2026-10-12", slot: "Night", rooms: [3] });

    expect(roomHoldSlots(b, "2026-10-10")).toEqual(["Night"]);
    expect(roomHoldSlots(b, "2026-10-11")).toEqual(["Day", "Night"]);
    expect(roomHoldSlots(b, "2026-10-12")).toEqual(["Day", "Night"]);
  });

  it("leaves a one-day booking's room free in the other slot", () => {
    // Unchanged behaviour, and the reason the gap rule is scoped to runs:
    // a single Day group takes everything with them at 5 PM, and the
    // 5-7 PM turnover is enough to let the room out again that night.
    const b = booking({ date: "2026-10-10", slot: "Day", rooms: [3] });
    expect(roomHoldSlots(b, "2026-10-10")).toEqual(["Day"]);
  });

  it("is a no-op for Whole Day, which already holds both slots", () => {
    const b = booking({ date: "2026-10-10", endDate: "2026-10-12", slot: "WholeDay", rooms: [3] });
    for (const d of ["2026-10-10", "2026-10-11", "2026-10-12"]) {
      expect(roomHoldSlots(b, d)).toEqual(["Day", "Night"]);
    }
  });
});

describe("roomsTakenOn — the bug this fixes", () => {
  const stay = [booking({ date: "2026-10-10", endDate: "2026-10-12", slot: "Day", rooms: [3] })];

  it("does not sell a Day run's room to a Night group mid-stay", () => {
    expect(roomsTakenOn("2026-10-10", "Night", stay).has(3)).toBe(true);
    expect(roomsTakenOn("2026-10-11", "Night", stay).has(3)).toBe(true);
  });

  it("frees the room on the last night, once the guest has gone", () => {
    expect(roomsTakenOn("2026-10-12", "Night", stay).has(3)).toBe(false);
  });

  it("still blocks the room in the slot actually booked", () => {
    for (const d of ["2026-10-10", "2026-10-11", "2026-10-12"]) {
      expect(roomsTakenOn(d, "Day", stay).has(3)).toBe(true);
    }
  });

  it("blocks a Whole Day request across the whole run", () => {
    expect(roomsTakenInRange("2026-10-10", "2026-10-12", "WholeDay", stay).has(3)).toBe(true);
  });

  it("releases the room cleanly the day after the stay ends", () => {
    expect(roomsTakenOn("2026-10-13", "Day", stay).has(3)).toBe(false);
    expect(roomsTakenOn("2026-10-13", "Night", stay).has(3)).toBe(false);
  });
});

describe("the pool is NOT held through the gaps", () => {
  it("still sells the Night to another Shared group during a Day run", () => {
    // Deliberate, and the opposite of the room rule: the guest really is
    // not in the pool at 9 PM, and an empty pool earns nothing. Only the
    // room follows them, because their things are in it.
    const stay = [booking({
      date: "2026-10-10", endDate: "2026-10-12", slot: "Day",
      rooms: [3], tier: "Shared", guests: 10,
    })];
    const r = checkPoolCapacity("2026-10-11", "Night", 10, "Shared", stay);
    expect(r.ok).toBe(true);
  });

  it("closes the Day of every date of an Exclusive Day run, and leaves the Nights open", () => {
    // Exclusive is a buyout of its tour, which a multi-day run does not
    // change: every date of the run is closed in the slot it bought.
    const stay = [booking({
      date: "2026-10-10", endDate: "2026-10-12", slot: "Day",
      tier: "Exclusive", guests: 50,
    })];
    expect(checkPoolCapacity("2026-10-11", "Day", 10, "Shared", stay).ok).toBe(false);
    expect(checkPoolCapacity("2026-10-11", "Night", 10, "Shared", stay).ok).toBe(true);
  });
});

describe("stayWindowLabel — when the guest really leaves", () => {
  it("ends a Day run at 5 PM on the last date", () => {
    const w = stayWindowLabel({ date: "2026-10-10", endDate: "2026-10-12", slot: "Day" });
    expect(w?.arrive).toBe("October 10, 2026, 7:00 AM");
    expect(w?.depart).toBe("October 12, 2026, 5:00 PM");
  });

  it("ends a Night run at 5 AM on the morning AFTER the last date", () => {
    // The 13th appears nowhere on the booking. This is exactly the sum
    // guests were being left to do themselves.
    const w = stayWindowLabel({ date: "2026-10-10", endDate: "2026-10-12", slot: "Night" });
    expect(w?.arrive).toBe("October 10, 2026, 7:00 PM");
    expect(w?.depart).toBe("October 13, 2026, 5:00 AM");
  });

  it("runs a Whole Day stay unbroken from the first morning to the last dawn", () => {
    const w = stayWindowLabel({ date: "2026-10-10", endDate: "2026-10-12", slot: "WholeDay" });
    expect(w?.arrive).toBe("October 10, 2026, 7:00 AM");
    expect(w?.depart).toBe("October 13, 2026, 5:00 AM");

    // And it is one window, not three: 7 AM Oct 10 to 5 AM Oct 13 is 70 hours.
    const win = getOccupancyWindow({ date: "2026-10-10", endDate: "2026-10-12", slot: "WholeDay" })!;
    expect((win.end.getTime() - win.start.getTime()) / 3_600_000).toBe(70);
  });

  it("ends a single-night Night Tour the next morning", () => {
    const w = stayWindowLabel({ date: "2026-10-10", slot: "Night" });
    expect(w?.depart).toBe("October 11, 2026, 5:00 AM");
  });
});

describe("what the guest is told", () => {
  it("says nothing extra for a single day, where the hours suffice", () => {
    expect(stayPatternNote("Day", 1)).toBeNull();
    expect(stayPatternNote("WholeDay", 1)).toBeNull();
  });

  it("tells a Day run they are not staying overnight", () => {
    const note = stayPatternNote("Day", 3)!;
    expect(note).toContain("3 days");
    expect(note).toContain("not yours overnight");
  });

  it("tells a Night run they are not staying through the day", () => {
    const note = stayPatternNote("Night", 3)!;
    expect(note).toContain("3 nights");
    expect(note).toContain("not yours during the day");
  });

  it("tells a Whole Day run the resort stays theirs throughout", () => {
    const note = stayPatternNote("WholeDay", 3)!;
    expect(note).toContain("without a break");
    expect(note).toContain("the morning after the last");
  });

  it("counts nights for the Night Tour and days for the others", () => {
    expect(stayUnit("Night", 3)).toBe("3 nights");
    expect(stayUnit("Day", 3)).toBe("3 days");
    expect(stayUnit("Day", 1)).toBe("1 day");
  });

  it("marks only Whole Day as a continuous stay", () => {
    expect(isContinuousStay("WholeDay")).toBe(true);
    expect(isContinuousStay("Day")).toBe(false);
    expect(isContinuousStay("Night")).toBe(false);
  });
});
