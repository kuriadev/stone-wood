import { DEFAULT_SETTINGS, settingsFieldErrors, validateSettings, isPhMobile } from "@/lib/settings";

const withChange = (group: string, key: string, value: unknown) => {
  const s = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  s[group][key] = value;
  return s;
};

describe("Rates & Settings field rules", () => {
  it("passes the built-in defaults", () => {
    expect(settingsFieldErrors(DEFAULT_SETTINGS)).toEqual({});
    expect(validateSettings(DEFAULT_SETTINGS, { strict: true }).ok).toBe(true);
  });

  it("needs every number, whole and in range", () => {
    expect(settingsFieldErrors(withChange("rates", "sharedPerHead", ""))["rates.sharedPerHead"]).toBe("Enter a number.");
    expect(settingsFieldErrors(withChange("rates", "sharedPerHead", 0))["rates.sharedPerHead"]).toMatch(/At least 1/);
    expect(settingsFieldErrors(withChange("rates", "sharedPerHead", 250.5))["rates.sharedPerHead"]).toBe("Use a whole number.");
    expect(settingsFieldErrors(withChange("limits", "resortCapacity", 900))["limits.resortCapacity"]).toMatch(/At most 500/);
  });

  it("keeps prices sensible together", () => {
    expect(settingsFieldErrors(withChange("rates", "exclusiveFlat", 200))["rates.exclusiveFlat"]).toMatch(/more than one shared-pool guest/);
    expect(settingsFieldErrors(withChange("rates", "overtimePerHour", 0))["rates.overtimePerHour"]).toMatch(/turn overtime off/);
    const off = withChange("rates", "overtimePerHour", 0); off.limits.overtimeMaxHours = 0;
    expect(settingsFieldErrors(off)).toEqual({});
  });

  it("keeps limits sensible together", () => {
    expect(settingsFieldErrors(withChange("limits", "exclusiveDefaultGuests", 40))["limits.exclusiveDefaultGuests"]).toMatch(/capacity \(30\)/);
    // Against a one-month window: 30 days' notice or a 30-day stay can't fit.
    const short = (key: string, v: number) => { const s = withChange("limits", key, v); s.limits.bookingWindowMonths = 1; return s; };
    expect(settingsFieldErrors(short("rescheduleNoticeDays", 30))["limits.rescheduleNoticeDays"]).toMatch(/every booking/);
    expect(settingsFieldErrors(short("maxStayDays", 30))["limits.maxStayDays"]).toMatch(/months ahead/);
    expect(settingsFieldErrors(withChange("limits", "rescheduleNoticeDays", 30))["limits.rescheduleNoticeDays"]).toBeUndefined();
  });

  it("checks the timetable", () => {
    expect(settingsFieldErrors(withChange("hours", "dayEnd", 10))["hours.dayEnd"]).toMatch(/4 hours/);
    expect(settingsFieldErrors(withChange("hours", "nightStart", 17))["hours.nightStart"]).toMatch(/an hour/);
  });

  it("checks the contact details", () => {
    expect(isPhMobile("+63 912 345 6789")).toBe(true);
    expect(isPhMobile("0912-345-6789")).toBe(true);
    expect(isPhMobile("12345")).toBe(false);
    expect(settingsFieldErrors(withChange("contact", "phone", "12345"))["contact.phone"]).toMatch(/mobile number/);
    expect(settingsFieldErrors(withChange("contact", "email", "nope"))["contact.email"]).toMatch(/email/);
    expect(settingsFieldErrors(withChange("contact", "messenger", "https://example.com/x"))["contact.messenger"]).toMatch(/Messenger/);
  });

  it("stays lenient when loading what is already saved", () => {
    expect(validateSettings(withChange("rates", "exclusiveFlat", 100)).ok).toBe(true);
    expect(validateSettings(withChange("rates", "exclusiveFlat", 100), { strict: true }).ok).toBe(false);
  });
});
