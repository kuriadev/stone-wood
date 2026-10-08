// ── Where each reservation is in its day
//
// The Operations screen sorts every live booking into the step it is
// waiting on. The step is WORKED OUT from records that already exist —
// the booking's status and day-of timestamps, and its preparation
// inspection — never stored on its own, so it can't drift out of step
// with what actually happened.
//
//   confirm    Pending: check the payment, accept or reject
//   prepare    Confirmed, visit still ahead: run the before-use checklist
//   arriving   Confirmed, visit is today (or overdue): tap Check in
//   onsite     Checked in: check out when the group leaves, which also
//              collects the balance + penalties and completes the stay
//   settle     Checked out but not fully paid: collect the rest, settle
//   done       Settled today
//
// The screen then shows them in three views, so today's work is never
// buried under next week's:
//
//   today      the day's flow, as three columns: Arriving (with any
//              unconfirmed booking dated today or earlier) → On site →
//              To settle
//   upcoming   still ahead: bookings to confirm and facilities to prepare
//   done       settled today

import type { Booking } from "@/types/booking";
import type { Inspection, DateChange, Payment, Expense, DailyClosing } from "@/types/finance";
import { choiceOpen, choiceExpired, holdActive } from "@/lib/rebooking";
import { manilaDate } from "@/lib/finance";
import { getOccupancyWindow } from "@/lib/occupancy";
import { fmtDate } from "@/lib/utils";

export type OpsStage = "confirm" | "prepare" | "arriving" | "onsite" | "settle" | "done";

export const OPS_STAGES: { id: OpsStage; label: string; hint: string; color: string }[] = [
  { id: "confirm", label: "To confirm", hint: "New reservations. Check the payment, then accept or reject.", color: "#d4a800" },
  { id: "prepare", label: "To prepare", hint: "Confirmed and coming up. Preparation opens the day before each visit.", color: "#9a7bd0" },
  { id: "arriving", label: "Arriving", hint: "Due today. Check them in when the group arrives.", color: "#3a8fc4" },
  { id: "onsite", label: "On site", hint: "Checked in. Inspect the facilities, collect what's owed and check them out when they leave.", color: "#2e9e4e" },
  { id: "settle", label: "To settle", hint: "Checked out without paying everything. Collect the rest, then settle.", color: "#e07a3a" },
  { id: "done", label: "Done today", hint: "Settled and completed today.", color: "#4a9fd4" },
];

/** How far ahead "To prepare" looks. */
export const PREPARE_HORIZON_DAYS = 14;

// ── When a booking can be prepared ───────────────────────────────────
//
// The preparation checklist (pool clean, rooms made up) only means
// something close to the visit: other groups use the same pool and rooms
// in between, so a checklist ticked two weeks ahead says nothing about the
// day. Every booking therefore follows one rule, which the server enforces
// too (/api/inspections):
//
//   opens    PREP_OPENS_DAYS_BEFORE day(s) before the visit date
//   closes   when the group checks in, or once the visit date has passed
//
// A booking further out still shows under "To prepare", with the date its
// preparation opens instead of a button.

/** Preparation opens this many days before the visit date. */
export const PREP_OPENS_DAYS_BEFORE = 1;

/** The first day (YYYY-MM-DD, Manila) a booking's facilities can be prepared. */
export function prepOpensOn(b: Pick<Booking, "date">): string {
  return addDays(b.date, -PREP_OPENS_DAYS_BEFORE);
}

/** Why a booking can't be prepared on `today`, or null when it can. */
export function prepBlocked(b: Pick<Booking, "date" | "checkedInAt">, today: string): string | null {
  if (b.checkedInAt) return "This group has already checked in, so preparation is closed.";
  if (b.date < today) return `The visit date (${fmtDate(b.date)}) has passed, so it can no longer be prepared.`;
  if (today < prepOpensOn(b)) return `Preparation opens on ${fmtDate(prepOpensOn(b))}, the day before the visit.`;
  return null;
}

export interface OpsCard {
  b: Booking;
  stage: OpsStage;
  /** A preparation check has been saved for this visit. */
  prepared: boolean;
  /** The visit date has passed and the group never checked in. */
  overdue: boolean;
  /** Checked in and the booked hours are over. */
  timeUp: boolean;
  /** When the booked hours end (on-site groups only). */
  endsAt: Date | null;
  view: OpsView;
  /** Which Today column it sits in (today's cards only). */
  column: TodayColumn | null;
}

/* "reschedule" has no OpsCard of its own: it lists date-change REQUESTS,
   which belong to a booking rather than being one. placeOf() never returns
   it — OperationsTab builds that panel straight from ops.dateChanges. */
export type OpsView = "today" | "upcoming" | "done" | "reschedule";
export type TodayColumn = "arriving" | "onsite" | "settle";

