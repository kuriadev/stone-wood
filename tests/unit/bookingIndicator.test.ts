import { bookingIndicator } from "@/lib/bookingIndicator";
import type { Booking } from "@/types/booking";

const base = { id: "SW-1", name: "A", email: "", contact: "", date: "2026-11-05", guests: 2, package: "", total: 600, downpayment: 0, status: "Confirmed", paymentProof: true, notes: "" } as unknown as Booking;
const at = (over: Partial<Booking>) => ({ ...base, ...over }) as Booking;
const T = "2026-11-01";

describe("bookingIndicator", () => {
  it("asks for approval in amber, red once the date has passed", () => {
    expect(bookingIndicator(at({ status: "Pending" }), T, 0)).toMatchObject({ label: "Waiting for your approval", signal: "attention" });
    expect(bookingIndicator(at({ status: "Pending", date: "2026-10-30" }), T, 0).signal).toBe("urgent");
  });
  it("follows a confirmed booking through its day", () => {
    expect(bookingIndicator(at({}), T, 0)).toMatchObject({ label: "Coming up · in 4 days", signal: "progress" });
    expect(bookingIndicator(at({ date: "2026-11-02" }), T, 0).label).toBe("Coming tomorrow");
    expect(bookingIndicator(at({ date: T }), T, 0)).toMatchObject({ label: "Arriving today", signal: "attention" });
    expect(bookingIndicator(at({ date: T, checkedInAt: "x" }), T, 0)).toMatchObject({ label: "On site now", signal: "progress" });
    expect(bookingIndicator(at({ date: T, checkedInAt: "x", checkedOutAt: "y" }), T, 200).signal).toBe("urgent");
    expect(bookingIndicator(at({ date: "2026-10-28" }), T, 0)).toMatchObject({ label: "Late · never checked in", signal: "urgent" });
  });
  it("shows a waiting date change", () => {
    expect(bookingIndicator(at({}), T, 0, true).label).toBe("Asks to change date");
  });
  it("greys out what is closed, and never calls a cancellation urgent", () => {
    expect(bookingIndicator(at({ status: "Cancelled" }), T, 0).signal).toBe("closed");
    expect(bookingIndicator(at({ status: "Completed" }), T, 0)).toMatchObject({ label: "Done", signal: "done" });
    expect(bookingIndicator(at({ status: "Completed" }), T, 100).signal).toBe("urgent");
    expect(bookingIndicator(at({ status: "ResortCancelled" }), T, 0).signal).toBe("guest");
  });
});
