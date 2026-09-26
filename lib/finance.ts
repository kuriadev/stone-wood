// ── Sales calculations
//
// One place that decides what "collected", "balance" and "penalty due"
// mean. The Dashboard, Sales, Bookings, Facilities and Reports all call
// these, so the same booking can never show two different balances on two
// screens. Pure functions, no React: safe on the server too.

import type { Booking } from "@/types/booking";
import type { Payment, DamageRecord, Expense } from "@/types/finance";

/** The resort runs on Manila time. Dates for "today" and daily totals are
 *  taken in Asia/Manila, never UTC — toISOString() would put anything
 *  received between midnight and 8 AM on the previous day. */
export function manilaDate(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function manilaTime(d: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

/** A payment's effect on money received: refunds count against it. */
export function signedAmount(p: Payment): number {
  return p.type === "Refund" ? -p.amount : p.amount;
}

export const livePayments = (ps: Payment[]) => ps.filter((p) => !p.voided);
export const liveExpenses = (es: Expense[]) => es.filter((e) => !e.voided);
export const liveDamages = (ds: DamageRecord[]) => ds.filter((d) => !d.voided);

/** Payment types that pay for the stay itself (not a penalty). */
const STAY_TYPES = new Set(["Downpayment", "Balance", "Full", "Refund"]);

export interface BookingMoney {
  /** Net paid toward the stay (downpayment + balance + full − refunds). */
  paid: number;
  /** Still owed on the stay. Zero for a cancelled booking: its downpayment
   *  is forfeited under the no-refund policy, and nothing more is owed. */
  balance: number;
  /** Total of recorded damage penalties. */
  penaltyTotal: number;
  penaltyPaid: number;
  penaltyDue: number;
  /** balance + penaltyDue: what the guest still has to hand over. */
  due: number;
  state: "Paid in full" | "Partially paid" | "Unpaid" | "Forfeited";
}

export function bookingMoney(
  b: Booking,
  payments: Payment[],
  damages: DamageRecord[] = [],
): BookingMoney {
  const mine = livePayments(payments).filter((p) => p.bookingId === b.id);
  const paid = mine.filter((p) => STAY_TYPES.has(p.type)).reduce((s, p) => s + signedAmount(p), 0);
  const penaltyPaid = mine.filter((p) => p.type === "Penalty").reduce((s, p) => s + p.amount, 0);
  const penaltyTotal = liveDamages(damages).filter((d) => d.bookingId === b.id).reduce((s, d) => s + d.amount, 0);

  const cancelled = b.status === "Cancelled";
  const balance = cancelled ? 0 : Math.max(0, round2(b.total - paid));
  const penaltyDue = Math.max(0, round2(penaltyTotal - penaltyPaid));

  let state: BookingMoney["state"];
  if (cancelled) state = paid > 0 ? "Forfeited" : "Unpaid";
  else if (balance <= 0) state = "Paid in full";
  else if (paid > 0) state = "Partially paid";
  else state = "Unpaid";

  return { paid: round2(paid), balance, penaltyTotal, penaltyPaid, penaltyDue, due: round2(balance + penaltyDue), state };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Net money received on a Manila date (or within [from, to]). */
export function collectedBetween(payments: Payment[], from: string, to: string = from): number {
  return round2(
    livePayments(payments)
      .filter((p) => { const d = manilaDate(p.receivedAt); return d >= from && d <= to; })
      .reduce((s, p) => s + signedAmount(p), 0),
  );
}

export function expensesBetween(expenses: Expense[], from: string, to: string = from): number {
  return round2(
    liveExpenses(expenses)
      .filter((e) => e.spentOn >= from && e.spentOn <= to)
      .reduce((s, e) => s + e.amount, 0),
  );
}

/** First and last day of the month containing `date` (YYYY-MM-DD). */
export function monthRange(date: string): { from: string; to: string } {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** What identifies the same client across bookings: their phone number,
 *  falling back to email. Names are typed differently every visit. */
export function clientKey(b: Pick<Booking, "contact" | "email" | "name">): string {
  const digits = (b.contact || "").replace(/\D/g, "");
  if (digits.length >= 10) return "tel:" + digits.slice(-10);
  if (b.email) return "mail:" + b.email.trim().toLowerCase();
  return "name:" + b.name.trim().toLowerCase();
}

/** CSV text Excel opens cleanly: every cell quoted, BOM for the peso sign. */
export function toCsv(rows: (string | number)[][]): string {
  return "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