export const TODAY_COLUMNS: { id: TodayColumn; label: string; hint: string; empty: string; color: string }[] = [
  { id: "arriving", label: "Arriving", hint: "Check each group in when they arrive.", empty: "No one waiting to arrive.", color: "#3a8fc4" },
  { id: "onsite", label: "On site", hint: "As they leave: inspect, collect what's owed, done.", empty: "No groups on site.", color: "#2e9e4e" },
  { id: "settle", label: "To settle", hint: "Checked out but not fully paid. Collect the rest to close it.", empty: "Nothing to settle.", color: "#e07a3a" },
];

function placeOf(stage: OpsStage, date: string, today: string): { view: OpsView; column: TodayColumn | null } {
  switch (stage) {
    case "done": return { view: "done", column: null };
    case "prepare": return { view: "upcoming", column: null };
    // An unconfirmed booking for today (or a past day) is today's problem:
    // it sits with the arrivals so it can't be missed at the gate.
    case "confirm": return date <= today ? { view: "today", column: "arriving" } : { view: "upcoming", column: null };
    case "arriving": return { view: "today", column: "arriving" };
    case "onsite": return { view: "today", column: "onsite" };
    case "settle": return { view: "today", column: "settle" };
  }
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function opsStage(b: Booking, today: string): OpsStage | null {
  if (b.archived || b.status === "Cancelled" || b.status === "ResortCancelled" || b.id.startsWith("TMP-")) return null;
  if (b.status === "Completed") {
    const when = b.settledAt ?? b.checkedOutAt;
    return (when ? manilaDate(when) : b.date) === today ? "done" : null;
  }
  if (b.status === "Pending") return "confirm";
  // Confirmed
  if (b.checkedOutAt) return "settle";
  if (b.checkedInAt) return "onsite";
  if (b.date <= today) return "arriving";
  if (b.date <= addDays(today, PREPARE_HORIZON_DAYS)) return "prepare";
  return null;
}

export function opsBoard(bookings: Booking[], inspections: Inspection[], now: Date): OpsCard[] {
  const today = manilaDate(now);
  const prepared = new Set(inspections.filter((i) => i.stage === "Preparation").map((i) => i.bookingId));
  const cards: OpsCard[] = [];
  for (const b of bookings) {
    const stage = opsStage(b, today);
    if (!stage) continue;
    const w = stage === "onsite" ? getOccupancyWindow(b) : null;
    cards.push({
      b,
      stage,
      prepared: prepared.has(b.id),
      overdue: stage === "arriving" && b.date < today,
      timeUp: !!w && now.getTime() >= w.end.getTime(),
      endsAt: w?.end ?? null,
      ...placeOf(stage, b.date, today),
    });
  }
  // Earliest visit first; within a day, walk-ins with an arrival time first.
  return cards.sort((x, y) =>
    x.b.date.localeCompare(y.b.date) ||
    (x.b.arrivalTime ?? "99").localeCompare(y.b.arrivalTime ?? "99") ||
    (x.b.createdAt ?? 0) - (y.b.createdAt ?? 0));
}

// ── Closing the day ──────────────────────────────────────────────────
// A day can be closed only once every reservation up to it is finished:
// completed (inspected and paid, or closed unpaid with a reason) or
// cancelled (rejected, or a no-show). Then the cash count includes every
// peso those groups paid, and nothing from today hangs over into
// tomorrow. The same rule runs on the server (/api/closings), so it can't
// be skipped by any screen.

export type CloseNeed = "confirm" | "arrival" | "checkout" | "settle";

export const CLOSE_NEED: Record<CloseNeed, { label: string; todo: string }> = {
  checkout: { label: "Still on site", todo: "check them out" },
  settle: { label: "Not settled", todo: "collect the rest and settle" },
  arrival: { label: "Never checked in", todo: "complete the stay, or mark a no-show" },
  confirm: { label: "Not confirmed", todo: "accept it, or cancel it" },
};

export interface CloseBlocker { b: Booking; need: CloseNeed }

/** The reservations dated on or before `date` that still need finishing. */
export function closingBlockers(bookings: Booking[], date: string): CloseBlocker[] {
  const order = Object.keys(CLOSE_NEED) as CloseNeed[];
  return bookings
    .filter((b) => !b.archived && !b.id.startsWith("TMP-") && b.date <= date && (b.status === "Pending" || b.status === "Confirmed"))
    .map((b): CloseBlocker => ({
      b,
      need: b.status === "Pending" ? "confirm" : b.checkedOutAt ? "settle" : b.checkedInAt ? "checkout" : "arrival",
    }))
    .sort((x, y) => order.indexOf(x.need) - order.indexOf(y.need) || x.b.date.localeCompare(y.b.date));
}

// ── Days nobody closed ───────────────────────────────────────────────
//
// Closing the day (counting the cash drawer) is a step the owner has to
// remember. The Night Tour ends at midnight, so the natural time to close a
// day is the next morning, which is exactly when it's easy to forget. Every
// PAST day that needed a count and has none is chased in "Needs your
// attention" (and the sidebar badge) until it is closed.
//
// A day needs a count only when cash moved through the drawer: a cash
// payment (or cash refund) or a cash expense. A day with only GCash, bank or
// online payments, or nothing at all, has nothing to count and is never
// asked for. (A group visiting doesn't by itself make one due: unfinished
// bookings are chased in their own rows, and closing would only record ₱0.)

/** How far back an unclosed day is still chased. */
export const UNCLOSED_LOOKBACK_DAYS = 14;

/** Past days (oldest first) that need closing and haven't been. */
export function unclosedDays(args: {
  payments: Payment[];
  expenses: Expense[];
  closings: DailyClosing[];
  today: string;
}): string[] {
  const { payments, expenses, closings, today } = args;
  const from = addDays(today, -UNCLOSED_LOOKBACK_DAYS);
  const closed = new Set(closings.map((c) => c.closingDate));
  const due = new Set<string>();
  const add = (d: string) => { if (d >= from && d < today && !closed.has(d)) due.add(d); };
  for (const d of cashDays(payments, expenses)) add(d);
  return [...due].sort();
}

/** Every day (YYYY-MM-DD, Manila) on which cash went in or out of the drawer. */
function cashDays(payments: Payment[], expenses: Expense[]): Set<string> {
  const days = new Set<string>();
  for (const p of payments) if (!p.voided && p.method === "Cash") days.add(manilaDate(p.receivedAt));
  for (const e of expenses) if (!e.voided && e.method === "Cash") days.add(e.spentOn);
  return days;
}

// ── How many things need the owner's attention ──────────────────────
//
// OperationsTab renders the "Needs your attention" list with its wording and
// its buttons. The sidebar badge needs the same COUNT while that tab is not
// even mounted, so the rules live here, once, and both read them.
//
// Keep this in step with the list in OperationsTab: that file asserts the two
// agree in development, so a rule added there without one here fails loudly
// rather than quietly leaving the badge short.
export interface AttentionTally {
  /** Everything waiting, whatever its urgency. */
  total: number;
  /** The red ones: overdue, unconfirmed on the day, refunds owed, a
   *  resort-cancelled guest whose time to pick ran out, two or more days
   *  left unclosed. */
  urgent: number;
}

export function attentionTally(args: {
  bookings: Booking[];
  inspections: Inspection[];
  dateChanges: DateChange[];
  now: Date;
  /** `facilitiesForBooking` from lib/facilityUsage, passed in so this module
   *  stays free of that dependency. */
  usedBy: (b: Booking) => { id: number; status: string }[];
  /** For the "days not closed" reminder (unclosedDays). */
  payments: Payment[];
  expenses: Expense[];
  closings: DailyClosing[];
}): AttentionTally {
  const { bookings, inspections, dateChanges, now, usedBy, payments, expenses, closings } = args;
  const today = manilaDate(now);
  const cards = opsBoard(bookings, inspections, now);
  let total = 0;
  let urgent = 0;
  const add = (red: boolean) => { total++; if (red) urgent++; };

  for (const c of cards) {
    const b = c.b;
    if (c.overdue) add(true);
    if (c.timeUp && c.endsAt) add(true);
    if (c.stage === "confirm" && c.view === "today") add(b.date < today);
    if (c.stage === "arriving" && !c.overdue && !c.prepared) add(false);
    if (c.stage === "settle" && b.checkedOutAt && manilaDate(b.checkedOutAt) < today) add(false);
    if (c.view === "today" && (c.column === "arriving" || c.column === "onsite")) {
      for (const f of usedBy(b)) if (f.status === "Under Maintenance") add(false);
    }
  }

  const byId = new Map(bookings.map((b) => [b.id, b]));
  for (const r of dateChanges) {
    if (r.status !== "Pending") continue;
    if (!byId.has(r.bookingId)) continue;
    add(!holdActive(r, now.getTime()));
  }

  const picked = new Set(dateChanges.filter((r) => r.status === "Pending").map((r) => r.bookingId));
  for (const b of bookings) {
    if (b.refundStatus === "Owed") add(true);
    else if (choiceOpen(b, now.getTime())) add(false);
    else if (choiceExpired(b, picked.has(b.id), now.getTime())) add(true);
  }

  if (cards.some((c) => c.view === "upcoming" && c.stage === "confirm")) add(false);

  // One row for every unclosed day together; red once more than one slipped.
  const unclosed = unclosedDays({ payments, expenses, closings, today });
  if (unclosed.length > 0) add(unclosed.length > 1);

  return { total, urgent };
}
