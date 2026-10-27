/* What the guest availed, as receipts and screens show it.
 *
 * The bug these tests pin: a self-built booking's label never said Shared
 * or Exclusive, so a 2-guest Exclusive Day Tour read "Day Tour" on a ₱5,700
 * receipt. A package keeps its own name.
 */

import type { Booking } from "@/types/booking";
import { packageAvailed } from "@/lib/pricing";
import { buildReceiptEmail } from "@/lib/emailTemplate";

const booking = (over: Partial<Booking>): Booking => ({
  id: "SW-1", name: "Test", contact: "09171234567", email: "t@example.com", date: "2026-11-05",
  guests: 2, package: "Day Tour", rooms: [], overtime: 0, total: 5700,
  downpayment: 5700, status: "Confirmed", paymentProof: true, notes: "",
  slot: "Day", resource: "Pool", tier: "Exclusive",
  ...over,
});

describe("packageAvailed", () => {
  it("puts the tier in front of a self-built tour", () => {
    expect(packageAvailed(booking({}))).toBe("Exclusive Day Tour");
    expect(packageAvailed(booking({ tier: "Shared", slot: "Night", package: "Night Tour + Room", rooms: [2] })))
      .toBe("Shared Night Tour + Room");
    expect(packageAvailed(booking({ slot: "WholeDay", package: "Staycation" }))).toBe("Exclusive Staycation");
    expect(packageAvailed(booking({ resource: "Pool+Venue", package: "Day Tour + Event Venue" })))
      .toBe("Exclusive Day Tour + Event Venue");
  });

  it("keeps a package's own name", () => {
    expect(packageAvailed(booking({ package: "Private Pool (Day Tour)" }))).toBe("Private Pool (Day Tour)");
  });

  it("leaves the venue on its own as it is", () => {
    expect(packageAvailed(booking({ resource: "Venue", package: "Event Venue Rental (Day Tour)" })))
      .toBe("Event Venue Rental (Day Tour)");
  });
});

describe("the confirmation email", () => {
  it("names the tier, the reservation date and how the guest paid", () => {
    const { html } = buildReceiptEmail(booking({}));
    expect(html).toContain("Exclusive Day Tour");
    expect(html).toContain("Date of Reservation");
    expect(html).not.toContain("Date of Visit");
    expect(html).toContain("GCash (Online Payment)");
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
