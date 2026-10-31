import { validateRetention, retentionCutoff, isPurgeable, monthsLabel } from "@/lib/retention";

describe("data retention", () => {
  it("is off by default and takes whole months from 1 to 120", () => {
    expect(validateRetention({})).toEqual({ ok: true, settings: { enabled: false, months: 12 } });
    expect(validateRetention({ enabled: true, months: 6 })).toEqual({ ok: true, settings: { enabled: true, months: 6 } });
    expect(validateRetention({ enabled: true, months: 0 }).ok).toBe(false);
    expect(validateRetention({ enabled: true, months: 2.5 }).ok).toBe(false);
    expect(validateRetention({ enabled: true, months: 121 }).ok).toBe(false);
    expect(validateRetention({ enabled: "yes", months: 12 })).toEqual({ ok: true, settings: { enabled: false, months: 12 } });
  });

  it("counts the cutoff back in calendar months, clamping short months", () => {
    expect(retentionCutoff("2026-11-01", 12)).toBe("2025-11-01");
    expect(retentionCutoff("2026-11-01", 6)).toBe("2026-05-01");
    expect(retentionCutoff("2026-03-31", 1)).toBe("2026-02-28");
    expect(retentionCutoff("2026-01-15", 2)).toBe("2025-11-15");
  });

  it("deletes only finished bookings whose stay ended before the cutoff", () => {
    const cut = "2025-11-01";
    expect(isPurgeable({ status: "Completed", date: "2025-10-20" }, cut)).toBe(true);
    expect(isPurgeable({ status: "Cancelled", date: "2025-01-02" }, cut)).toBe(true);
    expect(isPurgeable({ status: "Completed", date: "2025-11-01" }, cut)).toBe(false);
    // A stay that began before the cutoff but ended after it is kept.
    expect(isPurgeable({ status: "Completed", date: "2025-10-30", endDate: "2025-11-02" }, cut)).toBe(false);
  });

  it("never deletes live bookings or one with a refund still owed", () => {
    const cut = "2025-11-01";
    for (const status of ["Pending", "Confirmed", "ResortCancelled"]) {
      expect(isPurgeable({ status, date: "2024-01-01" }, cut)).toBe(false);
    }
    expect(isPurgeable({ status: "Cancelled", date: "2024-01-01", refundStatus: "Owed" }, cut)).toBe(false);
    expect(isPurgeable({ status: "Cancelled", date: "2024-01-01", refundStatus: "Sent" }, cut)).toBe(true);
  });

  it("says the period in years and months", () => {
    expect(monthsLabel(6)).toBe("6 months");
    expect(monthsLabel(12)).toBe("1 year");
    expect(monthsLabel(30)).toBe("2 years 6 months");
  });
});
