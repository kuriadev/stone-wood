/* The events venue closes before the resort does, and holds more people
 * than the pool area (owner's rules, 2026-11-08).
 *
 * Events bring loud music, crowds and lights, so the hall shuts at the
 * owner's "Events venue closes" (midnight by default) while the Night Tour
 * runs to 5 AM. A venue-only booking ends then; a pool + venue group keeps
 * the night and moves to the pool. A booking is capped by the smallest
 * space its guests use: the hall alone (50), or the pool area (30).
 */

import { DEFAULT_SETTINGS, applySettings, validateSettings, settingsFieldErrors, type BusinessSettings } from "@/lib/settings";
import * as R from "@/lib/resort";
import { slotFor, venueClosesNote, venueCloseText, slotStartedProblem, stayPatternNote } from "@/lib/resort";
import { getOccupancyWindow, stayWindowLabel } from "@/lib/occupancy";
import { guestLimitFor } from "@/lib/validators";
import * as V from "@/lib/validators";
import { packageCapacityLimit } from "@/lib/pricing";
import { checkoutPolicy } from "@/lib/policies";

const withChanges = (patch: Partial<{ [G in keyof BusinessSettings]: Partial<BusinessSettings[G]> }>) => {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const [g, v] of Object.entries(patch)) Object.assign((out as unknown as Record<string, object>)[g], v);
  return out;
};

beforeEach(() => applySettings(DEFAULT_SETTINGS));
afterAll(() => applySettings(DEFAULT_SETTINGS));

describe("the venue's own closing time", () => {
  it("ends a venue-only night at midnight, and leaves every other booking's hours alone", () => {
    expect(slotFor("Night", "Venue").hours).toBe("7:00 PM – 12:00 AM");
    expect(slotFor("Night", "Venue").endsNextDay).toBe(false);
    expect(slotFor("WholeDay", "Venue").hours).toBe("7:00 AM – 12:00 AM");
    expect(slotFor("Day", "Venue").hours).toBe("7:00 AM – 5:00 PM");
    expect(slotFor("Night", "Pool").hours).toBe("7:00 PM – 5:00 AM, next day");
    expect(slotFor("Night", "Pool+Venue").hours).toBe("7:00 PM – 5:00 AM, next day");
    expect(slotFor("Night").hours).toBe("7:00 PM – 5:00 AM, next day");
  });

  it("tells a pool + venue group the hall shuts first, and nobody else", () => {
    expect(venueClosesNote("Night", "Pool+Venue")).toBe("Events venue until 12 midnight");
    expect(venueClosesNote("WholeDay", "Pool+Venue")).toBe("Events venue until 12 midnight");
    expect(venueClosesNote("Day", "Pool+Venue")).toBeNull();
    expect(venueClosesNote("Night", "Venue")).toBeNull();
    expect(venueClosesNote("Night", "Pool")).toBeNull();
  });

  it("times a venue-only night to midnight for the staff screens, and a pool night to 5 AM", () => {
    const venue = getOccupancyWindow({ date: "2026-11-20", slot: "Night", resource: "Venue" })!;
    expect(venue.end.getDate()).toBe(21);
    expect(venue.end.getHours()).toBe(0);
    const pool = getOccupancyWindow({ date: "2026-11-20", slot: "Night", resource: "Pool+Venue" })!;
    expect(pool.end.getHours()).toBe(5);
    expect(stayWindowLabel({ date: "2026-11-20", slot: "Night", resource: "Venue" })!.depart).toMatch(/12:00 AM$/);
  });

  it("closes online booking of tonight's venue 2 hours after the Night Tour starts, like the pool", () => {
    expect(slotStartedProblem("2026-11-20", "Night", new Date("2026-11-20T20:30:00+08:00"), "Venue")).toBeNull();
    expect(slotStartedProblem("2026-11-20", "Night", new Date("2026-11-20T21:30:00+08:00"), "Venue")).toMatch(/closed at 9:00 PM/);
    expect(slotStartedProblem("2026-11-20", "Night", new Date("2026-11-20T21:30:00+08:00"), "Pool")).not.toBeNull();
  });

  it("doesn't describe a venue stay of several days as one unbroken stay", () => {
    expect(stayPatternNote("WholeDay", 2, "Venue")).toMatch(/each day and head home at 12:00 AM, when the events venue closes/);
    expect(stayPatternNote("WholeDay", 2, "Pool")).toMatch(/without a break/);
  });

  it("follows the owner's setting, in the hours and in the quiet-hours policy", () => {
    applySettings(withChanges({ hours: { venueEnd: 23 } }));
    expect(slotFor("Night", "Venue").hours).toBe("7:00 PM – 11:00 PM");
    expect(venueCloseText()).toBe("11:00 PM");
    expect(R.QUIET_HOURS_POLICY).toContain("The events venue closes at 11:00 PM");
    applySettings(DEFAULT_SETTINGS);
    expect(R.QUIET_HOURS_POLICY).toBe("Quiet hours start at 10:00 PM — music, videoke and speakers off. The events venue closes at 12 midnight; a venue-only booking ends then and doesn't include the pool.");
  });

  it("puts the rule in front of the guest before paying", () => {
    const row = checkoutPolicy(false, R.QUIET_HOURS_POLICY).find(([t]) => t === "Quiet hours and the events venue");
    expect(row?.[1]).toContain("12 midnight");
  });
});

