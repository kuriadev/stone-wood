"use client";

// ── Sales (capstone objective 1)
//
// The day-to-day money screen. Every figure here comes from the payments
// ledger — money actually received — never from booking totals. Reports
// reads the same ledger for printed/exported summaries.
//
//   Transactions   every payment, filterable, voidable with a reason
//   Receivables    bookings that still owe a balance or a penalty
//   Clients        each guest's bookings, what they paid, what they owe
//   Expenses       money going out
//   Daily closing  end-of-day liquidation: cash count vs. expected, and
//                  the day's income minus expenses

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import {
  bookingMoney, collectedBetween, expensesBetween, manilaDate, manilaTime, monthRange,
  livePayments, liveExpenses, signedAmount, clientKey, round2, downloadCsv,
} from "@/lib/finance";
import { fmt, fmtDate } from "@/lib/utils";
import { EXPENSE_CATEGORIES, MANUAL_METHODS, PAYMENT_TYPES, PAYMENT_METHODS, type Payment, type Expense } from "@/types/finance";
import type { Booking } from "@/types/booking";
import { gold } from "@/lib/styles";
import { RecordPaymentModal } from "@/components/admin/RecordPaymentModal";
import {
  PageHead, Figure, Segmented, TableShell, td, Btn, Pill, Modal, Label, Line, ErrorNote,
  useAdminStyle, Row, Cell, STATUS_COLOR, FullSelect, ViewTabs, ConfirmDialog,
} from "@/components/admin/ui";

type View = "Transactions" | "Receivables" | "Clients" | "Expenses" | "Closing";

const TYPE_COLOR: Record<string, string> = {
  Downpayment: "#d4a800", Balance: "#2e9e4e", Full: "#2e9e4e", Penalty: "#d44", Refund: "#8a7a66",
};

export function SalesTab({ bookings, mob }: { bookings: Booking[]; mob: boolean }) {
  const ops = useOps();
  const today = manilaDate();
  const month = monthRange(today);
  const [view, setView] = useState<View>("Transactions");
  const [payFor, setPayFor] = useState<{ bookingId?: string } | null>(null);
  const [addExpense, setAddExpense] = useState(false);

  const collectedToday = collectedBetween(ops.payments, today);
  const collectedMonth = collectedBetween(ops.payments, month.from, month.to);
  const spentMonth = expensesBetween(ops.expenses, month.from, month.to);
  const receivables = useMemo(
    () => bookings.map((b) => ({ b, m: bookingMoney(b, ops.payments, ops.damages) })).filter(({ m }) => m.due > 0),
    [bookings, ops.payments, ops.damages],
  );
  const owed = round2(receivables.reduce((s, r) => s + r.m.due, 0));
  const todayCount = livePayments(ops.payments).filter((p) => manilaDate(p.receivedAt) === today).length;

  return (
    <div>
      <PageHead
        title="Sales"
        subtitle="Money actually received and spent, from the payment records."
        mob={mob}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn icon="minus" onClick={() => setAddExpense(true)}>Add expense</Btn>
            <Btn kind="primary" icon="plus" onClick={() => setPayFor({})}>Record payment</Btn>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        <Figure label="Collected today" value={fmt(collectedToday)} note={`${todayCount} payment${todayCount === 1 ? "" : "s"}`} color="#2e9e4e" />
        <Figure label="Collected this month" value={fmt(collectedMonth)} note={new Date(today).toLocaleString("en-PH", { month: "long", year: "numeric" })} />
        <Figure label="Net income this month" value={fmt(round2(collectedMonth - spentMonth))} note={`after ${fmt(spentMonth)} in expenses`} color={collectedMonth - spentMonth < 0 ? "#d44" : gold} />
        <Figure label="Still to collect" value={fmt(owed)} note={`${receivables.length} booking${receivables.length === 1 ? "" : "s"} with a balance or penalty`} color={owed > 0 ? "#d4a800" : undefined} />
      </div>

      {!ops.loaded && ops.loading && <p style={{ color: "#8a7a66", fontSize: 13 }}>Loading payment records…</p>}

      <ViewTabs<View> value={view} onChange={setView} views={[
        { value: "Transactions", label: "Transactions", content: <Transactions payments={ops.payments} /> },
        { value: "Receivables", label: `Receivables (${receivables.length})`, content: <Receivables rows={receivables} onPay={(id) => setPayFor({ bookingId: id })} /> },
        { value: "Clients", label: "Clients", content: <Clients bookings={bookings} /> },
        { value: "Expenses", label: "Expenses", content: <Expenses expenses={ops.expenses} onAdd={() => setAddExpense(true)} /> },
        { value: "Closing", label: "Daily closing", content: <Closing /> },
      ]} />

      {payFor && <RecordPaymentModal bookings={bookings} bookingId={payFor.bookingId} onClose={() => setPayFor(null)} />}
      {addExpense && <ExpenseModal onClose={() => setAddExpense(false)} />}
    </div>
  );
}

