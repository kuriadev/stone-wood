/* Rates & Settings — the owner's numbers instead of the developer's.
 *
 * These pin three promises: an empty settings record changes nothing (the
 * defaults are exactly what the code always used), a bad record is refused
 * with a reason instead of silently fixed, and a saved record really does
 * change every price, limit and hour that reads it.
 */

import { DEFAULT_SETTINGS, validateSettings, applySettings, settingsChanges, hourOption, type BusinessSettings } from "@/lib/settings";
import { priceBooking } from "@/lib/pricing";
import { rateCards } from "@/lib/constants";
import * as V from "@/lib/validators";
import { SLOTS, RESORT_CONTACT, TURNOVER_WINDOW as _T } from "@/lib/resort";
import * as R from "@/lib/resort";

const withChanges = (patch: Partial<{ [G in keyof BusinessSettings]: Partial<BusinessSettings[G]> }>) => {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const [g, v] of Object.entries(patch)) Object.assign((out as unknown as Record<string, object>)[g], v);
  return out;
};

afterEach(() => applySettings(DEFAULT_SETTINGS));
void _T;

describe("the defaults are what the code always used", () => {
  it("matches the built-in constants", () => {
    applySettings(DEFAULT_SETTINGS);
    expect(V.SHARED_PER_HEAD_RATE).toBe(200);
    expect(V.EXCLUSIVE_FLAT_RATE).toBe(6000);
    expect(V.EVENT_VENUE_RATE).toBe(5000);
    expect(V.RESORT_MAX_CAPACITY).toBe(30);
    expect(V.MAX_STAY_DAYS).toBe(3);
    expect(SLOTS.Day.hours).toBe("7:00 AM – 5:00 PM");
    expect(SLOTS.Night.hours).toBe("7:00 PM – 5:00 AM, next day");
  });

  it("treats an empty record as all defaults", () => {
    const v = validateSettings({});
    expect(v.ok && v.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("a saved record changes what the app uses", () => {
  it("prices a Shared group at the owner's rate", () => {
    const before = priceBooking({ resource: "Pool", tier: "Shared", slot: "Day", guests: 10, overtime: 0, roomPrices: [] }).total;
    applySettings(withChanges({ rates: { sharedPerHead: 250 } }));
    const after = priceBooking({ resource: "Pool", tier: "Shared", slot: "Day", guests: 10, overtime: 0, roomPrices: [] }).total;
    expect(before).toBe(2000);
    expect(after).toBe(2500);
  });

  it("prices an Exclusive tour at the owner's flat rate, with no discount", () => {
    applySettings(withChanges({ rates: { exclusiveFlat: 7000 } }));
    expect(priceBooking({ resource: "Pool", tier: "Exclusive", slot: "Day", guests: 5, overtime: 0, roomPrices: [] }).total).toBe(7000);
  });

  it("reads a record saved with the old discounts, without them", () => {
    const v = validateSettings({ ...DEFAULT_SETTINGS, discounts: { exclusive: 5, bundle: 10, roomBundle: 8, multiDay: 15 } });
    expect(v.ok && v.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("puts the owner's rates and hours on the home page's rate cards", () => {
    applySettings(withChanges({ rates: { sharedPerHead: 250, exclusiveFlat: 7000 }, hours: { dayStart: 8, dayEnd: 16, nightStart: 18, nightEnd: 28 } }));
    const [day] = rateCards([{ price: 1800 }, { price: 2600 }]);
    expect(day.base).toBe(250);
    expect(day.desc).toContain("8:00 AM – 4:00 PM");
    expect(day.details.join(" ")).toContain("₱7,000");
    const room = rateCards([{ price: 1800 }, { price: 2600 }]).find((c) => c.id === "room")!;
    expect(room.details[0]).toBe("₱1,800–₱2,600 per room, per tour");
  });

  it("moves the capacity everywhere it is read", () => {
    applySettings(withChanges({ limits: { resortCapacity: 40 } }));
    expect(V.GUESTS_MAX).toBe(40);
    expect(V.RESORT_SHARED_CAPACITY).toBe(40);
  });

  it("changes the hours and the turnover between groups", () => {
    applySettings(withChanges({ hours: { dayStart: 8, dayEnd: 16, nightStart: 18, nightEnd: 28 } }));
    expect(SLOTS.Day.hours).toBe("8:00 AM – 4:00 PM");
    expect(SLOTS.WholeDay.startHour).toBe(8);
    expect(SLOTS.WholeDay.endHour).toBe(28);
    expect(R.TURNOVER_WINDOW).toBe("4:00 – 6:00 PM");
    expect(R.MORNING_TURNOVER_WINDOW).toBe("4:00 – 8:00 AM");
  });

  it("changes the contact details guests see", () => {
    applySettings(withChanges({ contact: { phone: "+63 917 000 0000" } }));
    expect(RESORT_CONTACT.phone).toBe("+63 917 000 0000");
  });
});

describe("a bad record is refused with a reason", () => {
  it("refuses an Exclusive rate of zero", () => {
    const v = validateSettings({ rates: { exclusiveFlat: 0 } });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.error).toMatch(/Exclusive rate/);
  });

  it("refuses a fractional capacity", () => {
    expect(validateSettings({ limits: { resortCapacity: 30.5 } }).ok).toBe(false);
  });

  it("refuses a timetable with no time to clean between groups", () => {
    const v = validateSettings({ hours: { dayEnd: 19, nightStart: 19 } });
    expect(!v.ok && v.error).toMatch(/an hour between/);
  });

  it("refuses a night that runs into the next morning's opening", () => {
    const v = validateSettings({ hours: { dayStart: 7, nightEnd: 31 } });
    expect(!v.ok && v.error).toMatch(/before the next Day Tour/);
  });

  it("refuses a tour shorter than four hours", () => {
    expect(validateSettings({ hours: { dayStart: 9, dayEnd: 12 } }).ok).toBe(false);
  });

  it("refuses a contact email or Messenger link that can't work", () => {
    expect(validateSettings({ contact: { email: "not-an-email" } }).ok).toBe(false);
    expect(validateSettings({ contact: { messenger: "m.me/x" } }).ok).toBe(false);
  });
});

describe("for the owner's screen", () => {
  it("lists what changed, for the activity log", () => {
    expect(settingsChanges(DEFAULT_SETTINGS, withChanges({ rates: { venue: 5500 } }))).toEqual(["rates.venue: 5000 → 5500"]);
  });

  it("labels hours past midnight as the next day", () => {
    expect(hourOption(7)).toBe("7:00 AM");
    expect(hourOption(24)).toBe("12:00 AM (next day)");
    expect(hourOption(29)).toBe("5:00 AM (next day)");
  });
});
