import {
  validateRetention, retentionCutoff, isPurgeable, isArchivable, isDeletableFromArchive, monthsLabel,
  lastScheduledOn, nextScheduledOn, purgeDueFor, scheduleLabel, DEFAULT_RETENTION,
} from "@/lib/retention";

describe("auto-archive and data retention", () => {
  it("archives after 2 months by default and never deletes unless switched on", () => {
    expect(validateRetention({})).toEqual({ ok: true, settings: DEFAULT_RETENTION });
    expect(DEFAULT_RETENTION).toMatchObject({ archiveEnabled: true, archiveMonths: 2, enabled: false });
    expect(validateRetention({ archiveMonths: 0 }).ok).toBe(false);
    expect(validateRetention({ archiveMonths: 2.5 }).ok).toBe(false);
    expect(validateRetention({ archiveMonths: 25 }).ok).toBe(false);
    expect(validateRetention({ day: 32 }).ok).toBe(false);
    expect(validateRetention({ schedule: "yearly", month: 13 }).ok).toBe(false);
    // Only a real `true` turns deletion on.
    expect(validateRetention({ enabled: "yes" })).toMatchObject({ ok: true, settings: { enabled: false } });
    expect(validateRetention({ archiveEnabled: false })).toMatchObject({ ok: true, settings: { archiveEnabled: false } });
  });

  it("counts the cutoff back in calendar months, clamping short months", () => {
    expect(retentionCutoff("2026-11-01", 12)).toBe("2025-11-01");
    expect(retentionCutoff("2026-11-01", 2)).toBe("2026-09-01");
    expect(retentionCutoff("2026-03-31", 1)).toBe("2026-02-28");
    expect(retentionCutoff("2026-01-15", 2)).toBe("2025-11-15");
  });

  it("archives only finished bookings whose stay ended before the cutoff", () => {
    const cut = "2026-09-01";
    expect(isArchivable({ status: "Completed", date: "2026-08-20" }, cut)).toBe(true);
    expect(isArchivable({ status: "Cancelled", date: "2026-01-02" }, cut)).toBe(true);
    expect(isArchivable({ status: "Completed", date: "2026-09-01" }, cut)).toBe(false);
    // A stay that began before the cutoff but ended after it is kept.
    expect(isArchivable({ status: "Completed", date: "2026-08-30", endDate: "2026-09-02" }, cut)).toBe(false);
    // Already archived: nothing to do.
    expect(isArchivable({ status: "Completed", date: "2026-01-01", archived: true }, cut)).toBe(false);
  });

  it("never touches live bookings or one with a refund still owed", () => {
    const cut = "2025-11-01";
    for (const status of ["Pending", "Confirmed", "ResortCancelled"]) {
      expect(isPurgeable({ status, date: "2024-01-01" }, cut)).toBe(false);
      expect(isDeletableFromArchive({ status, date: "2024-01-01", archived: true })).toBe(false);
    }
    expect(isPurgeable({ status: "Cancelled", date: "2024-01-01", refundStatus: "Owed" }, cut)).toBe(false);
    expect(isDeletableFromArchive({ status: "Cancelled", date: "2024-01-01", refundStatus: "Owed", archived: true })).toBe(false);
    expect(isDeletableFromArchive({ status: "Cancelled", date: "2024-01-01", refundStatus: "Sent", archived: true })).toBe(true);
    // Deletion is for the archive only.
    expect(isDeletableFromArchive({ status: "Completed", date: "2024-01-01" })).toBe(false);
  });

  it("finds the last and next scheduled dates, monthly and yearly", () => {
    const monthly = { schedule: "monthly" as const, day: 15, month: 1 };
    expect(lastScheduledOn("2026-11-20", monthly)).toBe("2026-11-15");
    expect(lastScheduledOn("2026-11-10", monthly)).toBe("2026-10-15");
    expect(nextScheduledOn("2026-11-10", monthly)).toBe("2026-11-15");
    expect(nextScheduledOn("2026-11-15", monthly)).toBe("2026-12-15");
    // The 31st in a 30-day month is its last day.
    expect(lastScheduledOn("2026-11-30", { schedule: "monthly", day: 31, month: 1 })).toBe("2026-11-30");
    const yearly = { schedule: "yearly" as const, day: 1, month: 3 };
    expect(lastScheduledOn("2026-11-01", yearly)).toBe("2026-03-01");
    expect(lastScheduledOn("2026-02-01", yearly)).toBe("2025-03-01");
    expect(nextScheduledOn("2026-11-01", yearly)).toBe("2027-03-01");
  });

  it("deletes on the scheduled date, catches up a missed one, and never twice", () => {
    const s = { ...DEFAULT_RETENTION, enabled: true, schedule: "monthly" as const, day: 1, enabledOn: "2026-10-10" };
    // Switched on after October 1st: not due until November 1st.
    expect(purgeDueFor("2026-10-20", s)).toBeNull();
    expect(purgeDueFor("2026-11-01", s)).toBe("2026-11-01");
    // Nobody opened the Dashboard on the 1st: it runs on the 3rd instead.
    expect(purgeDueFor("2026-11-03", s)).toBe("2026-11-01");
    // Already done for November 1st.
    expect(purgeDueFor("2026-11-03", { ...s, lastPurgeOn: "2026-11-01" })).toBeNull();
    expect(purgeDueFor("2026-11-01", { ...s, enabled: false })).toBeNull();
  });

  it("says the period and the schedule in words", () => {
    expect(monthsLabel(2)).toBe("2 months");
    expect(monthsLabel(12)).toBe("1 year");
    expect(monthsLabel(30)).toBe("2 years 6 months");
    expect(scheduleLabel({ schedule: "monthly", day: 1, month: 1 })).toBe("on the 1st of every month");
    expect(scheduleLabel({ schedule: "yearly", day: 15, month: 3 })).toBe("every March 15");
  });
});
