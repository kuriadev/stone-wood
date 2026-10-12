"use client";

/* My Tasks, for front desk: the counter and the money.
 *
 * Worked out from the bookings and the ledger, like the caretakers' list:
 *
 *   Collect & close   groups the caretaker has inspected out, with a balance
 *                     (and any damage) still to take
 *   Close the day     days whose cash moved and were never counted — front
 *                     desk counts the drawer and closes it; the owner is told
 *                     only when the count comes out short or over
 *   Arrivals          today's groups to check in, once the caretaker has
 *                     prepared their facilities
 *   Waiting to pay    walk-ins booked without a payment yet
 *   Guest messages    the inbox, to answer
 *
 * Each card has the button that does it, using the same windows as the
 * Dashboard, so nothing behaves differently from one screen to the other.
 */

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { AdminPageHeader, ActionButton, Modal, StatCard, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { SettleModal } from "@/components/admin/InspectionModals";
import { RecordPaymentModal } from "@/components/admin/RecordPaymentModal";
import { Closing } from "@/components/admin/SalesTab";
import { Icon, type IconName } from "@/components/common/Icon";
import { unclosedDays } from "@/lib/operations";
import { bookingMoney, manilaDate, livePayments, liveExpenses } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot, bookingEndDate } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import type { AdminTab } from "@/types/admin";
import type { Booking } from "@/types/booking";

type Group = "money" | "counter" | "guests";
const GROUP: Record<Group, { title: string; hint: string; color: string; stat: string }> = {
  money: { title: "Money", hint: "Balances to collect and days to close. The owner sees every peso you record.", color: "#d4a800", stat: "Money" },
  counter: { title: "At the counter", hint: "Arrivals to check in and walk-ins still to pay.", color: "#3a8fc4", stat: "Counter" },
  guests: { title: "Guests", hint: "Messages waiting for an answer.", color: "#2e9e4e", stat: "Messages" },
};

interface Task {
  key: string;
  group: Group;
  icon: IconName;
  title: string;
  meta?: string;
  detail: string;
  badge?: { text: string; color: string };
  action: React.ReactNode;
}

