// ── Looking into a cash count that came out short or over
//
// When the cash in the box doesn't match what the records say should be
// there, the owner needs to know *why* before they can fix it. Everything
// here is worked out from the ledger the day's closing was based on:
//
//   dayCash    every cash payment, refund and expense recorded for the day,
//              in order, with the totals the closing uses
//   cashClues  the likely explanations, best first: a record whose amount
//              is exactly the difference (a cash payment typed in as
//              GCash, one put on the next day, a voided one whose money
//              was kept…), then the usual causes for an over or a short
//
// The closing route (app/api/closings) computes expected cash the same way:
// opening float + cash received − cash refunded − cash spent.

import { liveExpenses, livePayments, manilaDate, manilaTime, round2, signedAmount } from "@/lib/finance";
import { addDaysIso } from "@/lib/tasks";
import { fmt, fmtDate } from "@/lib/utils";
import type { Expense, Payment } from "@/types/finance";

const CASH_TYPE: Record<string, string> = {
  Downpayment: "Down payment", Balance: "Balance", Full: "Paid in full", Penalty: "Damage penalty", Refund: "Refund paid out",
};

export interface CashEntry {
  key: string;
  /** Time of day, or "" for an expense (those carry a date only). */
  when: string;
  /** Signed: money into the box is positive, money out negative. */
  amount: number;
  what: string;
  who: string;
  bookingId?: string;
  note: string;
}

export function dayCash(date: string, payments: Payment[], expenses: Expense[]) {
  const pays = livePayments(payments).filter((p) => p.method === "Cash" && manilaDate(p.receivedAt) === date);
  const exps = liveExpenses(expenses).filter((e) => e.method === "Cash" && e.spentOn === date);
  const entries: (CashEntry & { sortKey: string })[] = [
    ...pays.map((p) => ({
      key: `p${p.id}`, sortKey: p.receivedAt, when: manilaTime(p.receivedAt), amount: signedAmount(p),
      what: CASH_TYPE[p.type] ?? p.type, who: p.guestName, bookingId: p.bookingId ?? undefined, note: p.notes,
    })),
    ...exps.map((e) => ({
      key: `e${e.id}`, sortKey: `${e.spentOn}T23:59:59`, when: "", amount: -e.amount,
      what: `Expense · ${e.category}`, who: e.description, note: "",
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return {
    entries: entries.map(({ sortKey: _s, ...e }) => e),
    cashIn: round2(pays.reduce((s, p) => s + signedAmount(p), 0)),
    cashOut: round2(exps.reduce((s, e) => s + e.amount, 0)),
    payments: pays.length,
    expenses: exps.length,
  };
}

export interface CashClue {
  /** "match": a record whose amount is exactly the difference.
   *  "check": a common cause worth asking about. */
  kind: "match" | "check";
  text: string;
  bookingId?: string;
}

/** Why a day's cash count might be off by `difference` (counted − expected;
 *  positive = more cash than the records explain). */
export function cashClues({ date, difference, openingFloat, payments, expenses }: {
  date: string;
  difference: number;
  openingFloat: number;
  payments: Payment[];
  expenses: Expense[];
}): CashClue[] {
  const diff = round2(difference);
  if (diff === 0) return [];
  const over = diff > 0;
  const amt = Math.abs(diff);
  const same = (x: number) => Math.abs(x - amt) < 0.005;
  const onDay = (p: Payment, d: string) => manilaDate(p.receivedAt) === d;
  const near = [addDaysIso(date, -1), addDaysIso(date, 1)];
  const day = fmtDate(date);
  const clues: CashClue[] = [];
  const who = (p: Payment) => `${p.guestName}${p.bookingId ? ` (${p.bookingId})` : ""}`;

  for (const p of payments) {
    if (!same(p.amount)) continue;
    const refund = p.type === "Refund";
    if (!p.voided && onDay(p, date)) {
      if (over && p.method !== "Cash" && p.method !== "PayMongo" && !refund) {
        clues.push({ kind: "match", bookingId: p.bookingId ?? undefined,
          text: `${fmt(p.amount)} from ${who(p)} was recorded as ${p.method}. If they paid in cash, that is the extra money in the box.` });
      }
      if (over && p.method === "Cash" && refund) {
        clues.push({ kind: "match", bookingId: p.bookingId ?? undefined,
          text: `A ${fmt(p.amount)} cash refund to ${who(p)} was recorded. If it was never handed over, or was sent by GCash, the money is still in the box.` });
      }
      if (!over && p.method === "Cash" && !refund) {
        clues.push({ kind: "match", bookingId: p.bookingId ?? undefined,
          text: `${fmt(p.amount)} from ${who(p)} was recorded as cash on ${day}. If they actually paid by GCash or QR, hadn't paid yet, or the cash went into the box on another day, that is the missing money.` });
      }
    }
    if (over && p.voided && p.method === "Cash" && !refund && onDay(p, date)) {
      clues.push({ kind: "match", bookingId: p.bookingId ?? undefined,
        text: `A ${fmt(p.amount)} cash payment from ${who(p)} was voided${p.voidReason ? ` ("${p.voidReason}")` : ""}. If the money was kept anyway, that is the extra cash.` });
    }
    // Over: the money came in on this day but was put on the day before or
    // after. (Short is the other side of the same mistake, caught above.)
    if (over && !p.voided && p.method === "Cash" && !refund) {
      const other = near.find((d) => onDay(p, d));
      if (other) {
        clues.push({ kind: "match", bookingId: p.bookingId ?? undefined,
          text: `${fmt(p.amount)} cash from ${who(p)} was recorded on ${fmtDate(other)}. If it was really taken on ${day}, it is on the wrong day.` });
      }
    }
  }
  for (const e of liveExpenses(expenses)) {
    if (!same(e.amount) || e.spentOn !== date) continue;
    if (over && e.method === "Cash") {
      clues.push({ kind: "match", text: `The ${fmt(e.amount)} cash expense "${e.description || e.category}" was recorded. If it wasn't paid from the box, it shouldn't be cash.` });
    }
    if (!over && e.method !== "Cash") {
      clues.push({ kind: "match", text: `The ${fmt(e.amount)} expense "${e.description || e.category}" was recorded as ${e.method}. If it was paid from the box, it should be cash.` });
    }
  }

  if (over) {
    clues.push({ kind: "check", text: `A guest paid cash at the counter and it was never recorded. Find their booking and record it below; it will be dated ${day}.` });
    clues.push(openingFloat === 0
      ? { kind: "check", text: "No opening float was entered. If the box started the day with change money in it, that is part of the extra. Enter it below as the opening float." }
      : { kind: "check", text: `The opening float was entered as ${fmt(openingFloat)}. If the box actually started with more, correct it below.` });
    clues.push({ kind: "check", text: "Money that isn't the resort's was put in the box (a staff member's own cash, a deposit to return)." });
  } else {
    clues.push({ kind: "check", text: `Something was paid from the box and never recorded: supplies, a refund, a delivery. Record it below as an expense dated ${day}.` });
    if (openingFloat > 0) clues.push({ kind: "check", text: `The opening float was entered as ${fmt(openingFloat)}. If the box actually started with less, correct it below.` });
    clues.push({ kind: "check", text: "A guest was given too much change, or cash was taken out for the bank or the owner without a record." });
  }
  return clues;
}
