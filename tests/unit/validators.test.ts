/** Input validation behind Book Now (TC-03), Walk-In (TC-09) and the server re-check. */
import { isValidPHNumber, isValidEmail, isValidName, sanitizeName, isWithinBookingWindow, describeDateProblem } from "@/lib/validators";
import { inDays, pinToday } from "../helpers/fixtures";

beforeAll(() => pinToday());
afterAll(() => jest.useRealTimers());

describe("contact number", () => {
  it.each(["09171234567", "09999999999"])("accepts %s", (n) => expect(isValidPHNumber(n)).toBe(true));
  it.each(["9171234567", "0917123456", "091712345678", "+639171234567", "08171234567", "", "09abc234567"])("rejects %p", (n) => expect(isValidPHNumber(n)).toBe(false));
});

describe("email", () => {
  it.each(["a@gmail.com", "juan.delacruz@yahoo.com"])("accepts %s", (e) => expect(isValidEmail(e)).toBe(true));
  it.each(["", "plain", "a@", "@gmail.com", "a b@gmail.com"])("rejects %p", (e) => expect(isValidEmail(e)).toBe(false));
});

describe("guest name", () => {
  it("strips digits and symbols but keeps accents, dots, hyphens and apostrophes", () => {
    expect(sanitizeName("Juan <script>123 Dela-Cruz Jr.")).toBe("Juan script Dela-Cruz Jr.");
    expect(sanitizeName("Niño O'Brien")).toBe("Niño O'Brien");
  });
  it("needs real letters", () => {
    expect(isValidName("Juan Dela Cruz")).toBe(true);
    expect(isValidName("...")).toBe(false);
    expect(isValidName("")).toBe(false);
  });
});

describe("booking window (pinned today = 2026-03-02)", () => {
  it("today and the next weeks are bookable", () => {
    expect(isWithinBookingWindow(inDays(0))).toBe(true);
    expect(isWithinBookingWindow(inDays(30))).toBe(true);
  });
  it("yesterday is not", () => {
    expect(isWithinBookingWindow(inDays(-1))).toBe(false);
    expect(describeDateProblem(inDays(-1))).toMatch(/passed/);
  });
  it("more than 3 months ahead is not", () => {
    expect(isWithinBookingWindow(inDays(120))).toBe(false);
    expect(describeDateProblem(inDays(120))).toMatch(/3 months ahead/);
  });
  it("garbage dates are rejected", () => {
    expect(isWithinBookingWindow("2026-02-31")).toBe(false);
    expect(isWithinBookingWindow("tomorrow")).toBe(false);
  });
});