export function FrontDeskTasks({ mob, onGoTab }: { mob: boolean; onGoTab?: (t: AdminTab) => void }) {
  const { C, cBr, cBg } = useAdminStyle();
  const { bookings, customerMessages } = useApp();
  const ops = useOps();
  const { toast } = useToast();
  const [settling, setSettling] = useState<Booking | null>(null);
  const [paying, setPaying] = useState<Booking | null>(null);
  const [closingDay, setClosingDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = manilaDate();
  const live = bookings.filter((b) => !b.archived && !b.id.startsWith("TMP-"));
  const prepared = new Set(ops.inspections.filter((i) => i.stage === "Preparation").map((i) => i.bookingId));

  const checkIn = async (b: Booking) => {
    setBusy(b.id);
    const r = await ops.checkIn(b.id);
    setBusy(null);
    toast(r.ok ? `${b.name} checked in. ${b.guests} guest${b.guests === 1 ? "" : "s"} on site.` : r.error, r.ok ? "success" : "error");
  };

  const tasks: Task[] = [];

  // ── Money: collect & close ──
  for (const b of live.filter((x) => x.status === "Confirmed" && x.checkedOutAt)) {
    const m = bookingMoney(b, ops.payments, ops.damages);
    tasks.push({
      key: `settle-${b.id}`, group: "money", icon: "receipt",
      title: `Collect from ${b.name}`,
      meta: b.id,
      detail: m.penaltyTotal > 0
        ? `Inspected out. ${fmt(m.balance)} balance + ${fmt(m.penaltyDue)} damage still to take.`
        : m.due > 0 ? `Inspected out. ${fmt(m.due)} still to take.` : "Inspected out and fully paid — close the booking.",
      badge: m.penaltyTotal > 0 ? { text: `${fmt(m.penaltyTotal)} damage`, color: "#d44" } : m.due > 0 ? { text: fmt(m.due), color: "#d4a800" } : undefined,
      action: <ActionButton size="sm" kind="primary" icon="receipt" onClick={() => setSettling(b)}>{m.due > 0 ? `Collect ${fmt(m.due)}` : "Close booking"}</ActionButton>,
    });
  }

  // ── Money: close the day ──
  const unclosed = unclosedDays({ payments: ops.payments, expenses: ops.expenses, closings: ops.closings, today });
  for (const d of unclosed) {
    tasks.push({
      key: `close-${d}`, group: "money", icon: "wallet",
      title: `Close ${fmtDate(d)}`,
      detail: "Cash moved that day and the drawer was never counted. Count it and close the day.",
      badge: { text: "Late", color: "#d44" },
      action: <ActionButton size="sm" kind="primary" icon="wallet" onClick={() => setClosingDay(d)}>Count & close</ActionButton>,
    });
  }
  const cashToday = livePayments(ops.payments).some((p) => manilaDate(p.receivedAt) === today && p.method === "Cash")
    || liveExpenses(ops.expenses).some((e) => e.spentOn === today && e.method === "Cash");
  if (cashToday && !ops.closings.some((c) => c.closingDate === today)) {
    tasks.push({
      key: "close-today", group: "money", icon: "wallet",
      title: "Close today",
      detail: "When the last group has left and paid, count the cash box and close the day.",
      badge: { text: "Today", color: "#d4a800" },
      action: <ActionButton size="sm" icon="wallet" onClick={() => setClosingDay(today)}>Count & close</ActionButton>,
    });
  }

  // ── Counter: arrivals ──
  for (const b of live.filter((x) => x.status === "Confirmed" && !x.checkedInAt && !x.checkedOutAt && x.date <= today && today <= bookingEndDate(x))) {
    const ready = prepared.has(b.id);
    const s = SLOTS[getBookingSlot(b)];
    tasks.push({
      key: `arrive-${b.id}`, group: "counter", icon: "log-in",
      title: `Check in ${b.name}`,
      meta: `${b.id} · ${s.label} (${s.hours}) · ${b.guests} guests${b.arrivalTime ? ` · arrives ${b.arrivalTime}` : ""}`,
      detail: ready ? "The caretaker has prepared their facilities." : "Waiting for the caretaker to prepare their facilities.",
      badge: ready ? { text: "Ready", color: "#2e9e4e" } : { text: "Not prepared", color: "#d4a800" },
      action: <ActionButton size="sm" kind={ready ? "primary" : "ghost"} icon="log-in" disabled={!ready || busy === b.id}
        onClick={() => void checkIn(b)}>{busy === b.id ? "Checking in…" : "Check in"}</ActionButton>,
    });
  }

  // ── Counter: walk-ins with nothing paid ──
  for (const b of live.filter((x) => x.status === "Pending" && x.source === "Walk-In")) {
    tasks.push({
      key: `pay-${b.id}`, group: "counter", icon: "cash",
      title: `${b.name} hasn't paid yet`,
      meta: `${b.id} · ${fmtDate(b.date)}`,
      detail: `Walk-in booked without a payment. ${fmt(b.downpayment)} down payment confirms it.`,
      action: <ActionButton size="sm" kind="primary" icon="cash" onClick={() => setPaying(b)}>Record payment</ActionButton>,
    });
  }

  // ── Guests: the inbox ──
  const inbox = customerMessages.filter((m) => !m.archivedAt);
  if (inbox.length) {
    tasks.push({
      key: "inbox", group: "guests", icon: "message",
      title: `${inbox.length} guest message${inbox.length === 1 ? "" : "s"}`,
      detail: inbox.slice(0, 3).map((m) => `${m.name} (${m.type})`).join(" · ") + (inbox.length > 3 ? ` · and ${inbox.length - 3} more` : ""),
      action: <ActionButton size="sm" icon="message" onClick={() => onGoTab?.("Customer Service")}>Open messages</ActionButton>,
    });
  }

  const of = (g: Group) => tasks.filter((t) => t.group === g);

  const card = (t: Task) => {
    const g = GROUP[t.group];
    return (
      <article key={t.key} style={{ background: cBg, borderTop: `1px solid ${cBr}`, borderRight: `1px solid ${cBr}`, borderBottom: `1px solid ${cBr}`, borderLeft: `3px solid ${g.color}`, borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
            <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${g.color}1f`, color: g.color }}>
              <Icon name={t.icon} size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.textH, fontWeight: 600, fontSize: 15 }}>{t.title}</div>
              {t.meta && <div style={{ color: C.textS, fontSize: 12, marginTop: 3, overflowWrap: "anywhere" }}>{t.meta}</div>}
            </div>
          </div>
          {t.badge && <StatusBadge color={t.badge.color}>{t.badge.text}</StatusBadge>}
        </div>
        <p style={{ color: C.textB, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{t.detail}</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{t.action}</div>
      </article>
    );
  };

  return (
    <div>
      <AdminPageHeader title="My Tasks" mob={mob}
        subtitle="The counter's work: money to collect, days to close, arrivals to check in. Preparing and inspecting are the caretakers'." />

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {(Object.keys(GROUP) as Group[]).map((g) => (
          <StatCard key={g} label={GROUP[g].stat} value={of(g).length} color={of(g).length ? GROUP[g].color : undefined} />
        ))}
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: C.textS, fontSize: 13.5, margin: 0, padding: "28px 16px", border: `1px dashed ${cBr}`, borderRadius: 12, textAlign: "center" }}>
          <Icon name="check-circle" size={18} style={{ color: "#2e9e4e", verticalAlign: -4, marginRight: 8 }} />
          Nothing waiting at the counter.
        </p>
      ) : (Object.keys(GROUP) as Group[]).filter((g) => of(g).length > 0).map((g) => (
        <section key={g} aria-labelledby={`fd-${g}`} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 id={`fd-${g}`} style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>
              {GROUP[g].title} <span style={{ color: C.textS, fontWeight: 400 }}>({of(g).length})</span>
            </h2>
            <span style={{ color: C.textS, fontSize: 12.5 }}>{GROUP[g].hint}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
            {of(g).map(card)}
          </div>
        </section>
      ))}

      {settling && <SettleModal booking={settling} onClose={() => setSettling(null)} />}
      {paying && <RecordPaymentModal bookings={bookings} bookingId={paying.id} onClose={() => setPaying(null)} />}
      {closingDay && (
        <Modal title="Daily liquidation" subtitle="Finish the day's bookings, then count the cash box and close the day." onClose={() => setClosingDay(null)} width={1000}>
          <Closing initialDate={closingDay} onAct={(action, b) => {
            // Collecting is done here; the rest happens on the Dashboard.
            if (action === "settle") { setClosingDay(null); setSettling(b); return; }
            setClosingDay(null);
            toast(`Finish ${b.name}'s booking on the Dashboard first.`, "info");
            onGoTab?.("Operations");
          }} />
        </Modal>
      )}
    </div>
  );
}
