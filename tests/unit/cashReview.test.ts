/* Looking into a cash count that came out short or over.
 *
 * The owner's task used to say only "cash over by ₱3,750", which left
 * nothing to act on. These pin what the review works out instead: the
 * day's cash entries and totals (the same sum the closing route uses), and
 * which records could explain the difference — exact amounts first.
 */

import { cashClues, dayCash } from "@/lib/cashReview";
import type { Expense, Payment } from "@/types/finance";

const pay = (over: Partial<Payment>): Payment => ({
  id: 1, bookingId: "SW-1", guestName: "Juan", type: "Balance", method: "Cash", amount: 1000,
  reference: "", notes: "", receivedAt: "2026-10-08T03:00:00.000Z", voided: false,
  ...over,
});
const exp = (over: Partial<Expense>): Expense => ({
  id: 1, category: "Supplies", description: "Chlorine", amount: 500, method: "Cash", spentOn: "2026-10-08", voided: false,
  ...over,
});
const D = "2026-10-08";

describe("dayCash", () => {
  it("adds the day's cash in and out, and nothing else", () => {
    const d = dayCash(D, [
      pay({ id: 1, amount: 2000 }),
      pay({ id: 2, amount: 300, type: "Refund" }),
      pay({ id: 3, amount: 999, method: "GCash" }),                    // not cash
      pay({ id: 4, amount: 999, voided: true }),                       // voided
      pay({ id: 5, amount: 999, receivedAt: "2026-10-08T16:30:00.000Z" }), // 00:30 on the 9th in Manila
    ], [exp({ id: 1, amount: 500 }), exp({ id: 2, amount: 70, method: "GCash" }), exp({ id: 3, spentOn: "2026-10-07" })]);
    expect(d.cashIn).toBe(1700);
    expect(d.cashOut).toBe(500);
    expect(d.payments).toBe(2);
    expect(d.expenses).toBe(1);
    expect(d.entries.map((e) => e.amount)).toEqual([2000, -300, -500]);
  });
});

describe("cashClues", () => {
  const base = { date: D, openingFloat: 1000, payments: [] as Payment[], expenses: [] as Expense[] };

  it("has nothing to say about a balanced count", () => {
    expect(cashClues({ ...base, difference: 0 })).toEqual([]);
  });

  it("over: a GCash payment of exactly the difference comes first", () => {
    const clues = cashClues({ ...base, difference: 3750, payments: [pay({ amount: 3750, method: "GCash", bookingId: "SW-7" })] });
    expect(clues[0]).toMatchObject({ kind: "match", bookingId: "SW-7" });
    expect(clues[0].text).toMatch(/recorded as GCash/);
  });

  it("over: a cash payment of that amount put on the next day", () => {
    const clues = cashClues({ ...base, difference: 3750, payments: [pay({ amount: 3750, receivedAt: "2026-10-09T02:00:00.000Z" })] });
    expect(clues[0].kind).toBe("match");
    expect(clues[0].text).toMatch(/wrong day/);
  });

  it("over: a voided cash payment, a cash refund, a cash expense of that amount", () => {
    const clues = cashClues({
      ...base, difference: 500,
      payments: [pay({ id: 1, amount: 500, voided: true }), pay({ id: 2, amount: 500, type: "Refund" })],
      expenses: [exp({ amount: 500 })],
    }).filter((c) => c.kind === "match");
    expect(clues).toHaveLength(3);
  });

  it("over: points at a missing opening float when none was entered", () => {
    const clues = cashClues({ ...base, openingFloat: 0, difference: 200 });
    expect(clues.some((c) => /No opening float/.test(c.text))).toBe(true);
    expect(clues.every((c) => c.kind === "check")).toBe(true);
  });

  it("short: a cash payment of that amount, and an expense recorded as GCash", () => {
    const clues = cashClues({
      ...base, difference: -500,
      payments: [pay({ amount: 500 })],
      expenses: [exp({ amount: 500, method: "GCash" })],
    });
    const matches = clues.filter((c) => c.kind === "match");
    expect(matches).toHaveLength(2);
    expect(clues.some((c) => /expense dated/.test(c.text))).toBe(true);
  });

  it("ignores amounts that don't match and other days", () => {
    const clues = cashClues({
      ...base, difference: 3750,
      payments: [pay({ amount: 3700, method: "GCash" }), pay({ amount: 3750, method: "GCash", receivedAt: "2026-10-05T02:00:00.000Z" })],
    });
    expect(clues.filter((c) => c.kind === "match")).toHaveLength(0);
  });
});
