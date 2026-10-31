// The admin bell: what each staff member is told, and in what order.
import { buildNotes, sortNotes, noteWhen } from "@/lib/notifications";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/finance";

const NOW = new Date("2026-10-30T02:00:00Z"); // 10:00 AM, 30 Oct, Manila

const booking = (over: Partial<Booking>): Booking => ({
  id: "SW-1", name: "Juan", email: "j@x.com", contact: "09171234567", date: "2026-11-02",
  guests: 4, status: "Confirmed", total: 3000, slot: "Day", resource: "Pool", tier: "Shared",
  ...over,
} as Booking);

const pay = (over: Partial<Payment>): Payment => ({
  id: 1, bookingId: "SW-1", guestName: "Juan", type: "Down Payment", method: "GCash", amount: 1500,
  reference: "", notes: "", receivedAt: "2026-10-30T01:30:00Z", voided: false, ...over,
} as Payment);

const notes = (over: Partial<Parameters<typeof buildNotes>[0]> = {}) =>
  buildNotes({ bookings: [], payments: [], dateChanges: [], inspections: [], messages: [], requests: [], now: NOW, ...over });

describe("buildNotes", () => {
  it("tells staff about a new booking and the money that came in", () => {
    const n = notes({
      bookings: [booking({ createdAt: Date.parse("2026-10-30T01:00:00Z") })],
      payments: [pay({})],
    });
    expect(n.find((x) => x.id === "new-SW-1")).toMatchObject({ action: false, title: "New online booking", perm: "bookings.view" });
    expect(n.find((x) => x.id === "pay-1")).toMatchObject({ title: "₱1,500 received", perm: "payments.record" });
  });

  it("does not report voided payments or anything older than a week", () => {
    const n = notes({
      payments: [pay({ voided: true }), pay({ id: 2, receivedAt: "2026-10-01T00:00:00Z" })],
      bookings: [booking({ createdAt: Date.parse("2026-10-01T00:00:00Z") })],
    });
    expect(n).toHaveLength(0);
  });

  it("lists bookings waiting for approval and groups arriving tomorrow as things to do", () => {
    const n = notes({
      bookings: [
        booking({ id: "SW-2", status: "Pending", createdAt: Date.parse("2026-10-30T00:00:00Z") }),
        booking({ id: "SW-3", date: "2026-10-31" }),
      ],
    });
    expect(n.find((x) => x.id === "approve-SW-2")).toMatchObject({ action: true, perm: "bookings.edit" });
    expect(n.find((x) => x.id === "tomorrow-SW-3")).toMatchObject({ action: true, title: "Arriving tomorrow", perm: "ops.view" });
  });

  it("flags low stock once a day, for whoever sees the stock", () => {
    const n = notes({ inventory: [{ name: "Chlorine", qty: 1, minQty: 3 }, { name: "Towels", qty: 20, minQty: 5 }] });
    expect(n).toEqual([expect.objectContaining({ id: "stock-2026-10-30", perm: "inventory.view", body: "Chlorine (1 left)" })]);
  });

  it("puts what to do first, soonest first, then what happened, newest first", () => {
    const sorted = sortNotes(notes({
      bookings: [
        booking({ id: "SW-4", date: "2026-10-31", createdAt: Date.parse("2026-10-29T00:00:00Z") }),
        booking({ id: "SW-5", status: "Pending", date: "2026-11-05", createdAt: Date.parse("2026-10-30T01:00:00Z") }),
      ],
      payments: [pay({ receivedAt: "2026-10-30T01:50:00Z" })],
    }));
    expect(sorted.map((x) => x.id)).toEqual(["approve-SW-5", "tomorrow-SW-4", "pay-1", "new-SW-5", "new-SW-4"]);
  });
});

describe("noteWhen", () => {
  it("speaks in minutes, hours and days", () => {
    expect(noteWhen("2026-10-30T01:59:40Z", NOW)).toBe("Just now");
    expect(noteWhen("2026-10-30T01:48:00Z", NOW)).toBe("12 min ago");
    expect(noteWhen("2026-10-30T05:00:00Z", NOW)).toBe("in 3 h");
    expect(noteWhen("2026-10-28T20:00:00Z", NOW)).toBe("Yesterday");
  });
});
