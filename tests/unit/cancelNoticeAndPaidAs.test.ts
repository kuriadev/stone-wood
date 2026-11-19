import { guestCancelNotices } from "@/lib/operations";
import { paidAs } from "@/lib/proofPaid";
import type { CustomerMessage } from "@/types/admin";

const msg = (o: Partial<CustomerMessage>): CustomerMessage => ({
  id: 1, name: "Ana", email: "ana@example.com", type: "Cancellation", message: "NT-1 cancelled.\nReason: x", date: "2026-11-19",
  createdAt: "2026-11-19T10:00:00+08:00", bookingId: "NT-1", ...o,
});

describe("guestCancelNotices (Reminders)", () => {
  const now = new Date("2026-11-19T12:00:00+08:00");
  it("lists recent guest cancellations still in the inbox", () => {
    expect(guestCancelNotices([msg({})], now)).toHaveLength(1);
  });
  it("leaves out archived, old and other messages", () => {
    expect(guestCancelNotices([
      msg({ archivedAt: "2026-11-19T11:00:00+08:00" }),
      msg({ createdAt: "2026-11-10T10:00:00+08:00" }),
      msg({ type: "Inquiry" }),
    ], now)).toHaveLength(0);
  });
});

describe("paidAs (Pending proof of payment)", () => {
  const p = (payChoice: "Downpayment" | "Full", amounts: number[], total = 2000) =>
    ({ payChoice, amountDue: payChoice === "Full" ? total : total / 2, booking: { total }, ocr: { amounts } });
  it("reads the receipt: the whole total is full, at least half is the down payment", () => {
    expect(paidAs(p("Downpayment", [2000]))).toBe("Full");
    expect(paidAs(p("Full", [1000]))).toBe("Downpayment");
    expect(paidAs(p("Downpayment", [1000]))).toBe("Downpayment");
  });
  it("falls back to what the guest chose when the amount wasn't read", () => {
    expect(paidAs(p("Full", []))).toBe("Full");
    expect(paidAs(p("Downpayment", []))).toBe("Downpayment");
  });
});

describe("openCancelRequests (Do these first, My Tasks)", () => {
  it("lists cancellation requests still waiting for an answer", () => {
    const { openCancelRequests } = jest.requireActual("@/lib/operations") as typeof import("@/lib/operations");
    expect(openCancelRequests([
      msg({ id: 1, type: "Emergency" }),
      msg({ id: 2, type: "Emergency", resolution: "Approved" }),
      msg({ id: 3, type: "Emergency", archivedAt: "2026-11-19T11:00:00+08:00" }),
      msg({ id: 4, type: "Inquiry" }),
    ]).map((m) => m.id)).toEqual([1]);
  });
});
