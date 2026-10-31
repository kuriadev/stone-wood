// The booking window rolls with the date: today to N months ahead (Rates &
// Settings), with the calendars paging a few months back to show the dates
// just gone. A guest's date change closes a few days before the visit.
import {
  getBookingWindow, isWithinBookingWindow, describeDateProblem, toDateStr,
  firstViewableMonth, staffDateWindow, isInStaffWindow, daysUntil, rescheduleProblem,
} from "@/lib/validators";

const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ["nextTick", "setImmediate"] });
afterEach(() => jest.useRealTimers());

describe("the booking window", () => {
  it("runs three months ahead, across the new year", () => {
    at("2026-11-15T04:00:00Z");
    expect(toDateStr(getBookingWindow().max)).toBe("2027-02-15");
    expect(isWithinBookingWindow("2027-01-02")).toBe(true);
    expect(isWithinBookingWindow("2027-02-16")).toBe(false);
    expect(describeDateProblem("2027-03-01")).toMatch(/3 months ahead/);
    expect(describeDateProblem("2026-11-14")).toBe("That date has already passed.");
  });

  it("pages back three months for viewing, from the first of that month", () => {
    at("2026-11-15T04:00:00Z");
    expect(toDateStr(firstViewableMonth())).toBe("2026-08-01");
  });

  it("lets staff record from the months back to the end of the window", () => {
    at("2026-11-15T04:00:00Z");
    expect(staffDateWindow()).toEqual({ first: "2026-08-01", last: "2027-02-15" });
    expect(isInStaffWindow("2026-08-01")).toBe(true);
    expect(isInStaffWindow("2026-07-31")).toBe(false);
    expect(isInStaffWindow("2027-02-16")).toBe(false);
    expect(isInStaffWindow("2026-02-30")).toBe(false);
  });

  it("uses Manila's date, even when UTC is still on the day before", () => {
    at("2026-12-31T17:00:00Z"); // 1 Jan 2027, 1 AM in Manila
    expect(toDateStr(getBookingWindow().min)).toBe("2027-01-01");
  });
});

describe("date-change notice", () => {
  it("counts whole days to the visit", () => {
    at("2026-11-01T04:00:00Z");
    expect(daysUntil("2026-11-02")).toBe(1);
    expect(daysUntil("2026-11-01")).toBe(0);
    expect(daysUntil("2026-11-10")).toBe(9);
  });

  it("refuses a booking for tomorrow, allows one two days out", () => {
    at("2026-11-01T04:00:00Z");
    expect(rescheduleProblem("2026-11-02")).toMatch(/2 days before your visit.*tomorrow/);
    expect(rescheduleProblem("2026-11-01")).toMatch(/close on your reserved date/);
    expect(rescheduleProblem("2026-10-30")).toMatch(/close on your reserved date/);
    expect(rescheduleProblem("2026-11-03")).toBeNull();
  });
});
