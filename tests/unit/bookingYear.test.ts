// Bookings are taken for the current year only: guests, walk-ins, imports
// and closed dates alike. The months-ahead window still applies, but never
// reaches past 31 December.
import {
  currentBookingYear, isInBookingYear, getBookingWindow, isWithinBookingWindow,
  describeDateProblem, toDateStr,
} from "@/lib/validators";

const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ["nextTick", "setImmediate"] });
afterEach(() => jest.useRealTimers());

describe("the booking year", () => {
  it("is the calendar year in Manila, even when UTC is still on 31 December", () => {
    at("2026-12-31T17:00:00Z"); // 1 Jan 2027, 1 AM in Manila
    expect(currentBookingYear()).toEqual({ year: 2027, first: "2027-01-01", last: "2027-12-31" });
  });

  it("takes every date of this year and none of the next or last", () => {
    at("2026-10-28T04:00:00Z");
    expect(isInBookingYear("2026-01-01")).toBe(true);
    expect(isInBookingYear("2026-12-31")).toBe(true);
    expect(isInBookingYear("2027-01-01")).toBe(false);
    expect(isInBookingYear("2025-12-31")).toBe(false);
    expect(isInBookingYear("2026-02-30")).toBe(false);
  });

  it("stops a guest's window at 31 December when the months ahead would cross it", () => {
    at("2026-11-15T04:00:00Z");
    expect(toDateStr(getBookingWindow().max)).toBe("2026-12-31");
    expect(isWithinBookingWindow("2026-12-31")).toBe(true);
    expect(isWithinBookingWindow("2027-01-02")).toBe(false);
    expect(describeDateProblem("2027-01-02")).toBe("Bookings are open for 2026 only, up to 31 December.");
  });

  it("keeps the months-ahead limit when that comes first", () => {
    at("2026-03-10T04:00:00Z");
    expect(toDateStr(getBookingWindow().max)).toBe("2026-06-10");
    expect(describeDateProblem("2026-07-01")).toMatch(/months ahead/);
  });
});
