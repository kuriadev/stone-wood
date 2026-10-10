"use client";

// ── Daily Operations: the admin's home screen
//
// What the owner opens first in the morning and keeps open all day. It is
// built around one question: what do I do next?
//
//   At a glance       who is still to arrive, who is on site, what is left
//                     to settle, and the money taken in so far
//   Needs attention   the few things that are late or about to be: a group
//                     past its booked hours, an arrival not prepared for, a
//                     booking never confirmed. Each has its own button.
//   Today             the day as three columns, in the order the work
//                     happens: Arriving → On site → To settle
//   Coming up         the next two weeks by date: bookings to confirm and
//                     facilities to prepare
//   Done today        what was settled, and the end-of-day cash count
//
// Each card shows how far its reservation has got (a five-step bar) and ONE
// button for the next step. Rarer actions (undo a check-in, take a payment
// early, mark a no-show) sit in the card's "…" menu, out of reach of a
// hurried tap at the gate.
//
// Operations stores nothing of its own. Each button opens the tool that
// already belongs to a module — accepting writes the booking (Bookings),
// Prepare and Check out save facility inspections and damage (Facility
// Management), Settle and Close the day write the payment ledger (Sales) —
// so every module keeps its full record while the daily routine happens
// here. Which step a booking is on is worked out in lib/operations.ts.

import { paymentLine, adminTabLabel } from "@/lib/labels";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { opsBoard, closingBlockers, attentionTally, unclosedDays, prepBlocked, prepOpensOn, OPS_STAGES, TODAY_COLUMNS, PREPARE_HORIZON_DAYS, type OpsCard, type OpsView } from "@/lib/operations";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { bookingMoney, collectedBetween, expensesBetween, livePayments, manilaDate, manilaTime, monthRange, round2, type BookingMoney } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot, holdsDate, bookingDays, bookingEndDate } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { gold } from "@/lib/styles";
import { Icon, type IconName } from "@/components/common/Icon";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { Facility } from "@/types/facility";
import type { ResortPackage } from "@/types/package";
import { PrepModal, CheckoutModal, SettleModal, VisitRecord } from "@/components/admin/InspectionModals";
import { WalkInModal } from "@/components/admin/WalkInModal";
import { RecordPaymentModal } from "@/components/admin/RecordPaymentModal";
import { LiveStatus } from "@/components/admin/LiveStatus";
import { ResortCancelDialog, type UpdateStatus } from "@/components/admin/ResortCancelDialog";
import { RefundModal } from "@/components/admin/RefundModal";
import { AddChargeModal } from "@/components/admin/AddChargeModal";
import { ChooseRefundDialog } from "@/components/admin/ChooseRefundDialog";
import { DateChangeReview } from "@/components/admin/DateChangeReview";
import { MoveBookingModal } from "@/components/admin/MoveBookingModal";
import { TextGuest } from "@/components/admin/TextGuest";
import { choiceOpen, choiceExpired, fmtDeadline, holdActive, isRebookRequest, withHolds } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { Closing } from "@/components/admin/SalesTab";
import { ActionButton, StatusBadge, Modal, ConfirmDialog, Label, AmountRow, ViewSwitcherTabs, useAdminStyle } from "@/components/admin/ui";
import { BarChart } from "@/components/admin/charts";
import { TAP_MIN } from "@/lib/spacing";
import type { AdminTab } from "@/types/admin";

interface OperationsTabProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  packages: ResortPackage[];
  facilities: Facility[];
  updateStatus: UpdateStatus;
  mob: boolean;
  /** Send the admin to another admin screen. The dashboard links out to
   *  Reports, Payments & Expenses and the rest rather than duplicating
   *  them. */
  onGoTab?: (t: AdminTab) => void;
}

type Open =
  | { kind: "prep" | "checkout" | "settle" | "record" | "pay" | "charge"; id: string }
  | { kind: "accept" | "reject" | "noshow" | "refund" | "textagain" | "refundchoice"; id: string }
  | { kind: "move"; id: string }
  | { kind: "datechange"; reqId: number }
  | { kind: "walkin" }
  | { kind: "paynew" };

/** Something late or about to be, for the "Needs attention" list. */
interface Attention {
  key: string;
  /** Which list it belongs to.
   *
   *  urgent   — the resort is losing money, breaking a promise or cannot
   *             close the day until this is done. It blocks other work.
   *  reminder — true and worth knowing, but nothing is broken if it waits
   *             an hour: a group arriving later whose facilities are not
   *             ticked yet, a guest still inside their own deadline.
   *
   *  The split is deliberate and not the same as `tone`: a colour says how
   *  loud a row looks, this says which half of the dashboard it lives in. */
  kind: "urgent" | "reminder";
  /** red: already late. amber: needs doing today. blue: worth knowing. */
  tone: "red" | "amber" | "blue";
  icon: IconName;
  text: ReactNode;
  actions: ReactNode;
}

const TONE: Record<Attention["tone"], string> = { red: "#d44", amber: "#d4a800", blue: "#3a8fc4" };
const ATTENTION_SHOWN = 4;

const localTime = (d: Date) => d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

/** "1 hr 20 min" */
function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  return h ? `${h} hr${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`;
}

/** "Tomorrow · Saturday, October 5" */
function dayHeading(date: string, today: string): string {
  const d = new Date(`${date}T00:00:00`);
  const long = d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  const t = new Date(`${today}T00:00:00`);
  const days = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  return days === 1 ? `Tomorrow · ${long}` : long;
}