// ── Transactions ──────────────────────────────────────────────────────
function Transactions({ payments }: { payments: Payment[] }) {
  const { C, rowBg, inp } = useAdminStyle();
  const month = monthRange(manilaDate());
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [type, setType] = useState("All");
  const [method, setMethod] = useState("All");
  const [q, setQ] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  const rows = payments.filter((p) => {
    const d = manilaDate(p.receivedAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (type !== "All" && p.type !== type) return false;
    if (method !== "All" && p.method !== method) return false;
    if (!showVoided && p.voided) return false;
    const s = q.toLowerCase().trim();
    return !s || p.guestName.toLowerCase().includes(s) || (p.bookingId ?? "").toLowerCase().includes(s) || p.reference.toLowerCase().includes(s);
  });
  const net = round2(rows.filter((p) => !p.voided).reduce((s, p) => s + signedAmount(p), 0));

  const exportCsv = () => downloadCsv(`StoneWood_Transactions_${from}_to_${to}.csv`, [
    ["Date", "Time", "Booking", "Guest", "Type", "Method", "Reference", "Amount (PHP)", "Voided", "Void reason", "Notes"],
    ...rows.map((p) => [manilaDate(p.receivedAt), manilaTime(p.receivedAt), p.bookingId ?? "", p.guestName, p.type, p.method, p.reference,
      signedAmount(p), p.voided ? "Yes" : "No", p.voidReason ?? "", p.notes]),
    [],
    ["", "", "", "", "", "", "Net total", net],
  ]);

  const sel = { ...inp, padding: "8px 10px", width: "auto" } as const;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" style={sel} />
        <span style={{ color: C.textS, fontSize: 13 }}>to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" style={sel} />
        <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" style={sel}>
          <option>All</option>{PAYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </NativeSelect>
        <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method" style={sel}>
          <option>All</option>{PAYMENT_METHODS.map((t) => <option key={t}>{t}</option>)}
        </NativeSelect>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guest, booking or reference" style={{ ...sel, minWidth: 200, flex: 1 }} />
        <label style={{ color: C.textS, fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <Checkbox checked={showVoided} onCheckedChange={(v) => setShowVoided(v === true)} /> Show voided
        </label>
        <Btn size="sm" icon="download" onClick={exportCsv}>Export</Btn>
      </div>

      <TableShell head={["Date", "Booking", "Guest", "Type", "Method", "Reference", "Amount", ""]} minWidth={860}
        empty={rows.length === 0 ? "No payments in this range." : undefined}>
        {rows.map((p, i) => (
          <Row key={p.id} style={{ background: rowBg(i), opacity: p.voided ? 0.5 : 1 }}>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(manilaDate(p.receivedAt))}<div style={{ color: C.textS, fontSize: 11.5 }}>{manilaTime(p.receivedAt)}</div></Cell>
            <Cell style={{ ...td, color: gold, fontFamily: "monospace" }}>{p.bookingId ?? "—"}</Cell>
            <Cell style={{ ...td, color: C.textH }}>{p.guestName}</Cell>
            <Cell style={td}><Pill color={TYPE_COLOR[p.type]}>{p.type}</Pill></Cell>
            <Cell style={{ ...td, color: C.textB }}>{p.method}</Cell>
            <Cell style={{ ...td, color: C.textS, fontSize: 12 }}>{p.reference || "—"}</Cell>
            <Cell style={{ ...td, color: p.type === "Refund" ? "#d44" : C.textH, fontWeight: 600, whiteSpace: "nowrap", textDecoration: p.voided ? "line-through" : "none" }}>
              {p.type === "Refund" ? "−" : ""}{fmt(p.amount)}
            </Cell>
            <Cell style={{ ...td, textAlign: "right" }}>
              {p.voided
                ? <span title={p.voidReason} style={{ color: C.textS, fontSize: 12 }}>Voided</span>
                : <Btn size="sm" kind="red" onClick={() => setVoiding(p)}>Void</Btn>}
            </Cell>
          </Row>
        ))}
      </TableShell>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, color: C.textH, fontSize: 14 }}>
        Net total: <strong style={{ marginLeft: 8 }}>{fmt(net)}</strong>
      </div>
      {voiding && <VoidModal what={`${voiding.type} of ${fmt(voiding.amount)} from ${voiding.guestName}`} kind="payment" id={voiding.id} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function VoidModal({ what, kind, id, onClose }: { what: string; kind: "payment" | "expense"; id: number; onClose: () => void }) {
  const { C, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true); setError("");
    const r = kind === "payment" ? await ops.voidPayment(id, reason) : await ops.voidExpense(id, reason);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`${kind === "payment" ? "Payment" : "Expense"} voided.`, "info");
    onClose();
  };
  return (
    <ConfirmDialog title={`Void this ${kind}?`} description={what} onCancel={onClose} cancelLabel="Keep it"
      confirm={<Btn kind="red" disabled={busy || reason.trim().length < 3} onClick={go}>{busy ? "Voiding…" : `Void ${kind}`}</Btn>}>
      <div>
        <p style={{ color: C.textS, fontSize: 13.5, marginTop: 0 }}>
          It stays in the records, crossed out, with your reason. Totals stop counting it.
        </p>
        <Label htmlFor="void-reason">Reason</Label>
        <Input id="void-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice by mistake" style={inp} />
        <ErrorNote>{error}</ErrorNote>
      </div>
    </ConfirmDialog>
  );
}

// ── Receivables ───────────────────────────────────────────────────────
function Receivables({ rows, onPay }: { rows: { b: Booking; m: ReturnType<typeof bookingMoney> }[]; onPay: (id: string) => void }) {
  const { C, rowBg, inp } = useAdminStyle();
  const sorted = [...rows].sort((a, b) => a.b.date.localeCompare(b.b.date));
  const total = round2(rows.reduce((s, r) => s + r.m.due, 0));
  return (
    <div>
      <p style={{ color: C.textS, fontSize: 13, marginTop: 0 }}>
        Online guests pay the remaining balance on the day of their visit. Record it here, or at check-out in Facilities.
      </p>
      <TableShell head={["Booking", "Guest", "Visit", "Status", "Total", "Paid", "Balance", "Penalty", "Owed", ""]} minWidth={940}
        empty={sorted.length === 0 ? "Nothing to collect. Every booking is paid up." : undefined}>
        {sorted.map(({ b, m }, i) => (
          <Row key={b.id} style={{ background: rowBg(i) }}>
            <Cell style={{ ...td, color: gold, fontFamily: "monospace" }}>{b.id}</Cell>
            <Cell style={{ ...td, color: C.textH }}>{b.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{b.contact}</div></Cell>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</Cell>
            <Cell style={td}><Pill color={STATUS_COLOR[b.status]}>{b.status}</Pill></Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(b.total)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(m.paid)}</Cell>
            <Cell style={{ ...td, color: m.balance > 0 ? "#d4a800" : C.textS }}>{fmt(m.balance)}</Cell>
            <Cell style={{ ...td, color: m.penaltyDue > 0 ? "#d44" : C.textS }}>{fmt(m.penaltyDue)}</Cell>
            <Cell style={{ ...td, color: C.textH, fontWeight: 700 }}>{fmt(m.due)}</Cell>
            <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm" kind="green" icon="cash" onClick={() => onPay(b.id)}>Record</Btn></Cell>
          </Row>
        ))}
      </TableShell>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, color: C.textH, fontSize: 14 }}>
        Total owed: <strong style={{ marginLeft: 8 }}>{fmt(total)}</strong>
      </div>
    </div>
  );
}

