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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { opsBoard, closingBlockers, OPS_STAGES, TODAY_COLUMNS, PREPARE_HORIZON_DAYS, type OpsCard, type OpsView } from "@/lib/operations";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { bookingMoney, collectedBetween, expensesBetween, livePayments, manilaDate, manilaTime, round2, type BookingMoney } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot, holdsDate } from "@/lib/utils";
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
import { DateChangeReview } from "@/components/admin/DateChangeReview";
import { TextGuest } from "@/components/admin/TextGuest";
import { choiceOpen, fmtDeadline, holdActive, withHolds } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { Closing } from "@/components/admin/SalesTab";
import { PageHead, Btn, Pill, Modal, ConfirmDialog, Label, Line, Figure, ViewTabs, useAdminStyle } from "@/components/admin/ui";

interface OperationsTabProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  packages: ResortPackage[];
  facilities: Facility[];
  updateStatus: UpdateStatus;
  mob: boolean;
}

type Open =
  | { kind: "prep" | "checkout" | "settle" | "record" | "pay"; id: string }
  | { kind: "accept" | "reject" | "noshow" | "refund" | "textagain"; id: string }
  | { kind: "datechange"; reqId: number }
  | { kind: "walkin" };

/** Something late or about to be, for the "Needs attention" list. */
interface Attention {
  key: string;
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

export function OperationsTab({ bookings, setBookings, rooms, packages, facilities, updateStatus, mob }: OperationsTabProps) {
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
  const [allAttention, setAllAttention] = useState(false);
  // Its own flag rather than part of `open`: the closing window stays open
  // underneath while a booking on its checklist is finished on top of it.
  const [closing, setClosing] = useState(false);

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
      attention.push({ key: `late-${b.id}`, tone: "red", icon: "alert",
        text: <>{who} was due on {fmtDate(b.date)} and was never checked in. Complete the stay if they came, or mark a no-show.</>,
        actions: <>
          <Btn size="sm" kind="primary" onClick={() => go("checkout", b)}>Complete stay</Btn>
          <Btn size="sm" kind="red" onClick={() => go("noshow", b)}>No-show</Btn>
        </> });
    }
    if (c.timeUp && c.endsAt) {
      attention.push({ key: `time-${b.id}`, tone: "red", icon: "clock",
        text: <>{who}&apos;s booked time ended at {localTime(c.endsAt)}, {duration(now.getTime() - c.endsAt.getTime())} ago.</>,
        actions: <Btn size="sm" kind="primary" onClick={() => go("checkout", b)}>Check out</Btn> });
    }
    if (c.stage === "confirm" && c.view === "today") {
      attention.push({ key: `confirm-${b.id}`, tone: b.date < today ? "red" : "amber", icon: "clipboard",
        text: <>{who}&apos;s booking for {b.date === today ? "today" : fmtDate(b.date)} isn&apos;t confirmed yet.</>,
        actions: <>
          <Btn size="sm" kind="primary" onClick={() => go("accept", b)}>Review</Btn>
          <Btn size="sm" kind="red" onClick={() => go("reject", b)}>Cancel</Btn>
        </> });
    }
    if (c.stage === "arriving" && !c.overdue && !c.prepared) {
      attention.push({ key: `prep-${b.id}`, tone: "amber", icon: "clipboard-check",
        text: <>{who} arrives today, but the facilities haven&apos;t been prepared.</>,
        actions: <Btn size="sm" kind="primary" onClick={() => go("prep", b)}>Prepare</Btn> });
    }
    if (c.stage === "settle" && b.checkedOutAt && manilaDate(b.checkedOutAt) < today) {
      attention.push({ key: `settle-${b.id}`, tone: "amber", icon: "receipt",
        text: <>{who} checked out on {fmtDate(manilaDate(b.checkedOutAt))} and hasn&apos;t been settled.</>,
        actions: <Btn size="sm" kind="primary" onClick={() => go("settle", b)}>Settle</Btn> });
    }
    if (c.view === "today" && (c.column === "arriving" || c.column === "onsite")) {
      for (const f of facilitiesForBooking(b, facilities).filter((x) => x.status === "Under Maintenance")) {
        attention.push({ key: `maint-${b.id}-${f.id}`, tone: "amber", icon: "toolbox",
          text: <><strong style={{ color: C.textH }}>{f.name}</strong> is under maintenance, but {who}&apos;s booking uses it.</>,
          actions: <Btn size="sm" onClick={() => go("record", b)}>View booking</Btn> });
      }
    }
  }
  // A guest asking to move their booking: the date is held for them.
  for (const r of ops.dateChanges) {
    if (r.status !== "Pending") continue;
    const b = find(r.bookingId);
    if (!b) continue;
    const active = holdActive(r, now.getTime());
    attention.push({ key: `move-${r.id}`, tone: active ? "amber" : "red", icon: "calendar",
      text: <><strong style={{ color: C.textH }}>{b.name}</strong> asks to move {b.id} from {fmtDate(r.fromDate)} to {fmtDate(r.toDate)}.{" "}
        {active ? <>Held for them until {fmtDeadline(r.holdUntil!)}.</> : <>The 48-hour hold ran out.</>}</>,
      actions: <Btn size="sm" kind="primary" onClick={() => setOpen({ kind: "datechange", reqId: r.id })}>Review</Btn> });
  }
  // Money the resort owes back, and guests still deciding after a
  // resort cancellation. These outlive the board's date range, so they
  // read every booking.
  for (const b of bookings) {
    const who = <strong style={{ color: C.textH }}>{b.name}</strong>;
    if (b.refundStatus === "Owed") {
      attention.push({ key: `refund-${b.id}`, tone: "red", icon: "cash",
        text: <>{who} is owed a refund of {fmt(b.refundAmount ?? 0)} ({b.id}). Send it and record the reference.</>,
        actions: <Btn size="sm" kind="primary" onClick={() => go("refund", b)}>Send refund</Btn> });
    } else if (choiceOpen(b, now.getTime())) {
      attention.push({ key: `waiting-${b.id}`, tone: "blue", icon: "clock",
        text: <>{who} hasn&apos;t picked a new date or a refund yet for {b.id} (cancelled by the resort). They have until {fmtDeadline(b.choiceDeadline!)}.</>,
        actions: <Btn size="sm" onClick={() => go("textagain", b)}>Text them</Btn> });
    }
  }
  const waitingConfirm = upcoming.filter((c) => c.stage === "confirm");
  if (waitingConfirm.length > 0) {
    attention.push({ key: "confirm-upcoming", tone: "blue", icon: "info",
      text: <>{waitingConfirm.length} upcoming booking{waitingConfirm.length === 1 ? " is" : "s are"} waiting for your confirmation.</>,
      actions: <Btn size="sm" onClick={() => { setQ(""); setView("upcoming"); }}>Review</Btn> });
  }
  const rank = { red: 0, amber: 1, blue: 2 } as const;
  attention.sort((a, b) => rank[a.tone] - rank[b.tone]);
  const attentionShown = allAttention ? attention : attention.slice(0, ATTENTION_SHOWN);

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
      { label: "Settled", done: b.status === "Completed" },
    ];
    const next =
      stage === "confirm" ? "Next: check the payment, then accept"
        : stage === "prepare" ? (c.prepared ? `Ready. Next: check in on ${fmtDate(b.date)}` : "Next: prepare the facilities")
          : stage === "arriving" ? (c.overdue ? "Next: complete the stay, or mark a no-show" : "Next: check in when they arrive")
            : stage === "onsite" ? (m.due > 0 ? `Next: check out and collect ${fmt(m.due)}` : "Next: check out as they leave")
              : stage === "settle" ? (m.due > 0 ? `Next: collect ${fmt(m.due)} and settle` : "Next: settle to complete")
                : `Completed${b.settledAt ? ` at ${manilaTime(b.settledAt)}` : ""}`;

    const canPay = (stage === "confirm" || stage === "prepare" || stage === "arriving" || stage === "onsite") && m.due > 0;
    const canPrep = stage === "prepare" || stage === "arriving";

    let primary: ReactNode = null;
    let secondary: ReactNode = null;
    switch (stage) {
      case "confirm":
        primary = <Btn kind="primary" icon="check" onClick={() => go("accept", b)}>Review & accept</Btn>;
        secondary = <Btn kind="red" icon="x" onClick={() => go("reject", b)}>Cancel</Btn>;
        break;
      case "prepare":
        primary = c.prepared
          ? <Btn icon="clipboard-check" onClick={() => go("prep", b)}>View / edit preparation</Btn>
          : <Btn kind="primary" icon="clipboard-check" onClick={() => go("prep", b)}>Prepare facilities</Btn>;
        break;
      case "arriving":
        // A past date the owner never tapped through: the group most likely
        // came and went, so finishing the stay is the main button.
        if (c.overdue) {
          primary = <Btn kind="primary" icon="check" onClick={() => go("checkout", b)}>Complete stay</Btn>;
          secondary = <Btn kind="red" onClick={() => go("noshow", b)}>No-show</Btn>;
        } else {
          primary = <Btn kind="primary" icon="log-in" disabled={busy} onClick={() => checkIn(b)}>{busy ? "Checking in…" : "Check in"}</Btn>;
          secondary = !c.prepared ? <Btn icon="clipboard-check" onClick={() => go("prep", b)}>Prepare</Btn> : null;
        }
        break;
      case "onsite":
        primary = <Btn kind="primary" icon="logout" onClick={() => go("checkout", b)}>{m.due > 0 ? `Check out · ${fmt(m.due)}` : "Check out"}</Btn>;
        break;
      case "settle":
        primary = <Btn kind="primary" icon="receipt" onClick={() => go("settle", b)}>{m.due > 0 ? `Settle · ${fmt(m.due)}` : "Settle"}</Btn>;
        break;
      case "done":
        primary = <Btn icon="eye" onClick={() => go("record", b)}>View record</Btn>;
        break;
    }

    return (
      <article key={b.id} aria-label={`${b.name}, ${next}`}
        style={{ background: cBg, border: `1px solid ${c.timeUp || c.overdue ? "#d4444066" : cBr}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <button type="button" onClick={() => go("record", b)} title="Open the full reservation"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.textH, fontWeight: 600, fontSize: 15, textAlign: "left" }}>
                {b.name}
              </button>
              {fresh && <Pill color={gold}>New</Pill>}
            </div>
            <div style={{ color: C.textS, fontSize: 12, marginTop: 2 }}>
              {b.date === today ? "Today" : fmtDate(b.date)} · {slot.label} ({slot.hours}){b.arrivalTime ? ` · arrives ${b.arrivalTime}` : ""}
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
              {canPay && <DropdownMenuItem onSelect={() => go("pay", b)}><Icon name="cash" />Record a payment</DropdownMenuItem>}
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
          <div><Icon name="users" size={12} style={{ marginRight: 6, verticalAlign: -1 }} />{b.guests} guest{b.guests === 1 ? "" : "s"} · {b.package}</div>
          <div style={{ color: C.textS }}><Icon name="toolbox" size={12} style={{ marginRight: 6, verticalAlign: -1 }} />{usesText(b)}</div>
        </div>

        {/* Where it stands: five steps, and the next one in words. */}
        <div>
          <div aria-hidden style={{ display: "flex", gap: 3 }}>
            {steps.map((s) => (
              <span key={s.label} title={`${s.label}: ${s.done ? "done" : "not yet"}`}
                style={{ flex: 1, height: 4, borderRadius: 2, background: s.done ? "#2e9e4e" : cBr }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, fontSize: 12, color: C.textB }}>
            <span>{next}</span>
            <span style={{ color: C.textS, whiteSpace: "nowrap" }}>{steps.filter((s) => s.done).length} of 5</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {stage === "confirm" && (m.paid > 0
            ? <Pill color="#2e9e4e">{fmt(m.paid)} paid</Pill>
            : <Pill color="#d4a800">No payment yet</Pill>)}
          {stage === "prepare" && (c.prepared
            ? <Pill color="#2e9e4e"><Icon name="check" size={11} />Ready</Pill>
            : <Pill color="#d4a800">Not prepared</Pill>)}
          {stage === "arriving" && !c.prepared && <Pill color="#d4a800">Not prepared</Pill>}
          {c.overdue && <Pill color="#d44">Was due {fmtDate(b.date)}</Pill>}
          {stage === "onsite" && b.checkedInAt && <Pill color="#2e9e4e">In since {manilaTime(b.checkedInAt)}</Pill>}
          {stage === "onsite" && c.endsAt && (c.timeUp
            ? <Pill color="#d44">Time&apos;s up · {duration(now.getTime() - c.endsAt.getTime())} over</Pill>
            : <Pill color={C.textS}>Until {localTime(c.endsAt)}</Pill>)}
          {(stage === "arriving" || stage === "onsite" || stage === "settle") && (m.due > 0
            ? <Pill color="#d4a800">{fmt(m.due)} to collect</Pill>
            : <Pill color="#2e9e4e">Fully paid</Pill>)}
          {stage === "done" && (m.due > 0 ? <Pill color="#d4a800">{fmt(m.due)} unpaid</Pill> : <Pill color="#4a9fd4">Settled</Pill>)}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
    <p style={{ color: C.textS, fontSize: 13.5, margin: 0, padding: "22px 16px", border: `1px dashed ${cBr}`, borderRadius: 10, textAlign: "center" }}>{text}</p>
  );

  // ── End of day: daily liquidation ──────────────────────────────────
  const endOfDay = (
    <section style={{ marginTop: 28, background: soft, borderRadius: 12, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div>
        <div style={{ color: C.textH, fontWeight: 600, fontSize: 15 }}>End of day</div>
        <div style={{ color: C.textS, fontSize: 13, marginTop: 3 }}>
          {fmt(collectedToday)} received − {fmt(spentToday)} spent = <strong style={{ color: C.textH }}>{fmt(round2(collectedToday - spentToday))}</strong> net today.
          {closedToday
            ? ` Closed at ${manilaTime(closedToday.closedAt)}.`
            : toFinish > 0
              ? ` ${toFinish} booking${toFinish === 1 ? "" : "s"} to finish before the day can be closed.`
              : " Every booking is finished. Ready to close."}
        </div>
      </div>
      <Btn kind={closedToday || toFinish > 0 ? "ghost" : "primary"} icon="wallet" onClick={() => setClosing(true)}>
        {closedToday ? "View closing" : toFinish > 0 ? `Close the day · ${toFinish} to finish` : "Count cash & close the day"}
      </Btn>
    </section>
  );

  // ── Views ──────────────────────────────────────────────────────────
  const todayPanel = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fit,minmax(290px,1fr))", gap: 16, alignItems: "start" }}>
        {TODAY_COLUMNS.map((col) => {
          const list = todayCards.filter((c) => c.column === col.id);
          return (
            <section key={col.id} aria-labelledby={`ops-col-${col.id}`} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ borderBottom: `2px solid ${col.color}55`, paddingBottom: 8 }}>
                <h3 id={`ops-col-${col.id}`} style={{ color: C.textH, fontSize: 15.5, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.color }} />{col.label}
                  <span style={{ color: C.textS, fontWeight: 400 }}>({list.length})</span>
                </h3>
                <div style={{ color: C.textS, fontSize: 12.5, marginTop: 3 }}>{col.hint}</div>
              </div>
              {list.length === 0 ? emptyNote(col.empty) : list.map(card)}
            </section>
          );
        })}
      </div>
      {todayCards.length === 0 && (
        <p style={{ color: C.textS, fontSize: 13.5, margin: "14px 0 0" }}>
          No groups today.{upcoming.length > 0 && <> {" "}
            <button type="button" onClick={() => setView("upcoming")} style={{ background: "none", border: "none", padding: 0, color: gold, cursor: "pointer", fontSize: 13.5 }}>
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
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <h3 id={`ops-day-${d}`} style={{ color: C.textH, fontSize: 15.5, fontWeight: 600, margin: 0 }}>{dayHeading(d, today)}</h3>
                    <span style={{ color: summary === "All ready" ? "#2e9e4e" : C.textS, fontSize: 12.5 }}>{summary}</span>
                  </div>
                  {grid(list)}
                </section>
              );
            })}
          </div>
        )}
      <p style={{ color: C.textS, fontSize: 12.5, margin: "18px 0 0" }}>
        Shows every booking still waiting for confirmation, and confirmed bookings for the next {PREPARE_HORIZON_DAYS} days. All bookings are in Bookings.
      </p>
    </>
  );

  const donePanel = (
    <>
      {doneToday.length === 0 ? emptyNote("Nothing settled yet today.") : grid(doneToday)}
      {endOfDay}
    </>
  );

  // ── Search ─────────────────────────────────────────────────────────
  const needle = q.trim().toLowerCase();
  const results = needle
    ? cards.filter((c) => [c.b.name, c.b.id, c.b.contact, c.b.email ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : [];

  return (
    <div>
      <PageHead title="Daily Operations" mob={mob}
        subtitle={new Date(`${today}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <LiveStatus />
            <Btn icon="plus" onClick={() => setOpen({ kind: "walkin" })}>New walk-in</Btn>
            <Btn kind={closedToday ? "ghost" : "primary"} icon="wallet" onClick={() => setClosing(true)}>{closedToday ? "Day closed" : "Close the day"}</Btn>
          </div>
        } />

      {/* ── At a glance ── */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
        <Figure label="Still to arrive today" value={dueToday.length - arrivedToday}
          note={dueToday.length ? `${arrivedToday} of ${dueToday.length} group${dueToday.length === 1 ? "" : "s"} checked in` : "No bookings today"} />
        <Figure label="On site now" value={onSite.length} color={onSite.length ? "#2e9e4e" : undefined}
          note={`${headcount} guest${headcount === 1 ? "" : "s"}`} />
        <Figure label="To settle" value={toSettle.length} color={toSettle.length ? "#e07a3a" : undefined}
          note={toSettle.length ? `${fmt(toSettleDue)} to collect` : "Nothing waiting"} />
        <Figure label="Collected today" value={fmt(collectedToday)}
          note={closedToday ? `Day closed at ${manilaTime(closedToday.closedAt)}` : `${fmt(spentToday)} spent`} />
      </div>

      {!ops.loaded && ops.loading && <p style={{ color: C.textS, fontSize: 13 }}>Loading inspections and payments…</p>}

      {/* ── Needs attention ── */}
      {ops.loaded && (attention.length === 0 ? (
        <p style={{ display: "flex", alignItems: "center", gap: 8, color: "#2e9e4e", fontSize: 13.5, margin: "0 0 22px", padding: "11px 14px", borderRadius: 10, background: "rgba(46,158,78,0.08)" }}>
          <Icon name="check-circle" size={16} />All caught up. Nothing needs your attention right now.
        </p>
      ) : (
        <section aria-labelledby="ops-attention" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, marginBottom: 22, overflow: "hidden" }}>
          <h3 id="ops-attention" style={{ margin: 0, padding: "12px 16px", fontSize: 14.5, fontWeight: 600, color: C.textH, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${cBr}` }}>
            <Icon name="alert" size={15} style={{ color: TONE[attention[0].tone] }} />
            Needs your attention
            <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 12, background: `${TONE[attention[0].tone]}22`, color: TONE[attention[0].tone] }}>{attention.length}</span>
          </h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {attentionShown.map((a, i) => (
              <li key={a.key} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", borderTop: i ? `1px solid ${cBr}` : "none", borderLeft: `3px solid ${TONE[a.tone]}` }}>
                <Icon name={a.icon} size={15} style={{ color: TONE[a.tone], flexShrink: 0 }} />
                <span style={{ flex: "1 1 240px", color: C.textB, fontSize: 13.5 }}>{a.text}</span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{a.actions}</span>
              </li>
            ))}
          </ul>
          {attention.length > ATTENTION_SHOWN && (
            <button type="button" onClick={() => setAllAttention((v) => !v)}
              style={{ width: "100%", padding: "9px", border: "none", borderTop: `1px solid ${cBr}`, background: soft, color: C.textB, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {allAttention ? "Show fewer" : `Show ${attention.length - ATTENTION_SHOWN} more`}
            </button>
          )}
        </section>
      ))}

      {/* ── Find a guest ── */}
      <div style={{ position: "relative", maxWidth: 420, marginBottom: 16 }}>
        <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.5, color: C.textH }} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a guest by name, booking ID or phone" aria-label="Find a guest"
          style={{ ...inp, padding: "8px 10px", paddingLeft: 32, paddingRight: q ? 34 : 10 }} />
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
        <ViewTabs<OpsView> value={view} onChange={setView} views={[
          { value: "today", label: `Today (${todayCards.length})`, content: todayPanel },
          { value: "upcoming", label: `Coming up (${upcoming.length})`, content: upcomingPanel },
          { value: "done", label: `Done today (${doneToday.length})`, content: donePanel },
        ]} />
      )}

      {/* ── The module tools each button opens ── */}
      {open?.kind === "prep" && current && <PrepModal booking={current} facilities={facilities} onClose={() => setOpen(null)} />}
      {open?.kind === "checkout" && current && (
        <CheckoutModal booking={current} facilities={facilities} mob={mob} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "settle" && current && <SettleModal booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "record" && current && <VisitRecord booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "pay" && current && <RecordPaymentModal bookings={bookings} bookingId={current.id} onClose={() => setOpen(null)} />}
      {open?.kind === "walkin" && (
        <WalkInModal bookings={withHolds(bookings, ops.dateChanges)} setBookings={setBookings} rooms={rooms} packages={packages} facilities={facilities} mob={mob} onClose={() => setOpen(null)} />
      )}
      {closing && (
        <Modal title="Daily liquidation" subtitle="Finish the day's bookings, then count the cash drawer and close the day." onClose={() => setClosing(false)} width={1000}>
          <Closing onAct={(action, b) => go(action, b)} />
        </Modal>
      )}

      {open?.kind === "accept" && current && (() => {
        const m = money(current);
        const pays = livePayments(ops.payments).filter((p) => p.bookingId === current.id);
        return (
          <ConfirmDialog title="Accept this booking?" description={`${current.name} · ${current.id} · ${fmtDate(current.date)}`}
            onCancel={() => setOpen(null)} cancelLabel="Go back" width={520}
            confirm={<Btn kind="green" onClick={() => { updateStatus(current.id, "Confirmed"); toast(`Booking accepted for ${current.name}.`, "success"); setOpen(null); }}>Accept booking</Btn>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* The payment check, in one place: what came in, against the total. */}
              <div style={{ background: soft, borderRadius: 10, padding: "8px 14px" }}>
                {pays.map((p) => (
                  <Line key={p.id} label={`${p.type} · ${p.method}${p.reference ? ` · ref ${p.reference}` : ""}`} value={fmt(p.amount)} color="#2e9e4e" />
                ))}
                {pays.length === 0 && <p style={{ color: "#d4a800", fontSize: 13.5, margin: "4px 0" }}>No payment has been recorded for it yet.</p>}
                <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 4, paddingTop: 2 }}>
                  <Line label="Booking total" value={fmt(current.total)} />
                  <Line label="Balance due on arrival" value={fmt(m.balance)} strong />
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
      {open?.kind === "textagain" && current && <TextAgain booking={current} onClose={() => setOpen(null)} />}
      {open?.kind === "datechange" && reviewing && find(reviewing.bookingId) && (
        <DateChangeReview request={reviewing} booking={find(reviewing.bookingId)!} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "noshow" && current && (
        <ConfirmDialog title="Mark as a no-show?"
          description={`${current.name} · ${current.id} · ${fmtDate(current.date)}`}
          onCancel={() => setOpen(null)} cancelLabel="Go back" width={500}
          confirm={<Btn kind="red" onClick={() => {
            const why = reason.trim() || "No-show: the group did not arrive.";
            // A no-show isn't emailed a rejection.
            updateStatus(current.id, "Cancelled", why, { silent: true });
            setBookings((bs) => bs.map((x) => x.id === current.id ? { ...x, cancelReason: why } : x));
            toast(`${current.name} marked as a no-show.`, "warning");
            setOpen(null);
          }}>Mark no-show</Btn>}>
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
      footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><Btn kind="primary" onClick={onClose}>Done</Btn></div>}>
      {msg ? <TextGuest booking={booking} message={msg} about="choosing a new date or a refund" />
        : <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>{failed ? "Couldn't make their link. Try again." : "Preparing the message…"}</p>}
    </Modal>
  );
}
