/* The gaps found by walking the booking rules as a customer and a tester:
 *
 *   - "today" followed the machine's time zone, so a UTC server thought it
 *     was still yesterday until 8 AM in Manila;
 *   - today's tour could be booked online after it had started (or ended);
 *   - one guest could book the venue and a shared pool tour separately and
 *     get "Resort visit + Events Venue" without it being Exclusive;
 *   - an Exclusive group had no way to pay for the hall on the day.
 */

import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import { manilaNow } from "@/lib/validators";
import { slotStartedProblem } from "@/lib/resort";
import { splitBookingMatch } from "@/lib/utils";
import { chargeKindsFor, priceCharge } from "@/lib/charges";
import { EVENT_VENUE_RATE } from "@/lib/validators";

// 2026-10-20 in Manila (UTC+8) at the given hour, as a real instant.
const manila = (hour: number, day = 20) => new Date(Date.UTC(2026, 9, day, hour - 8, 30));

describe("today is Manila's today, whatever the machine's time zone", () => {
  it("is already the 20th at 1:30 AM in Manila (17:30 UTC on the 19th)", () => {
    expect(manilaNow(manila(1))).toEqual({ date: "2026-10-20", hour: 1 });
  });
  it("reads the hour on the 24-hour clock", () => {
    expect(manilaNow(manila(19)).hour).toBe(19);
  });
});

describe("today's tour can't be booked online once it has started", () => {
  it("allows today's Day Tour before 7 AM and refuses it after", () => {
    expect(slotStartedProblem("2026-10-20", "Day", manila(6))).toBeNull();
    expect(slotStartedProblem("2026-10-20", "Day", manila(7))).not.toBeNull();
    expect(slotStartedProblem("2026-10-20", "Day", manila(21))).not.toBeNull();
  });
  it("still allows tonight's Night Tour during the day", () => {
    expect(slotStartedProblem("2026-10-20", "Night", manila(15))).toBeNull();
    expect(slotStartedProblem("2026-10-20", "Night", manila(19))).not.toBeNull();
  });
  it("treats a Staycation like the Day Tour it starts with", () => {
    expect(slotStartedProblem("2026-10-20", "WholeDay", manila(9))).not.toBeNull();
  });
  it("never blocks a future date", () => {
    expect(slotStartedProblem("2026-10-21", "Day", manila(23))).toBeNull();
  });
});

const booking = (over: Partial<Booking>): Booking => ({
  id: "SW-1", name: "Ana Cruz", contact: "0917 123 4567", email: "ana@example.com", date: "2026-10-20",
  guests: 10, package: "Day Tour", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  slot: "Day", resource: "Pool", tier: "Shared",
  ...over,
});

describe("one guest can't split Resort visit + Events Venue into two bookings", () => {
  const sharedPool = booking({ id: "SW-POOL" });
  const hall = booking({ id: "SW-HALL", resource: "Venue", tier: "Exclusive" });
  const req = { resource: "Venue" as const, tier: "Exclusive" as const, name: "Someone", email: "x@example.com", contact: "" };

  it("refuses the venue when the same email has a shared pool booking that day", () => {
    expect(splitBookingMatch({ ...req, email: "ANA@example.com " }, [sharedPool]).same?.id).toBe("SW-POOL");
  });
  it("refuses it on the same phone number, however it's written", () => {
    expect(splitBookingMatch({ ...req, contact: "+63 917-123-4567" }, [sharedPool]).same?.id).toBe("SW-POOL");
  });
  it("refuses the shared pool when the same guest has the venue", () => {
    const pool = { resource: "Pool" as const, tier: "Shared" as const, name: "", email: "ana@example.com", contact: "" };
    expect(splitBookingMatch(pool, [hall]).same?.id).toBe("SW-HALL");
  });
  it("only flags a match on name alone, which could be a coincidence", () => {
    const r = splitBookingMatch({ ...req, name: "  ana  CRUZ " }, [sharedPool]);
    expect(r.same).toBeUndefined();
    expect(r.maybe?.id).toBe("SW-POOL");
  });
  it("ignores other guests, cancelled bookings and Exclusive pool bookings", () => {
    expect(splitBookingMatch(req, [sharedPool])).toEqual({});
    expect(splitBookingMatch({ ...req, email: "ana@example.com" }, [{ ...sharedPool, status: "Cancelled" }])).toEqual({});
    expect(splitBookingMatch({ ...req, email: "ana@example.com" }, [{ ...sharedPool, tier: "Exclusive" }])).toEqual({});
  });
});

describe("the front desk can add the events venue to an Exclusive booking", () => {
  const rooms: Room[] = [];
  it("charges the venue rate per slot and turns it into Resort visit + Events Venue", () => {
    const b = booking({ tier: "Exclusive" });
    const r = priceCharge(b, { kind: "venue" }, rooms);
    expect(r.ok && r.amount).toBe(EVENT_VENUE_RATE);
    expect(r.ok && r.next.resource).toBe("Pool+Venue");
  });
  it("charges a Staycation for both slots of every day", () => {
    const b = booking({ tier: "Exclusive", slot: "WholeDay", endDate: "2026-10-21" });
    const r = priceCharge(b, { kind: "venue" }, rooms);
    expect(r.ok && r.amount).toBe(EVENT_VENUE_RATE * 2 * 2);
  });
  it("isn't offered on a shared tour or a booking that already has the venue", () => {
    expect(chargeKindsFor(booking({})).venue).not.toBeNull();
    expect(chargeKindsFor(booking({ resource: "Pool+Venue", tier: "Exclusive" })).venue).not.toBeNull();
    expect(chargeKindsFor(booking({ tier: "Exclusive" })).venue).toBeNull();
  });
});
