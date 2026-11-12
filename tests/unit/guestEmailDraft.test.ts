import { guestEmailDraft } from "@/lib/guestEmailDraft";
import type { Booking } from "@/types/booking";

const base = {
  id: "DT-10203", name: "Beamae Yabyabin", email: "b@example.com", contact: "09123545454",
  date: "2026-11-20", guests: 2, package: "Day Stay", total: 400, downpayment: 200,
  status: "Confirmed", paymentProof: true, notes: "", source: "Online",
} as unknown as Booking;
const today = "2026-11-10";

describe("the email a guest gets fits where their booking stands", () => {
  it("nudges a guest who still has to pick a new date after a resort cancellation", () => {
    const d = guestEmailDraft({ ...base, status: "ResortCancelled", heldAmount: 400, choiceDeadline: "2026-11-15T15:42:00Z" } as Booking, 0, today);
    expect(d.subject).toMatch(/pick a new date for DT-10203/);
    expect(d.placeholder).toMatch(/Hi Beamae/);
    expect(d.placeholder).toMatch(/₱400 is still safe/);
    expect(d.placeholder).toMatch(/until /);
  });

  it("reminds a guest arriving tomorrow, with the balance", () => {
    const d = guestEmailDraft({ ...base, date: "2026-11-11" } as Booking, 200, today);
    expect(d.subject).toMatch(/See you tomorrow/);
    expect(d.placeholder).toMatch(/₱200 is paid when you arrive/);
  });

  it("checks in on a group on site, and thanks a group that's done", () => {
    expect(guestEmailDraft({ ...base, date: today, checkedInAt: "2026-11-10T00:00:00Z" } as Booking, 0, today).subject).toMatch(/Enjoy your stay/);
    expect(guestEmailDraft({ ...base, status: "Completed" } as Booking, 0, today).subject).toMatch(/Thank you for staying/);
  });

  it("follows up on a refund and on a missed visit", () => {
    expect(guestEmailDraft({ ...base, status: "Cancelled", refundStatus: "Owed", refundAmount: 400 } as Booking, 0, today).placeholder).toMatch(/refund of ₱400/);
    expect(guestEmailDraft({ ...base, status: "Cancelled", refundStatus: "Sent" } as Booking, 0, today).subject).toMatch(/Your refund/);
    expect(guestEmailDraft({ ...base, status: "Cancelled", noShow: true } as Booking, 0, today).subject).toMatch(/We missed you/);
  });

  it("looks forward to an upcoming visit", () => {
    expect(guestEmailDraft(base, 0, today).subject).toMatch(/Your upcoming stay on/);
  });
});
