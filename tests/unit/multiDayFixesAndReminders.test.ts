/* Fixes from the 2026-10-12 review, and the day-before reminder.
 *
 * A charge added on the day to a stay of several days used to be priced
 * for one day while the room was held for all of them. And guests had no
 * reminder at all; the reminder text now says the date, the hours and what
 * is still to pay.
 */

import type { Booking } from "@/types/booking";
import { priceCharge } from "@/lib/charges";
import { notices } from "@/lib/notices";
import { applySettings, DEFAULT_SETTINGS } from "@/lib/settings";

const booking = (over: Partial<Booking>): Booking => ({
  id: "SW-10200", name: "Ana Santos", contact: "09171234567", email: "ana@example.com", date: "2026-10-20",
  guests: 10, package: "Whole Day", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  resource: "Pool", tier: "Shared", slot: "WholeDay",
  ...over,
});

const room = { id: 4, name: "Room 1 – Queen & Deck", price: 2500, beds: "", capacity: 2, desc: "", img: "" } as never;

beforeAll(() => applySettings(DEFAULT_SETTINGS));

describe("a charge on a stay of several days", () => {
  it("prices a room for every day of a three-day Whole Day", () => {
    const one = priceCharge(booking({}), { kind: "room", roomId: 4 }, [room]);
    const three = priceCharge(booking({ endDate: "2026-10-22" }), { kind: "room", roomId: 4 }, [room]);
    expect(one.ok && one.amount).toBe(5000);      // 2 slots × ₱2,500
    expect(three.ok && three.amount).toBe(15000); // × 3 days
    expect(three.ok && three.label).toMatch(/× 3 days/);
  });

  it("prices extra guests for every day too", () => {
    const r = priceCharge(booking({ endDate: "2026-10-21" }), { kind: "guests", guests: 2 }, []);
    expect(r.ok && r.amount).toBe(2 * 200 * 2 * 2); // guests × rate × slots × days
  });

  it("leaves a one-day booking priced as before", () => {
    const r = priceCharge(booking({ slot: "Day", package: "Day Stay" }), { kind: "guests", guests: 1 }, []);
    expect(r.ok && r.amount).toBe(200);
  });
});

describe("the day-before reminder", () => {
  const link = "https://stonewood.example/my-booking?booking=SW-10200&t=x";

  it("tells the guest the date, the hours and the balance to bring", () => {
    const n = notices.reminder(booking({ slot: "Day", package: "Day Stay" }), link, 1500);
    expect(n.sms).toContain("See you tomorrow");
    expect(n.sms).toContain("7:00 AM – 5:00 PM");
    expect(n.sms).toContain("₱1,500");
    expect(n.sms).toContain(link);
    expect(n.email.subject).toBe("See you tomorrow – SW-10200");
  });

  it("says nothing about money when it is paid", () => {
    const n = notices.reminder(booking({ slot: "Night", package: "Night Stay" }), link, 0);
    expect(n.sms).not.toMatch(/Balance/);
    expect(n.email.paragraphs.join(" ")).toMatch(/fully paid/);
  });
});

describe("staff can change the number of guests on any booking", () => {
  it("an Exclusive booking charges every extra guest, like a Shared one", () => {
    const r = priceCharge(booking({ tier: "Exclusive", guests: 2 }), { kind: "guests", guests: 20 }, []);
    expect(r.ok && r.amount).toBe(20 * 200 * 2); // guests × rate × the Whole Day's 2 stays
    expect(r.ok && r.next.guests).toBe(22);
  });

  it("never goes past 100 guests, even with the override", () => {
    const big = booking({ tier: "Exclusive", guests: 90 });
    expect(priceCharge(big, { kind: "guests", guests: 10, overCapacity: true }, []).ok).toBe(true);   // 100
    expect(priceCharge(big, { kind: "guests", guests: 11, overCapacity: true }, []).ok).toBe(false);  // 101
  });

  it("a venue-only booking goes up to the venue's capacity, then needs the override", () => {
    const venue = booking({ resource: "Venue", tier: "Exclusive", guests: 45, slot: "Day", package: "Events Venue" });
    expect(priceCharge(venue, { kind: "guests", guests: 5 }, []).ok).toBe(true);    // 50, the venue's capacity
    expect(priceCharge(venue, { kind: "guests", guests: 6 }, []).ok).toBe(false);   // 51 without the override
    expect(priceCharge(venue, { kind: "guests", guests: 6, overCapacity: true }, []).ok).toBe(true);
  });

  it("an Exclusive pool booking over 30 needs the override", () => {
    const ex = booking({ tier: "Exclusive", guests: 30 });
    expect(priceCharge(ex, { kind: "guests", guests: 2 }, []).ok).toBe(false);
    const over = priceCharge(ex, { kind: "guests", guests: 2, overCapacity: true }, []);
    expect(over.ok && over.next.guests).toBe(32);
  });
});