describe("the venue's own capacity", () => {
  it("holds a venue-only booking to what the hall holds, and anything with the pool to the resort's limit", () => {
    expect(guestLimitFor("Venue")).toBe(50);
    expect(guestLimitFor("Pool")).toBe(30);
    expect(guestLimitFor("Pool+Venue")).toBe(30);
    expect(packageCapacityLimit("Venue")).toBe(50);
    expect(packageCapacityLimit("Pool+Venue")).toBe(30);
  });

  it("follows the owner's setting, for bookings and packages alike", () => {
    applySettings(withChanges({ limits: { venueCapacity: 80 } }));
    expect(V.VENUE_CAPACITY).toBe(80);
    expect(guestLimitFor("Venue")).toBe(80);
    expect(packageCapacityLimit("Venue")).toBe(80);
    expect(guestLimitFor("Pool")).toBe(30);
  });
});

describe("the settings that hold them", () => {
  it("default to midnight and 50, and an older saved record gets them", () => {
    expect(DEFAULT_SETTINGS.hours.venueEnd).toBe(24);
    expect(DEFAULT_SETTINGS.limits.venueCapacity).toBe(50);
    const { hours, limits, ...rest } = structuredClone(DEFAULT_SETTINGS);
    const { venueEnd: _e, ...oldHours } = hours;
    const { venueCapacity: _c, ...oldLimits } = limits;
    void _e; void _c;
    const v = validateSettings({ ...rest, hours: oldHours, limits: oldLimits });
    expect(v.ok && v.settings.hours.venueEnd).toBe(24);
    expect(v.ok && v.settings.limits.venueCapacity).toBe(50);
  });

  it("refuse a venue that closes after the night ends, or barely opens at night", () => {
    expect(settingsFieldErrors(withChanges({ hours: { venueEnd: 30 } }))["hours.venueEnd"]).toBe("The venue can't close after the Night Tour ends.");
    expect(settingsFieldErrors(withChanges({ hours: { venueEnd: 20 } }))["hours.venueEnd"]).toBe("Give the venue at least 2 hours after the Night Tour starts.");
    expect(settingsFieldErrors(withChanges({ hours: { venueEnd: 24 } }))["hours.venueEnd"]).toBeUndefined();
    expect(settingsFieldErrors(withChanges({ limits: { venueCapacity: 0 } }))["limits.venueCapacity"]).toBe("At least 1.");
  });

  it("keep a stored closing time inside the night if the night moves", () => {
    const v = validateSettings(withChanges({ hours: { nightEnd: 23, venueEnd: 24 } }));
    expect(v.ok && v.settings.hours.venueEnd).toBe(23);
  });
});
