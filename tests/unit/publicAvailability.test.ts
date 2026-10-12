/* The guest calendar has to see a booking's WHOLE stay.
 *
 * The bug these tests pin: /api/availability sent only each booking's first
 * day, so a Whole Day stay over Oct 10-12 looked like a one-day booking on
 * the 10th. Book Now showed the 11th and 12th (and the stay's room) as free,
 * the guest picked one, and only the payment step — which reads the real
 * end date — refused it, with an error in place of the QR.
 */

import { slotToBooking, type AvailabilitySlot } from "@/lib/publicAvailability";
import { roomsTakenInRange, checkRangeAvailability } from "@/lib/utils";

/** A confirmed Whole Day stay over Oct 10-12 with room 2. */
const slot = (over: Partial<AvailabilitySlot> = {}): AvailabilitySlot => ({
  date: "2026-10-10", end_date: "2026-10-12", guests: 6, status: "Confirmed",
  rooms: [2], resource: "Pool", tier: "Shared", slot: "WholeDay", overtime: 0,
  package: "Whole Day + Room",
  ...over,
});

describe("slotToBooking — the guest calendar sees the whole stay", () => {
  it("keeps the stay's last day", () => {
    expect(slotToBooking(slot(), 0).endDate).toBe("2026-10-12");
  });

  it("shows the stay's room as taken on its second day", () => {
    const others = [slotToBooking(slot(), 0)];
    expect(roomsTakenInRange("2026-10-11", "2026-10-11", "Day", others).has(2)).toBe(true);
  });

  it("refuses an Exclusive buyout on the stay's last day", () => {
    const others = [slotToBooking(slot(), 0)];
    expect(checkRangeAvailability("2026-10-12", "2026-10-12", "Day", 10, "Exclusive", "Pool", others).ok).toBe(false);
  });

  it("still frees the day after the stay ends", () => {
    const others = [slotToBooking(slot(), 0)];
    expect(roomsTakenInRange("2026-10-13", "2026-10-13", "Day", others).has(2)).toBe(false);
  });

  it("reads a slot with no end date as one day (database before the multi-day update)", () => {
    const others = [slotToBooking(slot({ end_date: null }), 0)];
    expect(roomsTakenInRange("2026-10-10", "2026-10-10", "Day", others).has(2)).toBe(true);
    expect(roomsTakenInRange("2026-10-11", "2026-10-11", "Day", others).has(2)).toBe(false);
  });
});
