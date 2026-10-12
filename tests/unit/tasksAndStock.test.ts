/* Caretaker tasks and stock that moves by itself.
 *
 * The inventory used to be a list nobody kept up, and the caretakers'
 * work lived on a whiteboard. These pin the rules that replace both: when
 * an upkeep task is due, which tasks follow from the bookings and the
 * facilities, how a supply list from a phone is cleaned before it touches
 * the stock, and when an item makes the shopping list.
 */

import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import type { UpkeepTask } from "@/types/tasks";
import { upkeepStatus, caretakerTasks, upcomingUpkeep, stockForecast, addDaysIso } from "@/lib/tasks";
import { parseSupplies } from "@/lib/stock.server";
import { lowStock } from "@/lib/operations";
import { guessKind } from "@/types/inventory";

const booking = (over: Partial<Booking>): Booking => ({
  id: "B1", name: "Test", contact: "", email: "", date: "2026-10-10",
  guests: 10, package: "Day Tour", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  resource: "Pool", slot: "Day",
  ...over,
});

const facility = (over: Partial<Facility>): Facility => ({
  id: 1, category: "Amenity", name: "Swimming Pool", icon: "pool", status: "Available", notes: "", area: "Pool",
  ...over,
});

const pool: UpkeepTask = { id: 1, title: "Pool cleaning", facilityId: 1, everyDays: 7, startDate: "2026-10-05", notes: "", active: true, supplies: [{ itemId: 1, qty: 2 }] };

