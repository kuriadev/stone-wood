/* What the resort emails itself.
 *
 * The thing worth protecting here is not the wording, it is the VOLUME. A
 * notification nobody reads is worse than none, because it teaches the
 * owner to ignore the next one. So the first group below pins the rule
 * that keeps the inbox usable: a briefing with nothing in it is not sent.
 */

import type { Booking } from "@/types/booking";
import {
  buildMorningBriefing, buildNewBookingAlert, buildDayClosedEmail, adminNotifyTo,
} from "@/lib/adminNotify";
import { RESORT_CONTACT } from "@/lib/resort";

const TODAY = "2026-10-20";

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "SW-10141", name: "Juan Dela Cruz", contact: "09171234567",
  email: "juan@gmail.com", date: TODAY, guests: 4, package: "Day Tour",
  slot: "Day", rooms: [], overtime: 0, total: 6000, downpayment: 3000,
  status: "Confirmed", paymentProof: true, notes: "", ...over,
});

describe("a quiet day sends nothing", () => {
  it("returns null when there is nothing to report", () => {
    expect(buildMorningBriefing({ date: TODAY, bookings: [] })).toBeNull();
  });

  it("returns null when every booking is on another day", () => {
    const far = [booking({ date: "2026-11-05" }), booking({ id: "SW-2", date: "2026-11-06" })];
    expect(buildMorningBriefing({ date: TODAY, bookings: far })).toBeNull();
  });

  it("ignores archived bookings entirely", () => {
    expect(buildMorningBriefing({ date: TODAY, bookings: [booking({ archived: true })] })).toBeNull();
  });

  it("does send once something is actually happening", () => {
    expect(buildMorningBriefing({ date: TODAY, bookings: [booking()] })).not.toBeNull();
  });
});

describe("the briefing leads with what has run out of time", () => {
  const lapsed = booking({
    id: "SW-9000", status: "ResortCancelled",
    choiceDeadline: "2026-10-18T00:00:00+08:00", heldAmount: 3000,
  });

  it("flags a reschedule deadline that has gone by", () => {
    const mail = buildMorningBriefing({ date: TODAY, bookings: [lapsed], now: new Date("2026-10-20T08:00:00+08:00") })!;
    expect(mail).not.toBeNull();
    expect(mail.subject).toContain("⚠");
    expect(mail.html).toContain("no new date chosen");
    expect(mail.html).toContain("SW-9000");
    // The money still being held is the reason it is urgent.
    expect(mail.html).toContain("3,000");
  });

  it("leaves a deadline still in the future alone", () => {
    const soon = booking({ status: "ResortCancelled", choiceDeadline: "2026-10-25T00:00:00+08:00" });
    const mail = buildMorningBriefing({ date: TODAY, bookings: [soon], now: new Date("2026-10-20T08:00:00+08:00") });
    expect(mail).toBeNull();
  });

  it("does not shout when the day is merely busy", () => {
    const mail = buildMorningBriefing({ date: TODAY, bookings: [booking(), booking({ id: "SW-2" })] })!;
    expect(mail.subject).not.toContain("⚠");
  });
});

describe("the briefing covers the day", () => {
  it("lists who arrives today", () => {
    const mail = buildMorningBriefing({ date: TODAY, bookings: [booking({ name: "Ana Reyes" })] })!;
    expect(mail.html).toContain("Arriving today");
    expect(mail.html).toContain("Ana Reyes");
  });

  it("lists who is due to leave, but only if they checked in", () => {
    const inHouse = booking({ id: "SW-IN", checkedInAt: "2026-10-20T07:10:00+08:00" });
    const notYet = booking({ id: "SW-OUT", date: "2026-10-20" });
    const mail = buildMorningBriefing({ date: TODAY, bookings: [inHouse, notYet] })!;
    expect(mail.html).toContain("Leaving today");
    expect(mail.html).toContain("SW-IN");
  });

  it("says when an arrival is not confirmed yet", () => {
    const mail = buildMorningBriefing({ date: TODAY, bookings: [booking({ status: "Pending" })] })!;
    expect(mail.html).toContain("not confirmed yet");
  });

  it("counts the day in the subject so it reads without opening", () => {
    const mail = buildMorningBriefing({ date: TODAY, bookings: [booking(), booking({ id: "SW-2" })] })!;
    expect(mail.subject).toContain("2 arriving");
  });

  it("drops a section that has nothing in it", () => {
    const mail = buildMorningBriefing({ date: TODAY, bookings: [booking()] })!;
    expect(mail.html).not.toContain("Leaving today");
    expect(mail.html).not.toContain("no new date chosen");
  });
});

describe("the booking alert says whether anything is needed", () => {
  it("asks for nothing when the system already confirmed it", () => {
    const mail = buildNewBookingAlert(booking({ status: "Confirmed" }), 6000);
    expect(mail.subject).toContain("New booking");
    expect(mail.html).toContain("Nothing is needed from you");
  });

  it("asks for a review when the booking was held", () => {
    const mail = buildNewBookingAlert(booking({ status: "Pending" }), 3000);
    expect(mail.subject).toContain("Review");
    expect(mail.html).toContain("accept or decline");
  });

  it("shows what is still owed on arrival", () => {
    expect(buildNewBookingAlert(booking({ total: 6000 }), 3000).html).toContain("on arrival");
  });

  it("escapes a guest's name rather than trusting it", () => {
    const mail = buildNewBookingAlert(booking({ name: "<b>Ana</b>" }), 100);
    expect(mail.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Ana</b>");
  });
});

describe("the day-closed summary", () => {
  it("says so plainly when the drawer balances", () => {
    const mail = buildDayClosedEmail({ date: TODAY, counted: 5000, expected: 5000, checkedOut: [] });
    expect(mail.html).toContain("The drawer balances");
    expect(mail.subject).not.toContain("short");
  });

  it("puts a shortfall in the subject, where it will be seen", () => {
    const mail = buildDayClosedEmail({ date: TODAY, counted: 4500, expected: 5000, checkedOut: [] });
    expect(mail.subject).toContain("short");
    expect(mail.html).toContain("Short by");
  });

  it("reports an overage too", () => {
    expect(buildDayClosedEmail({ date: TODAY, counted: 5500, expected: 5000, checkedOut: [] }).subject).toContain("over");
  });

  it("is where the day's checkouts are reported", () => {
    // Deliberately not one email per checkout: that is the stream that
    // gets a sender filtered.
    const mail = buildDayClosedEmail({
      date: TODAY, counted: 5000, expected: 5000,
      checkedOut: [booking({ id: "SW-A" }), booking({ id: "SW-B" })],
    });
    expect(mail.html).toContain("SW-A");
    expect(mail.html).toContain("SW-B");
  });
});

describe("where it goes", () => {
  it("defaults to the resort's own address", () => {
    expect(adminNotifyTo()).toBe(RESORT_CONTACT.email);
  });
});
