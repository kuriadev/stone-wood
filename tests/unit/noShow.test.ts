import { isNoShow, statusKey, bookingStatusLabel, noShowLine, NO_SHOW } from "@/lib/labels";

describe("only Mark no-show makes a booking a No-show", () => {
  it("needs the flag the button sets, not the reason text", () => {
    expect(isNoShow({ status: "Cancelled", noShow: true })).toBe(true);
    // Cancelled the ordinary way, even with "no show" typed as the reason.
    expect(isNoShow({ status: "Cancelled" })).toBe(false);
    expect(isNoShow({ status: "Confirmed", noShow: true })).toBe(false);
  });
  it("labels and keys it as No-show, and anything else as Cancelled", () => {
    expect(statusKey({ status: "Cancelled", noShow: true })).toBe(NO_SHOW);
    expect(bookingStatusLabel({ status: "Cancelled", noShow: true })).toBe("No-show");
    expect(bookingStatusLabel({ status: "Cancelled" })).toBe("Cancelled");
  });
  it("writes one standard reason line", () => {
    expect(noShowLine("")).toBe("No-show: the group did not arrive.");
    expect(noShowLine("No show")).toBe("No-show: the group did not arrive.");
    expect(noShowLine("Couldn't be reached")).toBe("No-show: Couldn't be reached");
  });
});

import { noShowChoiceOpen, isNoShowRebook, NO_SHOW_CHOICE_DAYS } from "@/lib/rebooking";
import { can } from "@/lib/permissions";

describe("after a no-show the guest can still pick a new date", () => {
  const now = Date.parse("2026-11-06T04:00:00Z");
  const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString();
  it("is open only for a no-show, until its deadline", () => {
    expect(NO_SHOW_CHOICE_DAYS).toBe(20);
    expect(noShowChoiceOpen({ status: "Cancelled", noShow: true, choiceDeadline: inDays(5) }, now)).toBe(true);
    expect(noShowChoiceOpen({ status: "Cancelled", noShow: true, choiceDeadline: inDays(-1) }, now)).toBe(false);
    // Not offered yet (the email goes out the day after).
    expect(noShowChoiceOpen({ status: "Cancelled", noShow: true }, now)).toBe(false);
    // An ordinary cancellation never gets one.
    expect(noShowChoiceOpen({ status: "Cancelled", choiceDeadline: inDays(5) }, now)).toBe(false);
  });
  it("tells a no-show's pick apart from other requests", () => {
    expect(isNoShowRebook({ status: "Pending" }, { status: "Cancelled", noShow: true })).toBe(true);
    expect(isNoShowRebook({ status: "Pending" }, { status: "Confirmed" })).toBe(false);
    expect(isNoShowRebook({ status: "Approved" }, { status: "Cancelled", noShow: true })).toBe(false);
  });
  it("lets the front desk mark no-shows without the super admin", () => {
    expect(can("FrontDesk", "bookings.noshow")).toBe(true);
    expect(can("FrontDesk", "bookings.cancel")).toBe(false);
    expect(can("Owner", "bookings.noshow")).toBe(true);
  });
});
