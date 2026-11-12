import { validateSettings, applySettings, DEFAULT_SETTINGS, settingsFieldErrors } from "@/lib/settings";
import { priceBooking } from "@/lib/pricing";

const base = { resource: "Pool" as const, overtime: 0, roomPrices: [] as number[] };
afterEach(() => applySettings(DEFAULT_SETTINGS));

describe("Night Stay and Staycation rates", () => {
  it("price each booking type at its own rate", () => {
    applySettings({ ...DEFAULT_SETTINGS, rates: { ...DEFAULT_SETTINGS.rates, sharedPerHead: 200, sharedPerHeadNight: 250, sharedPerHeadStay: 380, exclusiveFlat: 6000, exclusiveNight: 7000, exclusiveStay: 11000 } });
    expect(priceBooking({ ...base, tier: "Shared", slot: "Day", guests: 10 }).total).toBe(2000);
    expect(priceBooking({ ...base, tier: "Shared", slot: "Night", guests: 10 }).total).toBe(2500);
    expect(priceBooking({ ...base, tier: "Shared", slot: "WholeDay", guests: 10 }).total).toBe(3800);
    expect(priceBooking({ ...base, tier: "Exclusive", slot: "Night", guests: 5 }).total).toBe(7000);
    expect(priceBooking({ ...base, tier: "Exclusive", slot: "WholeDay", guests: 5 }).total).toBe(11000);
  });

  it("keep today's prices until the owner changes them", () => {
    expect(priceBooking({ ...base, tier: "Shared", slot: "WholeDay", guests: 10 }).total).toBe(2 * priceBooking({ ...base, tier: "Shared", slot: "Day", guests: 10 }).total);
    expect(priceBooking({ ...base, tier: "Exclusive", slot: "Night", guests: 5 }).total).toBe(priceBooking({ ...base, tier: "Exclusive", slot: "Day", guests: 5 }).total);
  });

  it("start older saved settings from the owner's own Day rates", () => {
    const v = validateSettings({ rates: { sharedPerHead: 300, exclusiveFlat: 6500, venue: 5000, overtimePerHour: 500 } });
    expect(v.ok && v.settings.rates).toMatchObject({ sharedPerHeadNight: 300, sharedPerHeadStay: 600, exclusiveNight: 6500, exclusiveStay: 13000 });
  });

  it("insist the whole pool costs more than one Shared guest, for each type", () => {
    const s = structuredClone(DEFAULT_SETTINGS); s.rates.exclusiveNight = 100;
    expect(settingsFieldErrors(s)["rates.exclusiveNight"]).toMatch(/more than one shared-pool guest/);
  });
});