export function OperationsTab({ bookings, setBookings, rooms, packages, facilities, updateStatus, mob, onGoTab }: OperationsTabProps) {
  const { C, cBg, cBr, soft, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();

  // A live clock, so "Time's up" and the day roll over on their own.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = manilaDate(now);

  const [view, setView] = useState<OpsView>("today");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Open | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [allUrgent, setAllUrgent] = useState(false);
  const [allReminders, setAllReminders] = useState(false);
  /* Reminders the admin has waved away. Session-only and never persisted:
     a reminder describes a live condition, so hiding it must not outlive
     the screen or it would quietly bury something still true. */
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  // Its own flag rather than part of `open`: the closing window stays open
  // underneath while a booking on its checklist is finished on top of it.
  const [closing, setClosing] = useState(false);
  /** The day the closing window opens on: today, or a past day left open. */
  const [closeDate, setCloseDate] = useState<string | undefined>(undefined);
  const openClosing = (date?: string) => { setCloseDate(date); setClosing(true); };

  const cards = useMemo(() => opsBoard(bookings, ops.inspections, now), [bookings, ops.inspections, now]);
  const moneyById = useMemo(
    () => new Map(cards.map((c) => [c.b.id, bookingMoney(c.b, ops.payments, ops.damages)])),
    [cards, ops.payments, ops.damages],
  );
  const money = (b: Booking): BookingMoney => moneyById.get(b.id) ?? bookingMoney(b, ops.payments, ops.damages);

  const todayCards = cards.filter((c) => c.view === "today");
  const upcoming = cards.filter((c) => c.view === "upcoming");
  const doneToday = cards.filter((c) => c.view === "done");

  // ── At a glance ────────────────────────────────────────────────────
  const dueToday = bookings.filter((b) => b.date === today && !b.archived && holdsDate(b) && !b.id.startsWith("TMP-"));
  const arrivedToday = dueToday.filter((b) => b.checkedInAt || b.status === "Completed").length;
  const onSite = cards.filter((c) => c.stage === "onsite");
  const headcount = onSite.reduce((n, c) => n + (c.b.guests || 0), 0);
  const toSettle = cards.filter((c) => c.stage === "settle");
  const toSettleDue = round2(toSettle.reduce((n, c) => n + money(c.b).due, 0));
  const collectedToday = collectedBetween(ops.payments, today);
  const spentToday = expensesBetween(ops.expenses, today);
  const closedToday = ops.closings.find((c) => c.closingDate === today);
  /** What still has to be finished before today can be closed. */
  const toFinish = closingBlockers(bookings, today).length;
  /** Did any cash go through the drawer today? Only then is there a count. */
  const cashToday = ops.payments.some((p) => !p.voided && p.method === "Cash" && manilaDate(p.receivedAt) === today)
    || ops.expenses.some((e) => !e.voided && e.method === "Cash" && e.spentOn === today);

  const find = (id: string) => bookings.find((b) => b.id === id) ?? null;
  const current = open && "id" in open ? find(open.id) : null;
  const reviewing = open?.kind === "datechange" ? ops.dateChanges.find((r) => r.id === open.reqId) ?? null : null;
  const go = (kind: Extract<Open, { id: string }>["kind"], b: Booking) => {
    if (kind === "reject" || kind === "noshow") setReason("");
    setOpen({ kind, id: b.id });
  };

  const checkIn = async (b: Booking, undo = false) => {
    setBusyId(b.id);
    const r = await ops.checkIn(b.id, undo);
    setBusyId(null);
    if (!r.ok) return toast(r.error, "error");
    toast(undo ? `Check-in undone for ${b.name}.` : `${b.name} checked in. ${b.guests} guest${b.guests === 1 ? "" : "s"} on site.`, undo ? "info" : "success");
  };

  const usesText = (b: Booking) => {
    const used = facilitiesForBooking(b, facilities);
    const roomNames = used.filter((f) => f.category === "Room").map((f) => f.name.split(" –")[0]);
    const amenities = used.filter((f) => f.category === "Amenity").length;
    return [amenities && `${amenities} amenit${amenities === 1 ? "y" : "ies"}`, ...roomNames].filter(Boolean).join(" · ") || "No listed facilities";
  };

  // ── Needs attention ────────────────────────────────────────────────
  const attention: Attention[] = [];
  for (const c of cards) {
    const { b } = c;
    const who = <strong style={{ color: C.textH }}>{b.name}</strong>;
    if (c.overdue) {
      attention.push({ key: `late-${b.id}`, kind: "urgent", tone: "red", icon: "alert",
        text: <>{who} was due on {fmtDate(b.date)} and was never checked in. Complete the stay if they came, or mark a no-show.</>,
        actions: <>
          <ActionButton size="sm" kind="primary" onClick={() => go("checkout", b)}>Complete stay</ActionButton>
          <ActionButton size="sm" kind="red" onClick={() => go("noshow", b)}>No-show</ActionButton>
        </> });
    }
    if (c.timeUp && c.endsAt) {
      attention.push({ key: `time-${b.id}`, kind: "urgent", tone: "red", icon: "clock",
        text: <>{who}&apos;s booked time ended at {localTime(c.endsAt)}, {duration(now.getTime() - c.endsAt.getTime())} ago.</>,
        actions: <ActionButton size="sm" kind="primary" onClick={() => go("checkout", b)}>Check out</ActionButton> });
    }
    if (c.stage === "confirm" && c.view === "today") {
      attention.push({ key: `confirm-${b.id}`, kind: "urgent", tone: b.date < today ? "red" : "amber", icon: "clipboard",
        text: <>{who}&apos;s booking for {b.date === today ? "today" : fmtDate(b.date)} isn&apos;t confirmed yet.</>,
        actions: <>
          <ActionButton size="sm" kind="primary" onClick={() => go("accept", b)}>Review</ActionButton>
          <ActionButton size="sm" kind="red" onClick={() => go("reject", b)}>Decline booking</ActionButton>
        </> });
    }
    if (c.stage === "arriving" && !c.overdue && !c.prepared) {
      attention.push({ key: `prep-${b.id}`, kind: "reminder", tone: "amber", icon: "clipboard-check",
        text: <>{who} arrives today, but the facilities haven&apos;t been prepared.</>,
        actions: <ActionButton size="sm" kind="primary" onClick={() => go("prep", b)}>Prepare for arrival</ActionButton> });
    }
    if (c.stage === "settle" && b.checkedOutAt && manilaDate(b.checkedOutAt) < today) {
      attention.push({ key: `settle-${b.id}`, kind: "urgent", tone: "amber", icon: "receipt",
        text: <>{who} checked out on {fmtDate(manilaDate(b.checkedOutAt))} and the booking hasn&apos;t been closed.</>,
        actions: <ActionButton size="sm" kind="primary" onClick={() => go("settle", b)}>Collect & close</ActionButton> });
    }
    if (c.view === "today" && (c.column === "arriving" || c.column === "onsite")) {
      for (const f of facilitiesForBooking(b, facilities).filter((x) => x.status === "Under Maintenance")) {
        attention.push({ key: `maint-${b.id}-${f.id}`, kind: "reminder", tone: "amber", icon: "toolbox",
          text: <><strong style={{ color: C.textH }}>{f.name}</strong> is under maintenance, but {who}&apos;s booking uses it.</>,
          actions: <ActionButton size="sm" onClick={() => go("record", b)}>View booking</ActionButton> });
      }
    }
  }
  // A guest asking to move their booking, or picking a new date after the
  // resort cancelled: either way the date is held until you answer.
  for (const r of ops.dateChanges) {
    if (r.status !== "Pending") continue;
    const b = find(r.bookingId);
    if (!b) continue;
    const active = holdActive(r, now.getTime());
    attention.push({ key: `move-${r.id}`, kind: active ? "reminder" : "urgent", tone: active ? "amber" : "red", icon: "calendar",
      text: <><strong style={{ color: C.textH }}>{b.name}</strong>{" "}
        {isRebookRequest(r, b)
          ? <>picked {fmtDate(r.toDate)} for {b.id} after the resort cancelled {fmtDate(r.fromDate)}.</>
          : <>asks to move {b.id} from {fmtDate(r.fromDate)} to {fmtDate(r.toDate)}.</>}{" "}
        {active ? <>Held for them until {fmtDeadline(r.holdUntil!)}.</> : <>The 48-hour hold ran out.</>}</>,
      actions: <ActionButton size="sm" kind="primary" onClick={() => setOpen({ kind: "datechange", reqId: r.id })}>Review</ActionButton> });
  }
  // Money the resort owes back, and guests still deciding after a
  // resort cancellation. These outlive the board's date range, so they
  // read every booking.
  for (const b of bookings) {
    const who = <strong style={{ color: C.textH }}>{b.name}</strong>;
    if (b.refundStatus === "Owed") {
      attention.push({ key: `refund-${b.id}`, kind: "urgent", tone: "red", icon: "cash",
        text: <>{who} is owed a refund of {fmt(b.refundAmount ?? 0)} ({b.id}). Send it and record the reference.</>,
        actions: <ActionButton size="sm" kind="primary" onClick={() => go("refund", b)}>Send refund</ActionButton> });
    } else if (choiceOpen(b, now.getTime())) {
      attention.push({ key: `waiting-${b.id}`, kind: "reminder", tone: "blue", icon: "clock",
        text: <>{who} hasn&apos;t picked a new date yet for {b.id} (cancelled by the resort). They have until {fmtDeadline(b.choiceDeadline!)}.</>,
        actions: <>
          <ActionButton size="sm" onClick={() => go("textagain", b)}>Text them</ActionButton>
          <ActionButton size="sm" kind="red" onClick={() => go("refundchoice", b)}>Refund instead</ActionButton>
        </> });
    } else if (choiceExpired(b, ops.dateChanges.some((r) => r.bookingId === b.id && r.status === "Pending"), now.getTime())) {
      // Their time to pick online ran out. The booking waits on the owner
      // now: agree a date or a refund with them, then record it here.
      attention.push({ key: `expired-${b.id}`, kind: "urgent", tone: "red", icon: "clock",
        text: <>{who} didn&apos;t pick a new date for {b.id} in time (cancelled by the resort).{(b.heldAmount ?? 0) > 0 ? <> {fmt(b.heldAmount ?? 0)} is still held for them.</> : null} Contact them to agree a new date or a refund.</>,
        actions: <>
          <ActionButton size="sm" kind="primary" onClick={() => go("move", b)}>Set a new date</ActionButton>
          <ActionButton size="sm" kind="red" onClick={() => go("refundchoice", b)}>Refund instead</ActionButton>
        </> });
    }
  }
  // Past days that needed a cash count and never got one (unclosedDays in
  // lib/operations.ts). One row for all of them; the button opens the
  // closing window on the oldest, which lists anything still to finish.
  const unclosed = unclosedDays({ payments: ops.payments, expenses: ops.expenses, closings: ops.closings, today });
  if (unclosed.length > 0) {
    const first = unclosed[0];
    attention.push({ key: "unclosed-days", kind: "urgent", tone: unclosed.length > 1 ? "red" : "amber", icon: "wallet",
      text: unclosed.length === 1
        ? <>{first === manilaDate(new Date(now.getTime() - 86_400_000)) ? "Yesterday" : fmtDate(first)} wasn&apos;t closed. Count the cash box and close it so the records match the money in it.</>
        : <>{unclosed.length} days weren&apos;t closed: {unclosed.map(fmtDate).join(", ")}. Close each one, oldest first, so every cash count is right.</>,
      actions: <ActionButton size="sm" kind="primary" onClick={() => openClosing(first)}>Close {fmtDate(first)}</ActionButton> });
  }
  const waitingConfirm = upcoming.filter((c) => c.stage === "confirm");
  if (waitingConfirm.length > 0) {
    attention.push({ key: "confirm-upcoming", kind: "reminder", tone: "blue", icon: "info",
      text: <>{waitingConfirm.length} upcoming booking{waitingConfirm.length === 1 ? " is" : "s are"} waiting for your confirmation.</>,
      actions: <ActionButton size="sm" onClick={() => { setQ(""); setView("upcoming"); }}>Review</ActionButton> });
  }
  /* The sidebar badge counts the same board from lib/operations.ts, because
     it has to show a number while this component is unmounted. Two rule sets
     drift silently, so in development they are compared on every render: add
     a row above without adding its rule there and this fires immediately. */
  if (process.env.NODE_ENV !== "production") {
    const tally = attentionTally({
      bookings, inspections: ops.inspections, dateChanges: ops.dateChanges,
      now, usedBy: (b) => facilitiesForBooking(b, facilities),
      payments: ops.payments, expenses: ops.expenses, closings: ops.closings,
    });
    if (tally.total !== attention.length) {
      console.warn(
        `[OperationsTab] attention list has ${attention.length} rows but attentionTally() counts ${tally.total}. ` +
        "The sidebar badge will be wrong — keep lib/operations.ts attentionTally in step with this list.",
      );
    }
  }

  const rank = { red: 0, amber: 1, blue: 2 } as const;
  attention.sort((a, b) => rank[a.tone] - rank[b.tone]);
  /* Two lists, one source. The split happens here rather than at each
     push, so `attention.length` stays the number the sidebar badge is
     checked against just above. */
  const urgent = attention.filter((a) => a.kind === "urgent");
  const allReminderRows = attention.filter((a) => a.kind === "reminder");
  const reminders = allReminderRows.filter((a) => !dismissed.has(a.key));
  const hiddenReminders = allReminderRows.length - reminders.length;
  const urgentShown = allUrgent ? urgent : urgent.slice(0, ATTENTION_SHOWN);
  const remindersShown = allReminders ? reminders : reminders.slice(0, ATTENTION_SHOWN);

  // ── One reservation ────────────────────────────────────────────────
  const card = (c: OpsCard) => {
    const { b, stage } = c;
    const m = money(b);
    const slot = SLOTS[getBookingSlot(b)];
    const busy = busyId === b.id;
    const color = OPS_STAGES.find((s) => s.id === stage)!.color;
    // Arrived online while this screen was open (most are confirmed at once).
    const fresh = ops.freshIds.has(b.id);

    const steps = [
      { label: "Confirmed", done: b.status !== "Pending" },
      { label: "Prepared", done: c.prepared },
      { label: "Checked in", done: !!b.checkedInAt },
      { label: "Checked out", done: !!b.checkedOutAt },
      { label: "Closed", done: b.status === "Completed" },
    ];
    const next =
      stage === "confirm" ? "Next: check the payment, then accept"
        : stage === "prepare" ? (c.prepared ? `Ready. Next: check in on ${fmtDate(b.date)}`
          : prepBlocked(b, today) ? `Next: prepare the facilities from ${fmtDate(prepOpensOn(b))}` : "Next: prepare the facilities")
          : stage === "arriving" ? (c.overdue ? "Next: complete the stay, or mark a no-show" : "Next: check in when they arrive")
            : stage === "onsite" ? (m.due > 0 ? `Next: check out and collect ${fmt(m.due)}` : "Next: check out as they leave")
              : stage === "settle" ? (m.due > 0 ? `Next: collect ${fmt(m.due)} and close the booking` : "Next: close the booking")
                : `Completed${b.settledAt ? ` at ${manilaTime(b.settledAt)}` : ""}`;

    const canPay = (stage === "confirm" || stage === "prepare" || stage === "arriving" || stage === "onsite") && m.due > 0;
    // Opens the day before the visit; the server refuses it earlier too.
    const prepClosed = prepBlocked(b, today);
    const canPrep = (stage === "prepare" || stage === "arriving") && !prepClosed;

    let primary: ReactNode = null;
    let secondary: ReactNode = null;
    switch (stage) {
      case "confirm":
        primary = <ActionButton kind="primary" icon="check" onClick={() => go("accept", b)}>Review & accept</ActionButton>;
        secondary = <ActionButton kind="red" icon="x" onClick={() => go("reject", b)}>Decline booking</ActionButton>;
        break;
      case "prepare":
        primary = !canPrep
          ? <ActionButton icon="clipboard-check" disabled title={prepClosed ?? undefined}>Preparation opens {fmtDate(prepOpensOn(b))}</ActionButton>
          : c.prepared
            ? <ActionButton icon="clipboard-check" onClick={() => go("prep", b)}>View / edit preparation</ActionButton>
            : <ActionButton kind="primary" icon="clipboard-check" onClick={() => go("prep", b)}>Prepare facilities</ActionButton>;
        break;
      case "arriving":
        // A past date the owner never tapped through: the group most likely
        // came and went, so finishing the stay is the main button.
        if (c.overdue) {
          primary = <ActionButton kind="primary" icon="check" onClick={() => go("checkout", b)}>Complete stay</ActionButton>;
          secondary = <ActionButton kind="red" onClick={() => go("noshow", b)}>No-show</ActionButton>;
        } else {
          primary = <ActionButton kind="primary" icon="log-in" disabled={busy} onClick={() => checkIn(b)}>{busy ? "Checking in…" : "Check in"}</ActionButton>;
          secondary = !c.prepared ? <ActionButton icon="clipboard-check" onClick={() => go("prep", b)}>Prepare for arrival</ActionButton> : null;
        }
        break;
      case "onsite":
        primary = <ActionButton kind="primary" icon="logout" onClick={() => go("checkout", b)}>{m.due > 0 ? `Check out · ${fmt(m.due)}` : "Check out"}</ActionButton>;
        break;
      case "settle":
        primary = <ActionButton kind="primary" icon="receipt" onClick={() => go("settle", b)}>{m.due > 0 ? `Collect ${fmt(m.due)} & close` : "Close booking"}</ActionButton>;
        break;
      case "done":
        primary = <ActionButton icon="eye" onClick={() => go("record", b)}>View stay record</ActionButton>;
        break;
    }

    /* Red when the slot has run out or the booking is overdue, otherwise the
       ordinary card edge. Named once because three sides now use it. */
    const edge = c.timeUp || c.overdue ? "#d4444066" : cBr;

    return (
      <article key={b.id} aria-label={`${b.name}, ${next}`}
        /* Three sides written out rather than a `border` shorthand with
           `borderLeft` after it: React warns that updating one during a
           re-render while the other is set can leave the two out of step,
           and the left edge here is a status colour that changes. */
        style={{ background: cBg, borderTop: `1px solid ${edge}`, borderRight: `1px solid ${edge}`, borderBottom: `1px solid ${edge}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => go("record", b)} title="Open the full reservation"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.textH, fontWeight: 600, fontSize: 15, textAlign: "left" }}>
                {b.name}
              </button>
              {fresh && <StatusBadge color={gold}>New</StatusBadge>}
            </div>
            <div style={{ color: C.textS, fontSize: 12, marginTop: 4 }}>
              {b.date === today ? "Today" : fmtDate(b.date)}{bookingDays(b) > 1 ? ` – ${fmtDate(bookingEndDate(b))} (${bookingDays(b)} days)` : ""} · {slot.label} ({slot.hours}){b.arrivalTime ? ` · arrives ${b.arrivalTime}` : ""}
            </div>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More for ${b.name}`}
                style={{ background: "transparent", border: `1px solid ${cBr}`, borderRadius: 8, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.textB, cursor: "pointer", flexShrink: 0 }}>
                <Icon name="more" size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 200 }}>
              <DropdownMenuItem onSelect={() => go("record", b)}><Icon name="eye" />Full details</DropdownMenuItem>
              {/* Moving a date by hand is offered only on "Coming up": a
                  booking arriving today or already on site is past the point
                  where changing its date means anything, and the server
                  refuses it anyway. */}
              {c.view === "upcoming" && (
                <DropdownMenuItem onSelect={() => go("move", b)}><Icon name="edit" />Change the date</DropdownMenuItem>
              )}
              {canPay && <DropdownMenuItem onSelect={() => go("pay", b)}><Icon name="cash" />Record a payment</DropdownMenuItem>}
              {/* Overtime, extra guests or a room taken on the day, up to settling. */}
              {stage !== "done" && <DropdownMenuItem onSelect={() => go("charge", b)}><Icon name="plus" />Add a charge (overtime, guests, room)</DropdownMenuItem>}
              {canPrep && <DropdownMenuItem onSelect={() => go("prep", b)}><Icon name="clipboard-check" />{c.prepared ? "Edit preparation" : "Prepare facilities"}</DropdownMenuItem>}
              {stage === "arriving" && !c.overdue && <DropdownMenuItem onSelect={() => go("checkout", b)}><Icon name="check" />Complete stay in one step</DropdownMenuItem>}
              {stage === "arriving" && c.overdue && <DropdownMenuItem disabled={busy} onSelect={() => checkIn(b)}><Icon name="log-in" />Check in only</DropdownMenuItem>}
              {stage === "onsite" && <DropdownMenuItem disabled={busy} onSelect={() => checkIn(b, true)}><Icon name="history" />Undo check-in</DropdownMenuItem>}
              {stage === "arriving" && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => go("noshow", b)}><Icon name="x" />Mark as no-show</DropdownMenuItem>
              </>}
              {(stage === "confirm" || stage === "prepare" || stage === "arriving") && <>
                {stage !== "arriving" && <DropdownMenuSeparator />}
                <DropdownMenuItem variant="destructive" onSelect={() => go("reject", b)}><Icon name="x" />Cancel (resort can&apos;t host)</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div style={{ color: C.textB, fontSize: 12.5, lineHeight: 1.6 }}>
          <div><Icon name="users" size={12} style={{ marginRight: 8, verticalAlign: -1 }} />{b.guests} guest{b.guests === 1 ? "" : "s"} · {b.package}</div>
          <div style={{ color: C.textS }}><Icon name="toolbox" size={12} style={{ marginRight: 8, verticalAlign: -1 }} />{usesText(b)}</div>
        </div>

        {/* Where it stands: five steps, and the next one in words. */}
        <div>
          <div aria-hidden style={{ display: "flex", gap: 4 }}>
            {steps.map((s) => (
              <span key={s.label} title={`${s.label}: ${s.done ? "done" : "not yet"}`}
                style={{ flex: 1, height: 4, borderRadius: 2, background: s.done ? "#2e9e4e" : cBr }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, fontSize: 12, color: C.textB }}>
            <span>{next}</span>
            <span style={{ color: C.textS, whiteSpace: "nowrap" }}>{steps.filter((s) => s.done).length} of 5</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {stage === "confirm" && (m.paid > 0
            ? <StatusBadge color="#2e9e4e">{fmt(m.paid)} paid</StatusBadge>
            : <StatusBadge color="#d4a800">No payment yet</StatusBadge>)}
          {stage === "prepare" && (c.prepared
            ? <StatusBadge color="#2e9e4e"><Icon name="check" size={11} />Ready</StatusBadge>
            : <StatusBadge color="#d4a800">Not prepared</StatusBadge>)}
          {stage === "arriving" && !c.prepared && <StatusBadge color="#d4a800">Not prepared</StatusBadge>}
          {c.overdue && <StatusBadge color="#d44">Was due {fmtDate(b.date)}</StatusBadge>}
          {stage === "onsite" && b.checkedInAt && <StatusBadge color="#2e9e4e">In since {manilaTime(b.checkedInAt)}</StatusBadge>}
          {stage === "onsite" && c.endsAt && (c.timeUp
            ? <StatusBadge color="#d44">Time&apos;s up · {duration(now.getTime() - c.endsAt.getTime())} over</StatusBadge>
            : <StatusBadge color={C.textS}>Until {localTime(c.endsAt)}</StatusBadge>)}
          {(stage === "arriving" || stage === "onsite" || stage === "settle") && (m.due > 0
            ? <StatusBadge color="#d4a800">{fmt(m.due)} to collect</StatusBadge>
            : <StatusBadge color="#2e9e4e">Fully paid</StatusBadge>)}
          {stage === "done" && (m.due > 0 ? <StatusBadge color="#d4a800">{fmt(m.due)} unpaid</StatusBadge> : <StatusBadge color="#4a9fd4">Closed</StatusBadge>)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* The next step, full width: the one button to look for. */}
          <div style={{ flex: "1 1 160px", display: "grid" }}>{primary}</div>
          {secondary}
        </div>
      </article>
    );
  };

  const grid = (list: OpsCard[]) => (
    <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
      {list.map(card)}
    </div>
  );

  const emptyNote = (text: ReactNode) => (
    <p style={{ color: C.textS, fontSize: 13.5, margin: 0, padding: "24px 16px", border: `1px dashed ${cBr}`, borderRadius: 10, textAlign: "center" }}>{text}</p>
  );

  // ── End of day: daily liquidation ──────────────────────────────────
  const endOfDay = (
    <section style={{ marginTop: 28, background: soft, borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ color: C.textH, fontWeight: 600, fontSize: 15 }}>End of day</div>
        <div style={{ color: C.textS, fontSize: 13, marginTop: 4 }}>
          {fmt(collectedToday)} received − {fmt(spentToday)} spent = <strong style={{ color: C.textH }}>{fmt(round2(collectedToday - spentToday))}</strong> net today.
          {closedToday
            ? ` Cash counted at ${manilaTime(closedToday.closedAt)}.`
            : !cashToday
              ? " No cash went in or out of the cash box today, so there's nothing to count. The day's report builds itself."
              : toFinish > 0
                ? ` ${toFinish} booking${toFinish === 1 ? "" : "s"} to finish before the cash can be counted.`
                : " Every booking is finished. Count the cash box to close the day."}
        </div>
      </div>
      <ActionButton kind={closedToday || toFinish > 0 || !cashToday ? "ghost" : "primary"} icon="wallet" onClick={() => openClosing()}>
        {closedToday ? "View cash count" : !cashToday ? "View today's report" : toFinish > 0 ? `Close the day · ${toFinish} to finish` : "Count cash & close the day"}
      </ActionButton>
    </section>
  );

  // ── Views ──────────────────────────────────────────────────────────
  const todayPanel = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fit,minmax(290px,1fr))", gap: 16, alignItems: "start" }}>
        {TODAY_COLUMNS.map((col) => {
          const list = todayCards.filter((c) => c.column === col.id);
          return (
            <section key={col.id} aria-labelledby={`ops-col-${col.id}`} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <div style={{ borderBottom: `2px solid ${col.color}55`, paddingBottom: 8 }}>
                <h3 id={`ops-col-${col.id}`} style={{ color: C.textH, fontSize: 15.5, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.color }} />{col.label}
                  <span style={{ color: C.textS, fontWeight: 400 }}>({list.length})</span>
                </h3>
                <div style={{ color: C.textS, fontSize: 12.5, marginTop: 4 }}>{col.hint}</div>
              </div>
              {list.length === 0 ? emptyNote(col.empty) : list.map(card)}
            </section>
          );
        })}
      </div>
      {todayCards.length === 0 && (
        <p style={{ color: C.textS, fontSize: 13.5, margin: "16px 0 0" }}>
          No groups today.{upcoming.length > 0 && <> {" "}
            <button type="button" onClick={() => setView("upcoming")} style={{ background: "none", border: "none", padding: 0, color: C.goldInk, cursor: "pointer", fontSize: 13.5 }}>
              See what&apos;s coming up <Icon name="arrow-right" size={13} style={{ verticalAlign: -2 }} />
            </button></>}
        </p>
      )}
      {endOfDay}
    </>
  );

  const upcomingDates = [...new Set(upcoming.map((c) => c.b.date))].sort();
  const upcomingPanel = (
    <>
      {upcoming.length === 0
        ? emptyNote("Nothing to confirm or prepare in the next two weeks.")
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {upcomingDates.map((d) => {
              const list = upcoming.filter((c) => c.b.date === d);
              const toConfirm = list.filter((c) => c.stage === "confirm").length;
              const toPrep = list.filter((c) => c.stage === "prepare" && !c.prepared).length;
              const summary = [toConfirm && `${toConfirm} to confirm`, toPrep && `${toPrep} to prepare`].filter(Boolean).join(" · ") || "All ready";
              return (
                <section key={d} aria-labelledby={`ops-day-${d}`}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                    <h3 id={`ops-day-${d}`} style={{ color: C.textH, fontSize: 15.5, fontWeight: 600, margin: 0 }}>{dayHeading(d, today)}</h3>
                    <span style={{ color: summary === "All ready" ? "#2e9e4e" : C.textS, fontSize: 12.5 }}>{summary}</span>
                  </div>
                  {grid(list)}
                </section>
              );
            })}
          </div>
        )}
      <p style={{ color: C.textS, fontSize: 12.5, margin: "20px 0 0" }}>
        Shows every booking still waiting for confirmation, and confirmed bookings for the next {PREPARE_HORIZON_DAYS} days. All bookings are in Bookings.
      </p>
    </>
  );

  /* ── Reschedules ───────────────────────────────────────────────────
     Every date change waiting on the owner, of two kinds:
       • a confirmed guest asking to move their booking (once per booking)
       • a guest the resort cancelled on, picking their new date
     Both need approving, so the owner always knows what moves where. These
     already appear in "Needs your attention", but that list empties as
     things are dealt with and a request can sit for 48 hours — so they get
     a bucket of their own that always shows the full queue.

     The availability question is already settled before this point: the
     guest could only pick a date that was free, and the chosen date is HELD
     (withHolds() makes it count as taken for walk-ins, the calendar and any
     other guest), so nothing can take it while the owner decides. Approving
     re-checks it once more server-side. */
  const pendingMoves = ops.dateChanges
    .filter((r) => r.status === "Pending")
    .map((r) => ({ r, b: find(r.bookingId) }))
    .filter((x): x is { r: typeof x.r; b: Booking } => !!x.b)
    .sort((a, b) => Date.parse(a.r.createdAt) - Date.parse(b.r.createdAt));

  /* Everything already settled: either kind of request once the owner
     answered it (or its hold ran out), plus dates the owner moved by hand
     (requestedBy "Resort", written in as Approved by
     /api/bookings/[id]/move). */
  const decidedMoves = ops.dateChanges
    .filter((r) => r.status !== "Pending")
    .map((r) => ({ r, b: find(r.bookingId) }))
    .filter((x): x is { r: typeof x.r; b: Booking } => !!x.b)
    .sort((a, b) => Date.parse(b.r.decidedAt ?? b.r.createdAt) - Date.parse(a.r.decidedAt ?? a.r.createdAt))
    .slice(0, 12);

  const decidedTone = (status: string) =>
    status === "Approved" ? "#6ec071" : status === "Declined" ? "#e55" : "#9a8e79";

  const pendingGrid = pendingMoves.length === 0
    ? null
    : (
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
        {pendingMoves.map(({ r, b }) => {
          const active = holdActive(r, now.getTime());
          const rebook = isRebookRequest(r, b);
          /* The visit date can pass while a request is still sitting here:
             a request made the night before holds its date for 48 hours.
             The server refuses to approve those, so say so up front rather
             than letting the owner find out from an error. A rebook's old
             date was called off by the resort, so it passing is no matter. */
          const datePassed = !rebook && r.fromDate <= today;
          const stale = !active || datePassed;
          return (
            <div key={r.id} style={{ background: cBg, border: `1px solid ${stale ? "#d4a80055" : cBr}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.textH, fontSize: 14.5, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ color: C.textS, fontSize: 12.5, fontFamily: "monospace" }}>{b.id}</div>
                </div>
                <StatusBadge color={stale ? "#e55" : "#d4a800"}>{datePassed ? "Visit date passed" : active ? "Awaiting you" : "Hold expired"}</StatusBadge>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ color: C.textS, textDecoration: rebook ? "line-through" : undefined }}>{fmtDate(r.fromDate)}</span>
                <Icon name="arrow-right" size={14} style={{ color: C.goldInk }} />
                <span style={{ color: C.textH, fontWeight: 600 }}>{fmtDate(r.toDate)}</span>
              </div>

              <div style={{ color: C.textXS, fontSize: 12 }}>
                {rebook && <>New date after the resort cancelled. Approving confirms the booking again. </>}
                {datePassed
                  ? <>{fmtDate(r.fromDate)} has already passed, so this can only be declined.</>
                  : active
                  ? <>Date held for them until {fmtDeadline(r.holdUntil!)}.</>
                  : <>The 48-hour hold ran out, so the date was released.</>}
              </div>

              <ActionButton size="sm" kind="primary" onClick={() => setOpen({ kind: "datechange", reqId: r.id })}>
                Review request
              </ActionButton>
            </div>
          );
        })}
      </div>
    );

  const reschedulePanel = (
    <>
      <h3 style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "0 0 12px" }}>
        Waiting on you{pendingMoves.length > 0 ? ` (${pendingMoves.length})` : ""}
      </h3>
      {pendingMoves.length === 0 ? emptyNote("No one is waiting on a date change.") : pendingGrid}

      <h3 style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, margin: "28px 0 12px" }}>
        Recently rescheduled
      </h3>
      {decidedMoves.length === 0 ? emptyNote("No date changes have been settled yet.") : (
        <div style={{ display: "grid", gap: 8 }}>
          {decidedMoves.map(({ r, b }) => (
            <div key={r.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <StatusBadge color={decidedTone(r.status)}>{r.status}</StatusBadge>
              <span style={{ color: C.textH, fontSize: 13.5, fontWeight: 600 }}>{b.name}</span>
              <span style={{ color: C.textS, fontSize: 12.5, fontFamily: "monospace" }}>{b.id}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ color: C.textS }}>{fmtDate(r.fromDate)}</span>
                <Icon name="arrow-right" size={13} style={{ color: C.goldInk }} />
                <span style={{ color: C.textH }}>{fmtDate(r.toDate)}</span>
              </span>
              {r.note && <span style={{ color: C.textXS, fontSize: 12 }}>{r.note}</span>}
              <ActionButton size="sm" style={{ marginLeft: "auto" }} onClick={() => go("record", b)}>View booking</ActionButton>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const donePanel = (
    <>
      {doneToday.length === 0 ? emptyNote("Nothing settled yet today.") : grid(doneToday)}
      {endOfDay}
    </>
  );

  // ── Dashboard figures ──────────────────────────────────────────────
  /* Everything the four cards read. They answer, in order: who is still
     coming, who is here, what money is still owed today, and whether the
     day is up or down. */
  const arrivingNow = todayCards.filter((c) => c.column === "arriving");
  const readyToArrive = arrivingNow.filter((c) => c.prepared).length;
  const expectedGuests = dueToday.reduce((n, b) => n + (b.guests || 0), 0);
  const owedToday = round2(todayCards.reduce((n, c) => n + money(c.b).due, 0));
  const owedTodayCount = todayCards.filter((c) => money(c.b).due > 0).length;
  const netToday = round2(collectedToday - spentToday);

  const month = monthRange(today);
  const receivedMonth = collectedBetween(ops.payments, month.from, month.to);
  const spentMonth = expensesBetween(ops.expenses, month.from, month.to);
  /* One bar per day of the month so far. It stops at today, so the chart is
     not a row of empty future days.
     The dates are built from `today`'s own string rather than by stepping a
     Date object: `today` is already a Manila date, and local Date arithmetic
     on a machine in another timezone slides the first and last bar by a
     day. */
  const monthChart = useMemo(() => {
    const prefix = today.slice(0, 8);
    const dayOfMonth = Number(today.slice(8, 10));
    return Array.from({ length: dayOfMonth }, (_, i) => {
      const iso = `${prefix}${String(i + 1).padStart(2, "0")}`;
      return { label: String(i + 1), value: collectedBetween(ops.payments, iso) };
    });
  }, [today, ops.payments]);

  /** One headline figure: icon tile, label, and a badge for its state. */
  const dashStat = (o: { icon: IconName; label: string; value: ReactNode; note: ReactNode; badge?: string; badgeColor?: string; color?: string }) => (
    <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 12, padding: "14px 16px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 9, background: soft, border: `1px solid ${cBr}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: o.color ?? C.goldInk, flexShrink: 0 }}>
          <Icon name={o.icon} size={16} />
        </span>
        <span style={{ flex: 1, minWidth: 0, color: C.textS, fontSize: 12.5 }}>{o.label}</span>
        {o.badge && (
          <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap", background: `${o.badgeColor ?? C.textS}22`, color: o.badgeColor ?? C.textS }}>{o.badge}</span>
        )}
      </div>
      <div style={{ color: o.color ?? C.textH, fontSize: mob ? 22 : 27, fontWeight: 600, lineHeight: 1.15 }}>{o.value}</div>
      <div style={{ color: C.textXS, fontSize: 12 }}>{o.note}</div>
    </div>
  );

  const statsRow = (
    <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
      {dashStat({
        icon: "calendar", label: "Still arriving",
        value: dueToday.length - arrivedToday,
        badge: arrivingNow.length ? `${readyToArrive} ready` : undefined,
        badgeColor: readyToArrive === arrivingNow.length ? "#2e9e4e" : "#d4a800",
        note: dueToday.length ? `${expectedGuests} expected guest${expectedGuests === 1 ? "" : "s"}` : "No bookings today",
      })}
      {dashStat({
        icon: "users", label: "Guests at the resort", value: headcount,
        color: onSite.length ? "#2e9e4e" : undefined,
        badge: onSite.length ? "Checked in" : undefined, badgeColor: "#2e9e4e",
        note: `${onSite.length} current booking${onSite.length === 1 ? "" : "s"}`,
      })}
      {dashStat({
        icon: "wallet", label: "Payments still needed", value: fmt(owedToday),
        color: owedToday > 0 ? "#d4a800" : undefined,
        badge: owedToday > 0 ? "Due today" : undefined, badgeColor: "#d4a800",
        note: owedToday > 0 ? `From ${owedTodayCount} booking${owedTodayCount === 1 ? "" : "s"}` : "Nothing owed today",
      })}
      {dashStat({
        icon: "cash", label: "Money left today", value: fmt(netToday),
        color: netToday < 0 ? "#d44" : "#2e9e4e",
        badge: netToday < 0 ? "Negative" : "Positive", badgeColor: netToday < 0 ? "#d44" : "#2e9e4e",
        note: `${fmt(collectedToday)} received · ${fmt(spentToday)} spent`,
      })}
    </div>
  );

  const showMore = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick}
      style={{ width: "100%", padding: 8, borderTop: `1px solid ${cBr}`, borderRight: "none", borderBottom: "none", borderLeft: "none", background: soft, color: C.textB, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );

  // ── Do these first: the work that blocks other work ────────────────
  const urgentPanel = urgent.length === 0 ? (
    <section style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderRadius: 12, background: "rgba(46,158,78,0.08)", border: "1px solid rgba(46,158,78,0.3)" }}>
      <Icon name="check-circle" size={18} style={{ color: "#2e9e4e", flexShrink: 0 }} />
      <span style={{ color: C.textB, fontSize: 13.5 }}>
        <strong style={{ color: C.textH }}>Nothing urgent.</strong> Everything that had to be done right now is done.
      </span>
    </section>
  ) : (
    <section aria-labelledby="dash-urgent" style={{ border: "1px solid #d4444055", borderRadius: 12, background: cBg, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
        <Icon name="alert" size={16} style={{ color: TONE.red, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="dash-urgent" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Do these first</h3>
          <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>These tasks must be done before other work</div>
        </div>
        <span style={{ padding: "4px 8px", borderRadius: 10, fontSize: 11.5, whiteSpace: "nowrap", background: `${TONE.red}22`, color: TONE.red }}>
          {urgent.length} to do
        </span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {urgentShown.map((a, i) => (
          <li key={a.key} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderTop: i ? `1px solid ${cBr}` : "none", borderLeft: `3px solid ${TONE[a.tone]}` }}>
            <Icon name={a.icon} size={15} style={{ color: TONE[a.tone], flexShrink: 0 }} />
            <span style={{ flex: "1 1 220px", color: C.textB, fontSize: 13.5 }}>{a.text}</span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{a.actions}</span>
          </li>
        ))}
      </ul>
      {urgent.length > ATTENTION_SHOWN && showMore(allUrgent ? "Show fewer" : `Show ${urgent.length - ATTENTION_SHOWN} more`, () => setAllUrgent((v) => !v))}
    </section>
  );

  // ── Reminders: true, but nothing breaks if they wait ───────────────
  const reminderPanel = (
    <section aria-labelledby="dash-reminders" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
        <Icon name="flag" size={16} style={{ color: C.goldInk, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="dash-reminders" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Reminders</h3>
          <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>Helpful notes for today</div>
        </div>
        {reminders.length > 0 && (
          <span style={{ padding: "4px 8px", borderRadius: 10, fontSize: 11.5, background: `${gold}22`, color: C.goldInk }}>{reminders.length}</span>
        )}
      </div>
      {reminders.length === 0 ? (
        <p style={{ color: C.textS, fontSize: 13, margin: 0, padding: 16 }}>
          {hiddenReminders > 0 ? "All of today's notes have been set aside." : "No notes for today."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {remindersShown.map((a, i) => (
            <li key={a.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderTop: i ? `1px solid ${cBr}` : "none" }}>
              <Icon name={a.icon} size={15} style={{ color: TONE[a.tone], flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ color: C.textB, fontSize: 13 }}>{a.text}</span>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{a.actions}</span>
              </div>
              {/* Set aside for this session only. The row comes back on the
                  next load if the thing it describes is still true. */}
              <button type="button" aria-label="Set this reminder aside" title="Set aside until the page is reloaded"
                onClick={() => setDismissed((prev) => new Set(prev).add(a.key))}
                style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: C.textXS, flexShrink: 0, display: "inline-flex" }}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {reminders.length > ATTENTION_SHOWN && showMore(allReminders ? "Show fewer" : `Show ${reminders.length - ATTENTION_SHOWN} more`, () => setAllReminders((v) => !v))}
      {hiddenReminders > 0 && showMore(`Bring back ${hiddenReminders} set aside`, () => setDismissed(new Set()))}
    </section>
  );

  // ── Quick tasks ────────────────────────────────────────────────────
  const quickTask = (icon: IconName, title: string, sub: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="sw-gold-hover"
      style={{ display: "flex", alignItems: "center", gap: 10, minHeight: TAP_MIN, padding: 12, borderRadius: 10, border: `1px solid ${cBr}`, background: "transparent", cursor: "pointer", textAlign: "left", minWidth: 0 }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, background: soft, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}>
        <Icon name={icon} size={15} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: C.textH, fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ display: "block", color: C.textS, fontSize: 11.5 }}>{sub}</span>
      </span>
    </button>
  );

  const quickPanel = (
    <section aria-labelledby="dash-quick" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
        <h3 id="dash-quick" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Quick tasks</h3>
        <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>Start a common task</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 16 }}>
        {quickTask("plus", "Walk-in", "Create booking", () => setOpen({ kind: "walkin" }))}
        {quickTask("cash", "Payment", "Add guest payment", () => setOpen({ kind: "paynew" }))}
        {quickTask("receipt", "Cost", "Add money spent", () => onGoTab?.("Sales"))}
        {quickTask("clipboard-check", "Facility check", "Make sure things are ready", () => onGoTab?.("Facilities"))}
      </div>
    </section>
  );

  // ── Money summary ──────────────────────────────────────────────────
  const monthName = new Date(`${today}T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const leftMonth = round2(receivedMonth - spentMonth);
  const moneyFigure = (label: string, value: string, note: ReactNode, color?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: C.textS, fontSize: 12 }}>{label}</div>
      <div style={{ color: color ?? C.textH, fontSize: mob ? 20 : 24, fontWeight: 600, marginTop: 2 }}>{value}</div>
      <div style={{ color: C.textXS, fontSize: 11.5, marginTop: 2 }}>{note}</div>
    </div>
  );
  const moneyPanel = (
    <section aria-labelledby="dash-money" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
        <Icon name="bar-chart" size={16} style={{ color: C.goldInk, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="dash-money" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Money summary</h3>
          <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>{monthName} · includes today&apos;s money</div>
        </div>
        {onGoTab && (
          <button type="button" onClick={() => onGoTab("Reports")}
            style={{ background: "none", border: "none", padding: 4, color: C.goldInk, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            View full report <Icon name="arrow-right" size={13} />
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3,minmax(0,1fr))", gap: 16, padding: 16 }}>
        {moneyFigure("Money received this month", fmt(receivedMonth), "Includes today's payments", "#2e9e4e")}
        {moneyFigure("Money spent this month", fmt(spentMonth), receivedMonth > 0 ? `${Math.round((spentMonth / receivedMonth) * 100)}% of the money received` : "No income yet this month")}
        {moneyFigure("Money left this month", fmt(leftMonth),
          leftMonth < 0 ? "More was spent than received" : "Money received is higher than money spent",
          leftMonth < 0 ? "#d44" : "#2e9e4e")}
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <BarChart data={monthChart} color={gold} formatValue={fmt} height={mob ? 130 : 170} mob={mob} />
      </div>
    </section>
  );

  // ── Search ─────────────────────────────────────────────────────────
  const needle = q.trim().toLowerCase();
  const results = needle
    ? cards.filter((c) => [c.b.name, c.b.id, c.b.contact, c.b.email ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : [];

  return (
    <div>
      {/* ── Today, and what the admin can start from here ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: C.textXS, fontSize: 11, letterSpacing: 3, margin: 0, textTransform: "uppercase" }}>
            {new Date(`${today}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
          <h1 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 26 : 34, fontWeight: 400, margin: "6px 0 0" }}>
            {adminTabLabel("Operations")}
          </h1>
          <p style={{ color: C.textS, fontSize: 13.5, margin: "6px 0 0" }}>See what needs to be done at StoneWood today.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <LiveStatus />
          <ActionButton icon="plus" onClick={() => setOpen({ kind: "walkin" })}>New walk-in</ActionButton>
          <ActionButton kind={closedToday ? "ghost" : "primary"} icon="wallet" onClick={() => openClosing()}>{closedToday ? "Day closed" : "Close the day"}</ActionButton>
        </div>
      </div>

      {statsRow}

      {!ops.loaded && ops.loading && <p style={{ color: C.textS, fontSize: 13 }}>Loading inspections and payments…</p>}

      {/* ── What to do now, and what merely to know ──
          Two lists rather than one, because a stack that mixed "a guest is
          owed a refund" with "a group arriving at six is not ticked off yet"
          made every row look equally late. */}
      {ops.loaded && (
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,1.9fr) minmax(0,1fr)", gap: 16, alignItems: "start", marginBottom: 20 }}>
          {urgentPanel}
          {reminderPanel}
        </div>
      )}

      {/* ── Today's guests: the same three stages, in one place ── */}
      <section aria-labelledby="dash-bookings" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
          <Icon name="users" size={16} style={{ color: C.goldInk, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="dash-bookings" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Guest bookings today</h3>
            <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>Check them in, check them out, and collect what is owed</div>
          </div>
          {onGoTab && (
            <button type="button" onClick={() => onGoTab("Occupancy")}
              style={{ background: "none", border: "none", padding: 4, color: C.goldInk, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Open booking calendar <Icon name="arrow-right" size={13} />
            </button>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {/* ── Find a guest ── */}
          <div style={{ position: "relative", maxWidth: 420, marginBottom: 16 }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.5, color: C.textH }} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a guest by name, booking ID or phone" aria-label="Find a guest"
              style={{ ...inp, padding: "8px 12px", paddingLeft: 32, paddingRight: q ? 36 : 12 }} />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search"
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textS, cursor: "pointer", padding: 4, display: "inline-flex" }}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {needle ? (
            <section aria-label="Search results">
              <p style={{ color: C.textS, fontSize: 13, margin: "0 0 12px" }}>
                {results.length ? `${results.length} match${results.length === 1 ? "" : "es"}` : "No match among today's work and the next two weeks. Search every booking in Bookings."}
              </p>
              {results.length > 0 && grid(results)}
            </section>
          ) : (
            <ViewSwitcherTabs<OpsView> value={view} onChange={setView} views={[
              { value: "today", label: `Today (${todayCards.length})`, content: todayPanel },
              { value: "upcoming", label: `Coming up (${upcoming.length})`, content: upcomingPanel },
              { value: "done", label: `Done today (${doneToday.length})`, content: donePanel },
              { value: "reschedule", label: `Date changes (${pendingMoves.length})`, content: reschedulePanel },
            ]} />
          )}
        </div>
      </section>

      {/* ── Start something, and the month's money ── */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,1fr) minmax(0,1.9fr)", gap: 16, alignItems: "start" }}>
        {quickPanel}
        {moneyPanel}
      </div>

      {/* ── The module tools each button opens ── */}
      {open?.kind === "move" && current && (
        <MoveBookingModal
          booking={current}
          onClose={() => setOpen(null)}
          onMoved={(b) => setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...b } : x)))}
        />
      )}
      {open?.kind === "prep" && current && <PrepModal booking={current} facilities={facilities} onClose={() => setOpen(null)} />}
      {open?.kind === "checkout" && current && (
        <CheckoutModal booking={current} facilities={facilities} mob={mob} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "settle" && current && <SettleModal booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "record" && current && <VisitRecord booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "pay" && current && <RecordPaymentModal bookings={bookings} bookingId={current.id} onClose={() => setOpen(null)} />}
      {/* Same window, no booking chosen yet: the admin picks one inside. */}
      {open?.kind === "paynew" && <RecordPaymentModal bookings={bookings} onClose={() => setOpen(null)} />}
      {open?.kind === "walkin" && (
        <WalkInModal bookings={withHolds(bookings, ops.dateChanges)} setBookings={setBookings} rooms={rooms} packages={packages} facilities={facilities} mob={mob} onClose={() => setOpen(null)} />
      )}
      {closing && (
        <Modal title="Daily liquidation" subtitle="Finish the day's bookings, then count the cash box and close the day." onClose={() => setClosing(false)} width={1000}>
          <Closing initialDate={closeDate} onAct={(action, b) => go(action, b)} />
        </Modal>
      )}

      {open?.kind === "accept" && current && (() => {
        const m = money(current);
        const pays = livePayments(ops.payments).filter((p) => p.bookingId === current.id);
        return (
          <ConfirmDialog title="Accept this booking?" description={`${current.name} · ${current.id} · ${fmtDate(current.date)}`}
            onCancel={() => setOpen(null)} cancelLabel="Go back" width={520}
            confirm={<ActionButton kind="green" onClick={() => { updateStatus(current.id, "Confirmed"); toast(`Booking accepted for ${current.name}.`, "success"); setOpen(null); }}>Accept booking</ActionButton>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* The payment check, in one place: what came in, against the total. */}
              <div style={{ background: soft, borderRadius: 10, padding: "8px 16px" }}>
                {pays.map((p) => (
                  <AmountRow key={p.id} label={`${paymentLine(p)}${p.reference ? ` · ref ${p.reference}` : ""}`} value={fmt(p.amount)} color="#2e9e4e" />
                ))}
                {pays.length === 0 && <p style={{ color: "#d4a800", fontSize: 13.5, margin: "4px 0" }}>No payment has been recorded for it yet.</p>}
                <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 4, paddingTop: 4 }}>
                  <AmountRow label="Booking total" value={fmt(current.total)} />
                  <AmountRow label="Balance due on arrival" value={fmt(m.balance)} strong />
                </div>
              </div>
              <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>
                {current.email ? `A confirmation email goes to ${current.email}.` : "This guest has no email, so no confirmation is sent."}
              </p>
            </div>
          </ConfirmDialog>
        );
      })()}
      {open?.kind === "reject" && current && <ResortCancelDialog booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "refund" && current && <RefundModal booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "charge" && current && <AddChargeModal booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "refundchoice" && current && (
        <ChooseRefundDialog booking={current} onClose={() => setOpen(null)} onDone={(nb) => setOpen({ kind: "refund", id: nb.id })} />
      )}
      {open?.kind === "textagain" && current && <TextAgain booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "datechange" && reviewing && find(reviewing.bookingId) && (
        <DateChangeReview request={reviewing} booking={find(reviewing.bookingId)!} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "noshow" && current && (
        <ConfirmDialog title="Mark as a no-show?"
          description={`${current.name} · ${current.id} · ${fmtDate(current.date)}`}
          onCancel={() => setOpen(null)} cancelLabel="Go back" width={500}
          confirm={<ActionButton kind="red" onClick={() => {
            const why = reason.trim() || "No-show: the group did not arrive.";
            // A no-show isn't emailed a rejection.
            updateStatus(current.id, "Cancelled", why, { silent: true });
            setBookings((bs) => bs.map((x) => x.id === current.id ? { ...x, cancelReason: why } : x));
            toast(`${current.name} marked as a no-show.`, "warning");
            setOpen(null);
          }}>Mark no-show</ActionButton>}>
          <div>
            <p style={{ color: C.textS, fontSize: 14, marginTop: 0 }}>
              Under the no-refund policy, what the guest paid stays recorded as income.
            </p>
            <Label htmlFor="ops-reason">Note (optional)</Label>
            <Textarea id="ops-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Didn't arrive and couldn't be reached." />
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Text a guest who hasn't answered a resort cancellation yet: the same
 *  message as the first time, with their link. */
function TextAgain({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C } = useAdminStyle();
  const ops = useOps();
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void ops.guestLink(booking.id).then((l) => { if (!live) return; if (l) setLink(l); else setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);
  const msg = link && booking.choiceDeadline
    ? notices.resortCancelled(booking, booking.cancelReason ?? "", link, booking.choiceDeadline, booking.heldAmount ?? 0).sms
    : null;
  return (
    <Modal title="Remind the guest" subtitle={`${booking.name} · ${booking.id}`} onClose={onClose} width={560}
      footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><ActionButton kind="primary" onClick={onClose}>Done</ActionButton></div>}>
      {msg ? <TextGuest booking={booking} message={msg} about="choosing a new date or a refund" />
        : <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>{failed ? "Couldn't make their link. Try again." : "Preparing the message…"}</p>}
    </Modal>
  );
}
