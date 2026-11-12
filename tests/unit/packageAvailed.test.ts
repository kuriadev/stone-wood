/* What the guest availed, as receipts and screens show it.
 *
 * The bug these tests pin: a self-built booking's label never said Shared
 * or Exclusive, so a 2-guest Exclusive Day Stay read "Day Stay" on a ₱5,700
 * receipt. A package keeps its own name.
 */

import type { Booking } from "@/types/booking";
import { packageAvailed } from "@/lib/pricing";
import { buildReceiptEmail } from "@/lib/emailTemplate";

const booking = (over: Partial<Booking>): Booking => ({
  id: "SW-1", name: "Test", contact: "09171234567", email: "t@example.com", date: "2026-11-05",
  guests: 2, package: "Day Stay", rooms: [], overtime: 0, total: 5700,
  downpayment: 5700, status: "Confirmed", paymentProof: true, notes: "",
  slot: "Day", resource: "Pool", tier: "Exclusive",
  ...over,
});

describe("packageAvailed", () => {
  it("puts the tier in front of a self-built stay", () => {
    expect(packageAvailed(booking({}))).toBe("Private Pool Day Stay");
    expect(packageAvailed(booking({ tier: "Shared", slot: "Night", package: "Night Stay + Room", rooms: [2] })))
      .toBe("Shared Pool Night Stay + Room");
    expect(packageAvailed(booking({ slot: "WholeDay", package: "Staycation" }))).toBe("Private Pool Staycation");
    expect(packageAvailed(booking({ resource: "Pool+Venue", package: "Day Stay + Event Venue" })))
      .toBe("Private Pool Day Stay + Event Venue");
  });

  it("keeps a package's own name", () => {
    expect(packageAvailed(booking({ package: "Private Pool (Day Stay)" }))).toBe("Private Pool (Day Stay)");
  });

  it("leaves the venue on its own as it is", () => {
    expect(packageAvailed(booking({ resource: "Venue", package: "Event Venue Rental (Day Stay)" })))
      .toBe("Event Venue Rental (Day Stay)");
  });
});

describe("the confirmation email", () => {
  it("names the tier, the reservation date and how the guest paid", () => {
    const { html } = buildReceiptEmail(booking({}));
    expect(html).toContain("Private Pool Day Stay");
    expect(html).toContain("Date of Reservation");
    expect(html).not.toContain("Date of Visit");
    expect(html).toContain("GCash (proof of payment checked by our staff)");
    expect(html).toContain("Manage My Booking");
  });

  it("says a walk-in paid at the front desk, and what is left after a deposit", () => {
    const { html } = buildReceiptEmail(booking({ source: "Walk-In", downpayment: 2850 }));
    expect(html).toContain("At the front desk");
    expect(html).toContain("Down Payment Paid");
    expect(html).toContain("Balance at the Resort");
    expect(html).not.toContain("Downpayment Required");
  });
});
