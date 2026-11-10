import { validateSettings, applySettings, DEFAULT_SETTINGS, settingsFieldErrors } from "@/lib/settings";
import { priceBooking } from "@/lib/pricing";

const base = { resource: "Pool" as const, overtime: 0, roomPrices: [] as number[] };
afterEach(() => applySettings(DEFAULT_SETTINGS));

describe("child rates (under 3)", () => {
  it("charge a Shared child half the adult rate by default", () => {
    // 3 adults + 2 children: 3 x 200 + 2 x 100.
    expect(priceBooking({ ...base, tier: "Shared", slot: "Day", guests: 3, children: 2 }).total).toBe(800);
    expect(priceBooking({ ...base, tier: "Shared", slot: "Night", guests: 3, children: 2 }).total).toBe(800);
  });

  it("follow the owner's rates, and stay free in Exclusive", () => {
    applySettings({ ...DEFAULT_SETTINGS, rates: { ...DEFAULT_SETTINGS.rates, childPerHead: 50, childPerHeadNight: 0 } });
    expect(priceBooking({ ...base, tier: "Shared", slot: "Day", guests: 2, children: 2 }).total).toBe(500);
    expect(priceBooking({ ...base, tier: "Shared", slot: "Night", guests: 2, children: 2 }).total).toBe(400);
    expect(priceBooking({ ...base, tier: "Exclusive", slot: "Day", guests: 2, children: 2 }).total).toBe(6000);
  });

  it("start older saved settings at half the owner's adult rates", () => {
    const v = validateSettings({ rates: { sharedPerHead: 300, sharedPerHeadNight: 250, exclusiveFlat: 6500, venue: 5000, overtimePerHour: 500 } });
    expect(v.ok && v.settings.rates).toMatchObject({ childPerHead: 150, childPerHeadNight: 125 });
  });

  it("never cost more than an adult", () => {
    const s = structuredClone(DEFAULT_SETTINGS); s.rates.childPerHead = 250;
    expect(settingsFieldErrors(s)["rates.childPerHead"]).toMatch(/more than an adult/);
  });
});
