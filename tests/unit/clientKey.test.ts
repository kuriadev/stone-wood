/* Who counts as the same customer.
 *
 * clientKey is the only place the system decides that two bookings belong
 * to one person - the Clients list, their history and their running
 * balance are all built from it. It used to key on the PHONE NUMBER, which
 * gets both halves of the job wrong: one number is shared by a household
 * or an office, and a dropped number is re-issued to a stranger within
 * months. The email address is the identity now, and it is also what the
 * guest already proves ownership of to manage a booking.
 */

import type { Booking } from "@/types/booking";
import { clientKey } from "@/lib/finance";

const guest = (over: Partial<Booking>): Booking => ({
  id: "B1", name: "Juan Dela Cruz", contact: "09171234567",
  email: "juan@gmail.com", date: "2026-10-20", guests: 4,
  package: "Day Tour", rooms: [], overtime: 0, total: 0, downpayment: 0,
  status: "Confirmed", paymentProof: true, notes: "",
  ...over,
});

describe("the email is the identity", () => {
  it("treats one email on two different phones as one customer", () => {
    // They changed number, or booked once from home and once from work.
    const a = guest({ contact: "09171234567" });
    const b = guest({ contact: "09981112222" });
    expect(clientKey(a)).toBe(clientKey(b));
    expect(clientKey(a)).toBe("mail:juan@gmail.com");
  });

  it("keeps a shared phone number as two customers", () => {
    // The bug this fixes: a family booking on one parent's handset, or an
    // office booking every outing on the front-desk line, collapsed into a
    // single client whose balance belonged to several households.
    const mum = guest({ name: "Ana Reyes", email: "ana@gmail.com", contact: "09171234567" });
    const son = guest({ name: "Paolo Reyes", email: "paolo@gmail.com", contact: "09171234567" });
    expect(clientKey(mum)).not.toBe(clientKey(son));
  });

  it("ignores case and surrounding spaces", () => {
    expect(clientKey(guest({ email: "  JUAN@Gmail.COM " }))).toBe("mail:juan@gmail.com");
  });

  it("does not merge addresses only Gmail treats as equal", () => {
    // Deliberate: dots and +tags are Gmail-specific, and stripping them
    // would merge two real people at any other provider.
    expect(clientKey(guest({ email: "ju.an@gmail.com" }))).not.toBe(clientKey(guest({ email: "juan@gmail.com" })));
    expect(clientKey(guest({ email: "juan+resort@gmail.com" }))).not.toBe(clientKey(guest({ email: "juan@gmail.com" })));
  });
});

describe("the phone is still the fallback", () => {
  it("keys a walk-in with no email on its number", () => {
    // Email is required online but optional at the front desk, so the
    // phone has to keep working as a last resort.
    expect(clientKey(guest({ email: "" }))).toBe("tel:9171234567");
  });

  it("matches the same walk-in however the number was typed", () => {
    const a = guest({ email: "", contact: "0917 123 4567" });
    const b = guest({ email: "", contact: "+63 917 123 4567" });
    expect(clientKey(a)).toBe(clientKey(b));
  });

  it("falls back to the name when there is neither", () => {
    expect(clientKey(guest({ email: "", contact: "" }))).toBe("name:juan dela cruz");
  });

  it("prefers the email even when a number is present", () => {
    // The order is the whole point of the change.
    expect(clientKey(guest({ email: "juan@gmail.com", contact: "09171234567" }))).toBe("mail:juan@gmail.com");
  });
});
