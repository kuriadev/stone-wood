/** Day-of charges (overtime, extra guests, room) — they raise the booking total that Sales/Settle collect (TC-14). */
import { priceCharge, chargeKindsFor } from "@/lib/charges";
import { makeBooking } from "../helpers/fixtures";

const rooms = [{ id: 5, name: "Room 5", price: 1500 }] as any;

describe("priceCharge", () => {
  it("overtime: ₱500/hr, Day only, capped at OVERTIME_MAX (2) in total", () => {
    const b = makeBooking({ slot: "Day", overtime: 1 });
    const ok = priceCharge(b, { kind: "overtime", hours: 1 }, rooms);
    expect(ok).toMatchObject({ ok: true, amount: 500 });
    const over = priceCharge(b, { kind: "overtime", hours: 2 }, rooms);
    expect(over).toMatchObject({ ok: false });
    expect(priceCharge(makeBooking({ slot: "Night" }), { kind: "overtime", hours: 1 }, rooms)).toMatchObject({ ok: false, error: /Day Tour/ });
  });

  it("extra guests: ₱200 × guests × slots, Shared only, never past 30", () => {
    const b = makeBooking({ guests: 10, tier: "Shared", slot: "Day" });
    expect(priceCharge(b, { kind: "guests", guests: 5 }, rooms)).toMatchObject({ ok: true, amount: 1000, next: { guests: 15 } });
    expect(priceCharge(b, { kind: "guests", guests: 21 }, rooms)).toMatchObject({ ok: false });
    expect(priceCharge(makeBooking({ tier: "Exclusive" }), { kind: "guests", guests: 1 }, rooms)).toMatchObject({ ok: false });
  });

  it("room: its per-slot rate, ×2 on a Whole Day; not twice; not on a venue-only booking", () => {
    expect(priceCharge(makeBooking({ slot: "Day" }), { kind: "room", roomId: 5 }, rooms)).toMatchObject({ ok: true, amount: 1500 });
    expect(priceCharge(makeBooking({ slot: "WholeDay", tier: "Exclusive" }), { kind: "room", roomId: 5 }, rooms)).toMatchObject({ ok: true, amount: 3000 });
    expect(priceCharge(makeBooking({ rooms: [5] }), { kind: "room", roomId: 5 }, rooms)).toMatchObject({ ok: false });
    expect(priceCharge(makeBooking({ resource: "Venue", tier: "Exclusive" }), { kind: "room", roomId: 5 }, rooms)).toMatchObject({ ok: false });
  });

  it("explains why a charge is unavailable", () => {
    expect(chargeKindsFor(makeBooking({ slot: "Night" })).overtime).toMatch(/Day Tour/);
    expect(chargeKindsFor(makeBooking({ slot: "Day" })).overtime).toBeNull();
  });
});
