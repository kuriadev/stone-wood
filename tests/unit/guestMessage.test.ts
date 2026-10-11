/* The "Email guest" note.
 *
 * Staff type free text and it goes out from the resort's own Gmail account.
 * That makes the escaping the important part: whatever is typed - and
 * whatever a guest's own name contains - must arrive as text, never as
 * markup in a message the resort is the sender of.
 */

import type { Booking } from "@/types/booking";
import {
  buildGuestMessageEmail, defaultGuestSubject,
  GUEST_MESSAGE_MAX, GUEST_SUBJECT_MAX,
} from "@/lib/emailTemplate";

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "SW-10130", name: "Juan Dela Cruz", contact: "09171234567",
  email: "juan@gmail.com", date: "2026-10-20", guests: 4,
  package: "Day Tour", slot: "Day", rooms: [], overtime: 0, total: 0,
  downpayment: 0, status: "Confirmed", paymentProof: true, notes: "",
  ...over,
});

describe("what the guest receives", () => {
  it("carries the typed message", () => {
    const { html } = buildGuestMessageEmail(booking(), "Early check-in", "Your room is ready at 1 PM.");
    expect(html).toContain("Your room is ready at 1 PM.");
  });

  it("uses the given subject", () => {
    expect(buildGuestMessageEmail(booking(), "Early check-in", "hi").subject).toBe("Early check-in");
  });

  it("falls back to a subject naming the booking", () => {
    const { subject } = buildGuestMessageEmail(booking(), "   ", "hi");
    expect(subject).toBe(defaultGuestSubject(booking()));
    expect(subject).toContain("SW-10130");
  });

  it("names the booking so a guest with several knows which", () => {
    const { html } = buildGuestMessageEmail(booking(), "", "hi");
    expect(html).toContain("SW-10130");
    expect(html).toContain("October 20, 2026");
    expect(html).toContain("Day Tour");
  });

  it("greets the guest by name", () => {
    expect(buildGuestMessageEmail(booking({ name: "Ana" }), "", "hi").html).toContain("Hi Ana,");
  });
});

describe("nothing typed becomes markup", () => {
  it("escapes tags in the message", () => {
    const { html } = buildGuestMessageEmail(booking(), "", 'See <script>alert(1)</script> here');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes tags in the subject, which is also printed in the title", () => {
    const { html } = buildGuestMessageEmail(booking(), "<img src=x onerror=1>", "hi");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("escapes a guest's own name", () => {
    const { html } = buildGuestMessageEmail(booking({ name: '<b>Ana</b>' }), "", "hi");
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html).not.toContain("Hi <b>Ana</b>,");
  });

  it("escapes BEFORE adding line breaks, not after", () => {
    // The other order would escape the <br /> tags it had just inserted,
    // and the guest would read a literal "&lt;br /&gt;".
    const { html } = buildGuestMessageEmail(booking(), "", "line one\nline two");
    expect(html).toContain("line one<br />line two");
    expect(html).not.toContain("&lt;br");
  });

  it("keeps paragraph breaks readable", () => {
    const { html } = buildGuestMessageEmail(booking(), "", "one\n\ntwo");
    expect(html).toContain("one<br />&nbsp;<br />two");
  });

  it("handles Windows line endings", () => {
    expect(buildGuestMessageEmail(booking(), "", "a\r\nb").html).toContain("a<br />b");
  });
});

describe("the caps are real", () => {
  it("truncates an over-long message rather than sending it whole", () => {
    const long = "x".repeat(GUEST_MESSAGE_MAX + 500);
    const { html } = buildGuestMessageEmail(booking(), "", long);
    expect(html).toContain("x".repeat(GUEST_MESSAGE_MAX));
    expect(html).not.toContain("x".repeat(GUEST_MESSAGE_MAX + 1));
  });

  it("truncates an over-long subject", () => {
    const { subject } = buildGuestMessageEmail(booking(), "y".repeat(GUEST_SUBJECT_MAX + 50), "hi");
    expect(subject.length).toBe(GUEST_SUBJECT_MAX);
  });
});
