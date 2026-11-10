/* The rules moved into Rates & Settings take effect everywhere once saved. */
import { applySettings, DEFAULT_SETTINGS, validateSettings, settingsFieldErrors } from "@/lib/settings";
import * as Children from "@/lib/children";
import * as Rebooking from "@/lib/rebooking";
import * as Details from "@/lib/guestDetails";
import * as Resort from "@/lib/resort";
import * as V from "@/lib/validators";

afterEach(() => applySettings(DEFAULT_SETTINGS));

it("apply the owner's numbers", () => {
  applySettings({
    ...DEFAULT_SETTINGS,
    limits: { ...DEFAULT_SETTINGS.limits, peopleMax: 80, childFreeAge: 5, lateBookingHours: 3, holdHours: 24, noShowChoiceDays: 30, detailsCooldownHours: 6 },
    hours: { ...DEFAULT_SETTINGS.hours, quietStart: 23 },
  });
  expect(V.OVERRIDE_GUESTS_MAX).toBe(80);
  expect(Children.CHILDREN_TOTAL_MAX).toBe(80);
  expect(Children.CHILD_FREE_AGE).toBe(5);
  expect(Children.childLimit(10, 30, 0, "Exclusive")).toBe(70);
  expect(Resort.LATE_BOOKING_GRACE_HOURS).toBe(3);
  expect(Resort.QUIET_HOURS_START).toBe("11:00 PM");
  expect(Resort.QUIET_HOURS_POLICY).toContain("11:00 PM");
  expect(Rebooking.HOLD_HOURS).toBe(24);
  expect(Rebooking.NO_SHOW_CHOICE_DAYS).toBe(30);
  expect(Details.DETAILS_COOLDOWN_HOURS).toBe(6);
});

it("keep the old numbers for settings saved before these existed", () => {
  const v = validateSettings({ rates: { sharedPerHead: 200, exclusiveFlat: 6000, venue: 5000, overtimePerHour: 500 } });
  expect(v.ok && v.settings.limits).toMatchObject({ peopleMax: 100, childFreeAge: 3, lateBookingHours: 2, holdHours: 48, noShowChoiceDays: 20, detailsCooldownHours: 12 });
  expect(v.ok && v.settings.hours.quietStart).toBe(22);
});

it("refuse numbers that don't fit together", () => {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.limits.peopleMax = 20;
  s.hours.quietStart = 18;
  const e = settingsFieldErrors(s);
  expect(e["limits.peopleMax"]).toMatch(/capacity/);
  expect(e["hours.quietStart"]).toMatch(/Night Tour/);
});
