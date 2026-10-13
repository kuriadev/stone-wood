"use client";

/* My Tasks, for the owner: only what is the owner's to do.
 *
 * Preparing, inspecting, cleaning and upkeep are the caretakers' list, and
 * the counter is front desk's. What only the owner can settle is collected
 * here instead:
 *
 *   Approvals   front desk's requests (refunds, voids, cancellations,
 *               removals) and guests' reschedules
 *   Money       refunds owed, days whose cash was never counted, counts
 *               that came out short or over (opened in CashCountReview),
 *               online bookings held for review, resort-cancelled guests
 *               whose time to choose ran out
 *   Supplies    what is at or under its minimum, and counts gone negative
 *
 * Each card has the one button that settles it. When nothing is waiting,
 * the screen says so — the work of the day is on the Dashboard.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { AdminPageHeader, ActionButton, ConfirmDialog, Label, StatCard, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { DateChangeReview } from "@/components/admin/DateChangeReview";
import { RefundModal } from "@/components/admin/RefundModal";
import { CashCountReview } from "@/components/admin/CashCountReview";
import { Textarea } from "@/components/ui/textarea";
import { Icon, type IconName } from "@/components/common/Icon";
import { lowStock, unclosedDays } from "@/lib/operations";
import { choiceExpired } from "@/lib/rebooking";
import { bookingMoney, manilaDate, manilaTime } from "@/lib/finance";
import { fmt, fmtDate } from "@/lib/utils";
import type { AdminTab, OwnerRequest } from "@/types/admin";
import type { Booking } from "@/types/booking";
import type { Activity, DailyClosing, DateChange } from "@/types/finance";

type Group = "approvals" | "money" | "supplies";
const GROUP: Record<Group, { title: string; hint: string; color: string; stat: string }> = {
  approvals: { title: "Approvals", hint: "Front desk's requests and guests' new dates. Nothing happens until you answer.", color: "#e0a020", stat: "To approve" },
  money: { title: "Money", hint: "Refunds to send, cash counts that were off, bookings to check.", color: "#d44", stat: "Money" },
  supplies: { title: "Supplies", hint: "At or under the minimum you set.", color: "#4a9fd4", stat: "Supplies" },
};

interface OwnerTask {
  key: string;
  group: Group;
  icon: IconName;
  title: string;
  detail: string;
  meta?: string;
  badge?: { text: string; color: string };
  actions: React.ReactNode;
}

export function OwnerTasks({ mob, onGoTab, onOpenBooking }: {
  mob: boolean;
  onGoTab?: (t: AdminTab) => void;
  onOpenBooking?: (id: string) => void;
}) {
  const { C, cBr, cBg, inp } = useAdminStyle();
  const { bookings, inventory } = useApp();
  const ops = useOps();
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [declining, setDeclining] = useState<OwnerRequest | null>(null);
  /* Approving carries out a refund, a void or a cancellation, so it asks. */
  const [approving, setApproving] = useState<OwnerRequest | null>(null);
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState<DateChange | null>(null);
  const [refunding, setRefunding] = useState<Booking | null>(null);
  const [counting, setCounting] = useState<DailyClosing | null>(null);
  /* The daily-closing lines of the activity log: who closed each day, and
     which differences the owner already looked into and accepted. Null
     until loaded, so a count already accepted doesn't flash up first. */
  const [dayLog, setDayLog] = useState<Activity[] | null>(null);
  const loadDayLog = useCallback(async () => {
    try {
      const json = (await (await fetch("/api/activity?category=day&limit=200")).json()) as { success?: boolean; activity?: Activity[] };
      setDayLog(json.success ? json.activity ?? [] : []);
    } catch { setDayLog([]); }
  }, []);
  const closingsKey = ops.closings.map((c) => c.closedAt).join();
  useEffect(() => { void loadDayLog(); }, [loadDayLog, closingsKey]);
  // Newest first, so the first line found is the latest closing.
  const closedBy = (date: string) => dayLog?.find((a) => a.action === "day.closed" && a.entityId === date)?.staffName;
  const today = manilaDate();
  const now = Date.now();
  const find = (id: string | null) => bookings.find((b) => b.id === id);

  const approve = async (r: OwnerRequest) => {
    setBusy(r.id);
    const res = await ops.decideRequest(r.id, true, "");
    setBusy(null);
    toast(res.ok ? `Done: ${r.summary}` : res.error, res.ok ? "success" : "error");
  };

  const tasks: OwnerTask[] = [];

  // ── Approvals ──
  for (const r of ops.requests.filter((x) => x.status === "Pending")) {
    tasks.push({
      key: `req-${r.id}`, group: "approvals", icon: "handshake",
      title: r.label,
      detail: r.summary,
      meta: `${r.requestedByName} · ${manilaTime(r.requestedAt)}${r.reason ? ` · "${r.reason}"` : ""}`,
      badge: r.lastError ? { text: "Last try failed", color: "#d44" } : undefined,
      actions: <>
        <ActionButton size="sm" disabled={busy === r.id} onClick={() => { setDeclining(r); setNote(""); }}>Decline</ActionButton>
        <ActionButton size="sm" kind="primary" icon="check" disabled={busy === r.id} onClick={() => setApproving(r)}>{busy === r.id ? "Working…" : "Approve"}</ActionButton>
      </>,
    });
  }
  for (const r of ops.dateChanges.filter((x) => x.status === "Pending")) {
    const b = find(r.bookingId);
    if (!b) continue;
    tasks.push({
      key: `dc-${r.id}`, group: "approvals", icon: "calendar",
      title: `New date for ${b.name}`,
      detail: `${fmtDate(r.fromDate)} → ${fmtDate(r.toDate)}`,
      meta: b.id,
      actions: <ActionButton size="sm" kind="primary" onClick={() => setReviewing(r)}>Review</ActionButton>,
    });
  }

  // ── Money ──
  for (const b of bookings.filter((x) => x.refundStatus === "Owed")) {
    const owed = b.refundAmount ?? 0;
    tasks.push({
      key: `refund-${b.id}`, group: "money", icon: "cash",
      title: `Refund ${b.name}`,
      detail: `${fmt(owed)} owed after the resort cancelled.`,
      meta: b.id,
      badge: { text: fmt(owed), color: "#d44" },
      actions: <ActionButton size="sm" kind="primary" onClick={() => setRefunding(b)}>Send refund</ActionButton>,
    });
  }
  const picked = new Set(ops.dateChanges.filter((r) => r.status === "Pending").map((r) => r.bookingId));
  for (const b of bookings.filter((x) => choiceExpired(x, picked.has(x.id), now))) {
    tasks.push({
      key: `expired-${b.id}`, group: "money", icon: "clock",
      title: `${b.name} didn't choose a new date`,
      detail: (b.heldAmount ?? 0) > 0 ? `${fmt(b.heldAmount ?? 0)} is still held for them. Agree a date or a refund with them.` : "Agree a new date with them, or close it.",
      meta: b.id,
      actions: <ActionButton size="sm" onClick={() => onGoTab?.("Operations")}>Open on the Dashboard</ActionButton>,
    });
  }
  const unclosed = unclosedDays({ payments: ops.payments, expenses: ops.expenses, closings: ops.closings, today });
  if (unclosed.length) {
    tasks.push({
      key: "unclosed", group: "money", icon: "wallet",
      title: unclosed.length === 1 ? `${fmtDate(unclosed[0])} wasn't closed` : `${unclosed.length} days weren't closed`,
      detail: "Count the cash box so the records match the money in it.",
      meta: unclosed.length > 1 ? unclosed.map((d) => fmtDate(d)).join(", ") : undefined,
      badge: { text: unclosed.length > 1 ? "Late" : "Yesterday", color: unclosed.length > 1 ? "#d44" : "#d4a800" },
      actions: <ActionButton size="sm" kind="primary" onClick={() => onGoTab?.("Operations")}>Close it on the Dashboard</ActionButton>,
    });
  }
  // A day closed with the box short or over: the owner's to look into. It
  // stays until the count is corrected or the owner accepts the difference
  // (CashCountReview); after two weeks it is history in Sales.
  const since = Date.now() - 14 * 86_400_000;
  const accepted = (c: DailyClosing) => !!dayLog?.some((a) =>
    a.action === "day.count_reviewed" && a.entityId === c.closingDate && Date.parse(a.at) >= Date.parse(c.closedAt));
  for (const c of dayLog === null ? [] : ops.closings.filter((x) => x.difference !== 0 && Date.parse(x.closedAt) >= since && !accepted(x))) {
    const short = c.difference < 0;
    const by = closedBy(c.closingDate);
    tasks.push({
      key: `count-${c.closingDate}`, group: "money", icon: "wallet",
      title: `${fmtDate(c.closingDate)}: cash ${short ? "short" : "over"} by ${fmt(Math.abs(c.difference))}`,
      meta: `${by ? `Closed by ${by}` : "Closed"} · ${manilaTime(c.closedAt)}`,
      detail: short
        ? `${fmt(c.countedCash)} was counted, but the records say ${fmt(c.expectedCash)} should be in the box. Usually something paid out without a record, or a payment recorded as cash that wasn't.${c.notes ? ` Their note: ${c.notes}` : ""}`
        : `${fmt(c.countedCash)} was counted, but the records say only ${fmt(c.expectedCash)} should be in the box. Usually a cash payment that wasn't recorded, or an opening float left out.${c.notes ? ` Their note: ${c.notes}` : ""}`,
      badge: { text: short ? "Short" : "Over", color: short ? "#d44" : "#d4a800" },
      actions: <ActionButton size="sm" kind="primary" icon="search" onClick={() => setCounting(c)}>Review the count</ActionButton>,
    });
  }

  // Online bookings the system held instead of confirming: the date was
  // taken while the guest paid, or the amount was wrong.
  for (const b of bookings.filter((x) => x.status === "Pending" && (x.source ?? "Online") === "Online" && /⚠ CHECK/.test(x.notes ?? "") && !x.archived)) {
    const m = bookingMoney(b, ops.payments, ops.damages);
    tasks.push({
      key: `held-${b.id}`, group: "money", icon: "shield-alert",
      title: `Check ${b.name}'s online booking`,
      detail: (b.notes ?? "").split("⚠ CHECK:").slice(1).map((x) => x.trim()).join(" ") || "Held for your review.",
      meta: `${b.id} · ${fmtDate(b.date)} · ${fmt(m.paid)} paid`,
      actions: <ActionButton size="sm" kind="primary" onClick={() => onOpenBooking?.(b.id)}>Open booking</ActionButton>,
    });
  }

  // ── Supplies ──
  const low = lowStock(inventory);
  if (low.length) {
    tasks.push({
      key: "low", group: "supplies", icon: "package",
      title: `Buy more: ${low.length} item${low.length === 1 ? "" : "s"}`,
      detail: low.slice(0, 4).map((i) => `${i.name} (${i.qty} ${i.unit} left, minimum ${i.minQty})`).join(" · ") + (low.length > 4 ? ` · and ${low.length - 4} more` : ""),
      actions: <ActionButton size="sm" onClick={() => onGoTab?.("Inventory")}>Open Supplies</ActionButton>,
    });
  }
  const negative = inventory.filter((i) => !i.deletedAt && i.qty < 0);
  if (negative.length) {
    tasks.push({
      key: "count", group: "supplies", icon: "refresh",
      title: `Count ${negative.length} item${negative.length === 1 ? "" : "s"}`,
      detail: `More was used than the records show: ${negative.map((i) => i.name).join(", ")}.`,
      actions: <ActionButton size="sm" onClick={() => onGoTab?.("Inventory")}>Open Supplies</ActionButton>,
    });
  }

  const of = (g: Group) => tasks.filter((t) => t.group === g);

  const card = (t: OwnerTask) => {
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{t.actions}</div>
      </article>
    );
  };

  return (
    <div>
      <AdminPageHeader title="My Tasks" mob={mob}
        subtitle="What only you can settle. Preparing and cleaning are on the caretakers' lists; today's arrivals and payments are on the Dashboard." />

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {(Object.keys(GROUP) as Group[]).map((g) => (
          <StatCard key={g} label={GROUP[g].stat} value={of(g).length} color={of(g).length ? GROUP[g].color : undefined} />
        ))}
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: C.textS, fontSize: 13.5, margin: 0, padding: "28px 16px", border: `1px dashed ${cBr}`, borderRadius: 12, textAlign: "center" }}>
          <Icon name="check-circle" size={18} style={{ color: "#2e9e4e", verticalAlign: -4, marginRight: 8 }} />
          Nothing is waiting on you.
        </p>
      ) : (Object.keys(GROUP) as Group[]).filter((g) => of(g).length > 0).map((g) => (
        <section key={g} aria-labelledby={`owner-${g}`} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 id={`owner-${g}`} style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>
              {GROUP[g].title} <span style={{ color: C.textS, fontWeight: 400 }}>({of(g).length})</span>
            </h2>
            <span style={{ color: C.textS, fontSize: 12.5 }}>{GROUP[g].hint}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
            {of(g).map(card)}
          </div>
        </section>
      ))}

      {approving && (
        <ConfirmDialog title="Approve this request?" description={approving.summary} onCancel={() => setApproving(null)} cancelLabel="Go back"
          confirm={<ActionButton kind="primary" icon="check" disabled={busy === approving.id} onClick={() => { const r = approving; setApproving(null); void approve(r); }}>Approve</ActionButton>}>
          <p style={{ color: C.textS, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            It happens right away, exactly as if you had pressed the button yourself.
          </p>
        </ConfirmDialog>
      )}
      {declining && (
        <ConfirmDialog title="Decline this request?" description={declining.summary} onCancel={() => setDeclining(null)}
          confirm={
            <ActionButton kind="red" disabled={busy === declining.id} onClick={async () => {
              setBusy(declining.id);
              const res = await ops.decideRequest(declining.id, false, note.trim());
              setBusy(null);
              if (res.ok) { toast(note.trim() ? "Declined. They'll see your note." : "Declined.", "info"); setDeclining(null); }
              else toast(res.error, "error");
            }}>Decline</ActionButton>
          }>
          <div>
            <Label htmlFor="owner-decline">Why? (optional — they see this)</Label>
            <Textarea id="owner-decline" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, width: "100%" }} />
          </div>
        </ConfirmDialog>
      )}
      {reviewing && find(reviewing.bookingId) && (
        <DateChangeReview request={reviewing} booking={find(reviewing.bookingId)!} onClose={() => setReviewing(null)} />
      )}
      {refunding && <RefundModal booking={refunding} onClose={() => setRefunding(null)} />}
      {counting && (
        <CashCountReview closing={counting} closedBy={closedBy(counting.closingDate)}
          onClose={() => setCounting(null)} onReviewed={() => void loadDayLog()}
          onOpenBooking={onOpenBooking ? (id) => { setCounting(null); onOpenBooking(id); } : undefined} />
      )}
    </div>
  );
}