describe("upkeep schedule", () => {
  it("is due on its start day and every N days after", () => {
    expect(upkeepStatus(pool, [], "2026-10-05")).toEqual({ dueDate: "2026-10-05", state: "due", nextDate: "2026-10-12" });
    expect(upkeepStatus(pool, [], "2026-10-12")).toEqual({ dueDate: "2026-10-12", state: "due", nextDate: "2026-10-19" });
  });

  it("is late between due days until it is done", () => {
    expect(upkeepStatus(pool, [], "2026-10-08").state).toBe("overdue");
    expect(upkeepStatus(pool, [], "2026-10-08").dueDate).toBe("2026-10-05");
  });

  it("is done once a run covers the latest due day", () => {
    const runs = [{ taskId: 1, dueDate: "2026-10-05" }];
    expect(upkeepStatus(pool, runs, "2026-10-08").state).toBe("done");
    // …and due again on the next cycle.
    expect(upkeepStatus(pool, runs, "2026-10-12").state).toBe("due");
  });

  it("owes only the latest missed day, not a pile of them", () => {
    // Nobody cleaned the pool for three weeks: one task, not three.
    const s = upkeepStatus(pool, [], "2026-10-27");
    expect(s.dueDate).toBe("2026-10-26");
    expect(s.state).toBe("overdue");
  });

  it("waits until it starts", () => {
    expect(upkeepStatus(pool, [], "2026-10-01")).toEqual({ dueDate: "2026-10-05", state: "upcoming", nextDate: "2026-10-05" });
  });

  it("lists what comes up in the next week", () => {
    const daily: UpkeepTask = { ...pool, id: 2, title: "Skim leaves", everyDays: 1, startDate: "2026-10-01" };
    const soon = upcomingUpkeep([pool, daily], [{ taskId: 1, dueDate: "2026-10-05" }], "2026-10-06", 7);
    expect(soon.map((x) => `${x.task.title}@${x.date}`)).toEqual(["Skim leaves@2026-10-07", "Pool cleaning@2026-10-12"]);
  });

  it("adds days across a month end without drifting", () => {
    expect(addDaysIso("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("the caretakers' list comes from the bookings and facilities", () => {
  const facilities = [facility({}), facility({ id: 2, name: "Room 1", category: "Room", roomId: 4, area: undefined })];

  it("asks for a check-out inspection while a group is on site", () => {
    const b = booking({ checkedInAt: "2026-10-10T01:00:00Z", rooms: [4] });
    const tasks = caretakerTasks({ bookings: [b], facilities, inspections: [], upkeep: [], runs: [], today: "2026-10-10" });
    expect(tasks[0].kind).toBe("inspect");
    expect(tasks[0].facilities.map((f) => f.name)).toEqual(["Swimming Pool", "Room 1"]);
  });

  it("asks for preparation only once its window opens, and not after it is done", () => {
    const b = booking({ date: "2026-10-12" });
    const at = (today: string, prepared = false) => caretakerTasks({
      bookings: [b], facilities, today, upkeep: [], runs: [],
      inspections: prepared ? [{ id: 1, bookingId: "B1", stage: "Preparation", items: [], notes: "", inspectedAt: "" }] : [],
    }).filter((t) => t.kind === "prepare").length;
    expect(at("2026-10-10")).toBe(0); // two days before: not yet
    expect(at("2026-10-11")).toBe(1); // the day before: open
    expect(at("2026-10-11", true)).toBe(0); // prepared
  });

  it("asks to clean what a check-out left, and skips retired facilities", () => {
    const tasks = caretakerTasks({
      bookings: [], inspections: [], upkeep: [], runs: [], today: "2026-10-10",
      facilities: [facility({ status: "Needs Cleaning" }), facility({ id: 3, name: "Old kiosk", status: "Needs Cleaning", active: false })],
    });
    expect(tasks.map((t) => t.title)).toEqual(["Clean Swimming Pool"]);
  });

  it("ignores cancelled and archived bookings", () => {
    const tasks = caretakerTasks({
      bookings: [booking({ status: "Cancelled", checkedInAt: "x" }), booking({ id: "B2", archived: true, checkedInAt: "x" })],
      facilities, inspections: [], upkeep: [], runs: [], today: "2026-10-10",
    });
    expect(tasks).toEqual([]);
  });

  it("puts groups leaving first and late upkeep before today's", () => {
    const tasks = caretakerTasks({
      bookings: [booking({ checkedInAt: "x" })],
      facilities: [facility({ status: "Needs Cleaning" })],
      inspections: [], runs: [], today: "2026-10-08",
      upkeep: [pool, { ...pool, id: 2, title: "Wipe tables", everyDays: 1, startDate: "2026-10-08" }],
    });
    expect(tasks.map((t) => t.kind)).toEqual(["inspect", "clean", "upkeep", "upkeep"]);
    expect(tasks[2].title).toBe("Pool cleaning"); // late since the 5th
  });
});

describe("supplies from a phone", () => {
  it("keeps positive amounts, merges repeats and drops junk", () => {
    expect(parseSupplies([
      { itemId: 1, qty: 2 }, { itemId: 1, qty: 0.5 }, { itemId: 2, qty: 0 },
      { itemId: -3, qty: 1 }, { itemId: "x", qty: 1 }, null, { itemId: 4, qty: "1.256" },
    ])).toEqual([{ itemId: 1, qty: 2.5 }, { itemId: 4, qty: 1.26 }]);
  });

  it("is empty for anything that isn't a list", () => {
    expect(parseSupplies(undefined)).toEqual([]);
    expect(parseSupplies({ itemId: 1, qty: 1 })).toEqual([]);
  });
});

describe("the shopping list", () => {
  it("lists what is at or under its minimum, not removed items", () => {
    const items = [
      { name: "Chlorine", qty: 9, minQty: 10 },
      { name: "Gloves", qty: 8, minQty: 8 },
      { name: "Bags", qty: 60, minQty: 20 },
      { name: "Old", qty: 0, minQty: 5, deletedAt: "2026-10-01" },
    ];
    expect(lowStock(items).map((i) => i.name)).toEqual(["Chlorine", "Gloves"]);
  });

  it("says how long stock lasts at the recent rate, and nothing when unused", () => {
    // 12 used in 60 days = 0.2 a day.
    expect(stockForecast(24, 12)?.label).toBe("about 4 months");
    expect(stockForecast(6, 12)?.label).toBe("about 4 weeks");
    expect(stockForecast(6, 60)?.label).toBe("about 6 days");
    expect(stockForecast(10, 0)).toBeNull();
  });
});

describe("supply or equipment, before the owner says", () => {
  // Chairs and mops don't get used up; they break. The screen offers
  // "Broken" for these instead of "Use".
  it("treats furniture and kept tools as equipment, the rest as supplies", () => {
    const k = (category: string, name: string) => guessKind({ category, name });
    expect(k("Furniture & Misc", "Monobloc Chair (White)")).toBe("Equipment");
    expect(k("Cleaning Tools", "Mop & Bucket Set")).toBe("Equipment");
    expect(k("Cleaning Tools", "Pool Vacuum / Skimmer")).toBe("Equipment");
    expect(k("Cleaning Tools", "Trash Bags (XL)")).toBe("Supply");
    expect(k("Cleaning Tools", "Rubber Gloves")).toBe("Supply");
    expect(k("Pool & Chemicals", "Chlorine Tablets (1kg)")).toBe("Supply");
  });
});