// ── Clients ───────────────────────────────────────────────────────────
function Clients({ bookings }: { bookings: Booking[] }) {
  const { C, rowBg, soft, inp } = useAdminStyle();
  const ops = useOps();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const clients = useMemo(() => {
    const map = new Map<string, { key: string; name: string; contact: string; email: string; bookings: Booking[] }>();
    for (const b of bookings) {
      if (b.id.startsWith("TMP-")) continue;
      const k = clientKey(b);
      const c = map.get(k) ?? { key: k, name: b.name, contact: b.contact, email: b.email, bookings: [] };
      c.bookings.push(b);
      map.set(k, c);
    }
    return [...map.values()].map((c) => {
      const ids = new Set(c.bookings.map((b) => b.id));
      const paid = round2(livePayments(ops.payments).filter((p) => p.bookingId && ids.has(p.bookingId)).reduce((s, p) => s + signedAmount(p), 0));
      const owed = round2(c.bookings.reduce((s, b) => s + bookingMoney(b, ops.payments, ops.damages).due, 0));
      const last = c.bookings.map((b) => b.date).sort().at(-1) ?? "";
      return { ...c, paid, owed, last };
    }).sort((a, b) => b.last.localeCompare(a.last));
  }, [bookings, ops.payments, ops.damages]);

  const s = q.toLowerCase().trim();
  const shown = clients.filter((c) => !s || c.name.toLowerCase().includes(s) || c.contact.includes(s) || c.email.toLowerCase().includes(s));
  const current = clients.find((c) => c.key === open);

  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client name, phone or email" style={{ ...inp, marginBottom: 12 }} />
      <TableShell head={["Client", "Bookings", "Last visit", "Total paid", "Owed", ""]} minWidth={700}
        empty={shown.length === 0 ? "No clients match." : undefined}>
        {shown.map((c, i) => (
          <Row key={c.key} style={{ background: rowBg(i), cursor: "pointer" }} onClick={() => setOpen(c.key)}>
            <Cell style={{ ...td, color: C.textH }}>{c.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{c.contact}{c.email ? ` · ${c.email}` : ""}</div></Cell>
            <Cell style={{ ...td, color: C.textB }}>{c.bookings.length}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{c.last ? fmtDate(c.last) : "—"}</Cell>
            <Cell style={{ ...td, color: C.textH, fontWeight: 600 }}>{fmt(c.paid)}</Cell>
            <Cell style={{ ...td, color: c.owed > 0 ? "#d4a800" : C.textS }}>{fmt(c.owed)}</Cell>
            <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm">View</Btn></Cell>
          </Row>
        ))}
      </TableShell>

      {current && (
        <Modal title={current.name} subtitle={`${current.contact}${current.email ? " · " + current.email : ""}`} onClose={() => setOpen(null)} width={820}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
            <Figure label="Bookings" value={current.bookings.length} />
            <Figure label="Total paid" value={fmt(current.paid)} color="#2e9e4e" />
            <Figure label="Owed" value={fmt(current.owed)} color={current.owed > 0 ? "#d4a800" : undefined} />
          </div>
          <h4 style={{ color: C.textH, fontSize: 14, margin: "0 0 8px" }}>Bookings</h4>
          <TableShell head={["Booking", "Visit", "Package", "Status", "Total", "Paid", "Owed"]} minWidth={640}>
            {[...current.bookings].sort((a, b) => b.date.localeCompare(a.date)).map((b, i) => {
              const m = bookingMoney(b, ops.payments, ops.damages);
              return (
                <Row key={b.id} style={{ background: rowBg(i) }}>
                  <Cell style={{ ...td, color: gold, fontFamily: "monospace" }}>{b.id}</Cell>
                  <Cell style={{ ...td, color: C.textB }}>{fmtDate(b.date)}</Cell>
                  <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{b.package}</Cell>
                  <Cell style={td}><Pill color={STATUS_COLOR[b.status]}>{b.status}</Pill></Cell>
                  <Cell style={{ ...td, color: C.textB }}>{fmt(b.total)}</Cell>
                  <Cell style={{ ...td, color: C.textB }}>{fmt(m.paid + m.penaltyPaid)}</Cell>
                  <Cell style={{ ...td, color: m.due > 0 ? "#d4a800" : C.textS }}>{fmt(m.due)}</Cell>
                </Row>
              );
            })}
          </TableShell>
          <h4 style={{ color: C.textH, fontSize: 14, margin: "18px 0 8px" }}>Payments</h4>
          <div style={{ background: soft, borderRadius: 8, padding: "6px 14px" }}>
            {livePayments(ops.payments).filter((p) => current.bookings.some((b) => b.id === p.bookingId)).map((p) => (
              <Line key={p.id} label={`${fmtDate(manilaDate(p.receivedAt))} · ${p.type} · ${p.method} · ${p.bookingId}`}
                value={`${p.type === "Refund" ? "−" : ""}${fmt(p.amount)}`} color={p.type === "Refund" ? "#d44" : undefined} />
            ))}
            {!livePayments(ops.payments).some((p) => current.bookings.some((b) => b.id === p.bookingId)) && (
              <p style={{ color: C.textS, fontSize: 13 }}>No payments recorded yet.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Expenses ──────────────────────────────────────────────────────────
function Expenses({ expenses, onAdd }: { expenses: Expense[]; onAdd: () => void }) {
  const { C, rowBg, soft, inp } = useAdminStyle();
  const [monthStr, setMonthStr] = useState(manilaDate().slice(0, 7));
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const { from, to } = monthRange(`${monthStr}-01`);
  const rows = expenses.filter((e) => e.spentOn >= from && e.spentOn <= to);
  const live = liveExpenses(rows);
  const byCat = EXPENSE_CATEGORIES.map((c) => [c, round2(live.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0))] as const).filter(([, v]) => v > 0);
  const total = round2(live.reduce((s, e) => s + e.amount, 0));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} aria-label="Month" style={{ ...inp, width: "auto", padding: "8px 10px" }} />
        <Btn size="sm" icon="plus" onClick={onAdd}>Add expense</Btn>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: "3 1 520px", minWidth: 0 }}>
        <TableShell head={["Date", "Category", "Description", "Method", "Amount", ""]} minWidth={640}
          empty={rows.length === 0 ? "No expenses recorded for this month." : undefined}>
          {rows.map((e, i) => (
            <Row key={e.id} style={{ background: rowBg(i), opacity: e.voided ? 0.5 : 1 }}>
              <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(e.spentOn)}</Cell>
              <Cell style={{ ...td, color: C.textB }}>{e.category}</Cell>
              <Cell style={{ ...td, color: C.textH }}>{e.description}</Cell>
              <Cell style={{ ...td, color: C.textS }}>{e.method}</Cell>
              <Cell style={{ ...td, color: C.textH, fontWeight: 600, textDecoration: e.voided ? "line-through" : "none" }}>{fmt(e.amount)}</Cell>
              <Cell style={{ ...td, textAlign: "right" }}>
                {e.voided ? <span title={e.voidReason} style={{ color: C.textS, fontSize: 12 }}>Voided</span> : <Btn size="sm" kind="red" onClick={() => setVoiding(e)}>Void</Btn>}
              </Cell>
            </Row>
          ))}
        </TableShell>
        </div>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px", flex: "1 1 240px" }}>
          <div style={{ color: C.textS, fontSize: 12.5, marginBottom: 6 }}>By category</div>
          {byCat.map(([c, v]) => <Line key={c} label={c} value={fmt(v)} />)}
          {byCat.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: "4px 0" }}>Nothing spent yet.</p>}
          <div style={{ borderTop: "1px solid rgba(150,130,100,0.25)", marginTop: 6, paddingTop: 4 }}>
            <Line label="Total" value={fmt(total)} strong />
          </div>
        </div>
      </div>
      {voiding && <VoidModal what={`${voiding.description} · ${fmt(voiding.amount)}`} kind="expense" id={voiding.id} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { C, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const [f, setF] = useState({ category: "Supplies", description: "", amount: "", method: "Cash" as (typeof MANUAL_METHODS)[number], spentOn: manilaDate() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    const r = await ops.addExpense({ ...f, amount: Number(f.amount) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`Expense of ${fmt(Number(f.amount))} saved.`, "success");
    onClose();
  };
  return (
    <Modal title="Add expense" subtitle="Money spent on running the resort" onClose={onClose} width={560}
      footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save expense"}</Btn>
      </div>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <Label htmlFor="ex-desc">What was it for?</Label>
          <Input id="ex-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Chlorine tablets, 2 kg" style={inp} />
        </div>
        <div>
          <Label htmlFor="ex-cat">Category</Label>
          <FullSelect id="ex-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </FullSelect>
        </div>
        <div>
          <Label htmlFor="ex-amt">Amount (₱)</Label>
          <Input id="ex-amt" type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={inp} />
        </div>
        <div>
          <Label htmlFor="ex-date">Date</Label>
          <Input id="ex-date" type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} style={inp} />
        </div>
        <div>
          <Label>Paid with</Label>
          <Segmented value={f.method} onChange={(m) => setF({ ...f, method: m })} size="sm" options={MANUAL_METHODS.map((m) => ({ value: m, label: m }))} />
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

// ── Daily closing (liquidation) ───────────────────────────────────────
function Closing() {
  const { C, soft, rowBg, cBg, cBr, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const [date, setDate] = useState(manilaDate());
  const existing = ops.closings.find((c) => c.closingDate === date);
  const [openingFloat, setOpeningFloat] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dayPays = livePayments(ops.payments).filter((p) => manilaDate(p.receivedAt) === date);
  const dayExp = liveExpenses(ops.expenses).filter((e) => e.spentOn === date);
  const byMethod = (m: string) => round2(dayPays.filter((p) => p.method === m).reduce((s, p) => s + signedAmount(p), 0));
  const cashIn = byMethod("Cash");
  const cashOut = round2(dayExp.filter((e) => e.method === "Cash").reduce((s, e) => s + e.amount, 0));
  const income = round2(dayPays.reduce((s, p) => s + signedAmount(p), 0));
  const spent = round2(dayExp.reduce((s, e) => s + e.amount, 0));
  const floatNum = Number(openingFloat) || 0;
  const expected = round2(floatNum + cashIn - cashOut);
  const diff = counted === "" ? null : round2(Number(counted) - expected);

  const save = async () => {
    setError("");
    if (counted === "" || Number(counted) < 0) return setError("Enter the cash you counted in the drawer.");
    setBusy(true);
    const r = await ops.closeDay({ date, openingFloat: floatNum, countedCash: Number(counted), notes });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`${fmtDate(date)} closed.`, "success");
    setCounted(""); setNotes("");
  };

  const pick = (d: string) => { setDate(d); setCounted(""); setOpeningFloat(""); setNotes(""); setError(""); };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <Label htmlFor="close-date">Day</Label>
        <Input id="close-date" type="date" max={manilaDate()} value={date} onChange={(e) => pick(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px" }} />
        {existing && <Pill color="#2e9e4e">Closed at {manilaTime(existing.closedAt)}</Pill>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginBottom: 22 }}>
        <div style={{ background: soft, borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 6 }}>Income and expenses</div>
          {MANUAL_METHODS.map((m) => <Line key={m} label={`Received by ${m}`} value={fmt(byMethod(m))} />)}
          <Line label="Received online (PayMongo)" value={fmt(byMethod("PayMongo"))} />
          <Line label="Total received" value={fmt(income)} strong />
          <Line label="Expenses" value={`− ${fmt(spent)}`} color="#d44" />
          <div style={{ borderTop: "1px solid rgba(150,130,100,0.25)", marginTop: 6, paddingTop: 4 }}>
            <Line label="Net for the day" value={fmt(round2(income - spent))} strong color={income - spent < 0 ? "#d44" : "#2e9e4e"} />
          </div>
        </div>

        <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 10 }}>Cash count</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <Label htmlFor="float">Opening cash (float)</Label>
              <Input id="float" type="number" min={0} value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0" style={inp} />
            </div>
            <div>
              <Label htmlFor="counted">Cash counted now</Label>
              <Input id="counted" type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} style={inp} />
            </div>
          </div>
          <Line label="Opening cash" value={fmt(floatNum)} />
          <Line label="+ Cash received" value={fmt(cashIn)} />
          <Line label="− Cash spent" value={fmt(cashOut)} />
          <Line label="Expected in the drawer" value={fmt(expected)} strong />
          {diff !== null && (
            <Line label={diff === 0 ? "Balanced" : diff > 0 ? "Over by" : "Short by"} value={fmt(Math.abs(diff))} strong
              color={diff === 0 ? "#2e9e4e" : diff > 0 ? "#3a8fc4" : "#d44"} />
          )}
          <div style={{ marginTop: 10 }}>
            <Label htmlFor="close-notes">Notes (optional)</Label>
            <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. ₱50 short, change given wrong" style={inp} />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Btn kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : existing ? "Close this day again" : "Close the day"}</Btn>
          </div>
        </div>
      </div>

      <h4 style={{ color: C.textH, fontSize: 14, margin: "0 0 8px" }}>Past closings</h4>
      <TableShell head={["Day", "Received", "Expenses", "Net", "Expected cash", "Counted", "Difference", "Notes"]} minWidth={860}
        empty={ops.closings.length === 0 ? "No days closed yet." : undefined}>
        {ops.closings.map((c, i) => (
          <Row key={c.closingDate} style={{ background: rowBg(i), cursor: "pointer" }} onClick={() => pick(c.closingDate)}>
            <Cell style={{ ...td, color: C.textH, whiteSpace: "nowrap" }}>{fmtDate(c.closingDate)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(c.totalCollected)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(c.totalExpenses)}</Cell>
            <Cell style={{ ...td, color: C.textH, fontWeight: 600 }}>{fmt(round2(c.totalCollected - c.totalExpenses))}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(c.expectedCash)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(c.countedCash)}</Cell>
            <Cell style={{ ...td, color: c.difference === 0 ? "#2e9e4e" : c.difference > 0 ? "#3a8fc4" : "#d44", fontWeight: 600 }}>
              {c.difference === 0 ? "Balanced" : `${c.difference > 0 ? "+" : "−"}${fmt(Math.abs(c.difference))}`}
            </Cell>
            <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{c.notes || "—"}</Cell>
          </Row>
        ))}
      </TableShell>
    </div>
  );
}

