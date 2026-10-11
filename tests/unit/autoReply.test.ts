/* The automated reply draft.
 *
 * The bug: the drafts were keyed on the words the ADMIN sees ("Question",
 * "Booking Issue") while msg.type holds what the guest's form stored
 * (Inquiry, Feedback, Complaint, Refund, Suggestion, Other). Three of six
 * keys matched nothing, the lookup ended in `|| ""`, and choosing
 * "Automated" on a refund request opened an empty box.
 *
 * So the first group below is the one that matters: every stored type, and
 * any type at all, must produce something worth sending.
 */

import type { Booking } from "@/types/booking";
import type { CustomerMessage } from "@/types/admin";
import { draftReply, referenceIn, bookingFor } from "@/lib/autoReply";
import { RESORT_CONTACT } from "@/lib/resort";

const STORED_TYPES = ["Inquiry", "Feedback", "Complaint", "Refund", "Suggestion", "Other"];

const msg = (over: Partial<CustomerMessage> = {}): CustomerMessage => ({
  id: 1, name: "Juan Dela Cruz", email: "juan@gmail.com",
  type: "Inquiry", message: "Hello, I have a question.", date: "2026-10-12",
  ...over,
});

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "SW-10141", name: "Juan Dela Cruz", contact: "09171234567",
  email: "juan@gmail.com", date: "2026-10-17", guests: 4,
  package: "Day Tour", slot: "Day", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  ...over,
});

describe("a draft is never empty", () => {
  it.each(STORED_TYPES)("writes a reply for a %s", (type) => {
    const out = draftReply(msg({ type }));
    expect(out.trim().length).toBeGreaterThan(60);
    expect(out).toContain("Hi Juan,");
    expect(out).toContain("StoneWood Private Resort");
  });

  it("writes one for a type nobody has added a draft for", () => {
    // The branch whose absence left the box empty.
    const out = draftReply(msg({ type: "Something New" }));
    expect(out.trim().length).toBeGreaterThan(60);
    expect(out).toContain(RESORT_CONTACT.phone);
  });

  it("copes with a message that has no type at all", () => {
    const out = draftReply(msg({ type: "" }));
    expect(out).toContain("Hi Juan,");
  });

  it("gives each type its own wording", () => {
    const bodies = new Set(STORED_TYPES.map((type) => draftReply(msg({ type }))));
    expect(bodies.size).toBe(STORED_TYPES.length);
  });
});

describe("it reads the message it is replying to", () => {
  it("greets the guest by first name", () => {
    expect(draftReply(msg({ name: "Ana Marie Reyes" }))).toContain("Hi Ana,");
  });

  it("falls back to a plain greeting with no usable name", () => {
    expect(draftReply(msg({ name: "" }))).toContain("Hi there,");
  });

  it("quotes back the reference the guest wrote", () => {
    const out = draftReply(msg({ message: "About my booking SW-10141, can you help?" }));
    expect(out).toContain("SW-10141");
  });

  it("recognises a reference however it was typed", () => {
    expect(referenceIn("my booking sw10141 please")).toBe("SW-10141");
    expect(referenceIn("ref: SW 10141")).toBe("SW-10141");
    expect(referenceIn("SW-10141")).toBe("SW-10141");
    expect(referenceIn("no reference here")).toBeNull();
  });

  it("names the booking's own dates when it can find it", () => {
    const out = draftReply(msg({ message: "About SW-10141" }), [booking()]);
    expect(out).toContain("Day Tour");
    expect(out).toContain("October 17, 2026");
  });

  it("finds the booking by email when no reference was quoted", () => {
    const b = bookingFor(msg({ message: "no ref at all" }), [booking()]);
    expect(b?.id).toBe("SW-10141");
  });

  it("prefers the guest's most recent booking", () => {
    const b = bookingFor(msg({ message: "hello" }), [
      booking({ id: "SW-10100", date: "2026-09-01" }),
      booking({ id: "SW-10200", date: "2026-11-01" }),
    ]);
    expect(b?.id).toBe("SW-10200");
  });

  it("still works with no bookings to look in", () => {
    const out = draftReply(msg({ message: "hello" }), []);
    expect(out).toContain("Hi Juan,");
    expect(out).not.toContain("undefined");
  });
});

describe("the refund draft does not promise a refund", () => {
  // The resort refunds when IT cancels, never because a guest changed
  // their mind, so an automated draft must not commit to paying out.
  const out = draftReply(msg({ type: "Refund", message: "I want my money back for SW-10141" }));

  it("explains how the decision is made", () => {
    expect(out).toContain("when the resort has to cancel");
  });

  it("reads as English when it names the booking", () => {
    // "with about your Day Tour" - the description carries its own
    // preposition, so the branch that adds one must not add a second.
    const named = draftReply(
      msg({ type: "Refund", message: "refund for SW-10141" }),
      [booking()],
    );
    expect(named).toContain("with your Day Tour");
    expect(named).not.toContain("with about");
    expect(named).not.toMatch(/about about/);
  });

  it("points them at a person rather than settling it by email", () => {
    expect(out).toContain(RESORT_CONTACT.phone);
  });

  it("never says the refund is approved or on its way", () => {
    expect(out).not.toMatch(/refund (has been|is being|will be) (approved|processed|issued|sent)/i);
  });
});
