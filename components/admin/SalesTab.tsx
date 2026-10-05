"use client";

// ── Sales (capstone objective 1)
//
// The day-to-day money screen. Every figure here comes from the payments
// ledger — money actually received — never from booking totals. Reports
// reads the same ledger for printed/exported summaries.
//
// Money is taken in during Daily Operations (accepting, settling, closing
// the day); this is where all of it is kept and looked back on.
//
//   Transactions   every payment, filterable, voidable with a reason
//   Invoices       every booking and where it stands: paid in full, part
//                  paid, unpaid or forfeited, with a printable invoice
//   Receivables    bookings that still owe a balance or a penalty
//   Settlements    the per-booking liquidations: each settled booking's
//                  charges, payments and anything closed unpaid
//   Clients        each guest's bookings, what they paid, what they owe
//   Expenses       money going out
//   Daily liquidation  end-of-day cash count vs. expected, and the day's
//                  income minus expenses

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useApp } from "@/contexts/AppContext";
import { closingBlockers, CLOSE_NEED } from "@/lib/operations";
import { Icon } from "@/components/common/Icon";
import { useToast } from "@/contexts/ToastContext";
import {
  bookingMoney, collectedBetween, expensesBetween, manilaDate, manilaTime, monthRange,
  livePayments, liveExpenses, signedAmount, clientKey, round2, downloadCsv,
} from "@/lib/finance";
import { fmt, fmtDate } from "@/lib/utils";
import { EXPENSE_CATEGORIES, MANUAL_METHODS, PAYMENT_TYPES, PAYMENT_METHODS, type Payment, type Expense } from "@/types/finance";
import type { BookingMoney } from "@/lib/finance";
import type { Booking } from "@/types/booking";
import { gold } from "@/lib/styles";
import { RecordPaymentModal } from "@/components/admin/RecordPaymentModal";
import { RefundModal } from "@/components/admin/RefundModal";
import { InvoiceModal } from "@/components/admin/InvoiceModal";
import {
  PageHead, Figure, Segmented, TableShell, td, Btn, Pill, Modal, Label, Line, ErrorNote,
  useAdminStyle, Row, Cell, STATUS_COLOR, FullSelect, ViewTabs, ConfirmDialog, TotalLine, TOGGLE_CLEARANCE, usePaged, Pager,
} from "@/components/admin/ui";

type View = "Transactions" | "Payments" | "Receivables" | "Settlements" | "Clients" | "Expenses" | "Closing";

/** How a booking stands with the money, for the status pill. Receivables
 *  answers "who still owes"; this answers "where does each booking stand",
 *  which includes the ones that are settled. */
const PAY_STATE_COLOR: Record<BookingMoney["state"], string> = {
  "Paid in full": "#2e9e4e",
  "Partially paid": "#d4a800",
  Unpaid: "#d44",
  Forfeited: "#8a7a66",
  Refunded: "#4a9fd4",
  "Held for guest": "#9a7bd0",
  "Refund owed": "#e07a3a",
};
const PAY_STATES: BookingMoney["state"][] = ["Paid in full", "Partially paid", "Unpaid", "Forfeited", "Refund owed", "Refunded", "Held for guest"];

const TYPE_COLOR: Record<string, string> = {
  Downpayment: "#d4a800", Balance: "#2e9e4e", Full: "#2e9e4e", Penalty: "#d44", Refund: "#8a7a66",
};

export function SalesTab({ bookings, mob }: { bookings: Booking[]; mob: boolean }) {
  const ops = useOps();
  const today = manilaDate();
  const month = monthRange(today);
  const [view, setView] = useState<View>("Transactions");
  const [payFor, setPayFor] = useState<{ bookingId?: string } | null>(null);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [addExpense, setAddExpense] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const invoiceOf = invoiceId ? bookings.find((b) => b.id === invoiceId) ?? null : null;

  const collectedToday = collectedBetween(ops.payments, today);
  const collectedMonth = collectedBetween(ops.payments, month.from, month.to);
  const spentMonth = expensesBetween(ops.expenses, month.from, month.to);
  /* Costed once and shared: Receivables and Payments both need every
     booking's money, and bookingMoney() walks the whole ledger per booking. */
  const withMoney = useMemo(
    () => bookings.map((b) => ({ b, m: bookingMoney(b, ops.payments, ops.damages) })),
    [bookings, ops.payments, ops.damages],
  );
  const receivables = useMemo(() => withMoney.filter(({ m }) => m.due > 0), [withMoney]);
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

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <Figure label="Collected today" value={fmt(collectedToday)} note={`${todayCount} payment${todayCount === 1 ? "" : "s"}`} color="#2e9e4e" />
        <Figure label="Collected this month" value={fmt(collectedMonth)} note={new Date(today).toLocaleString("en-PH", { month: "long", year: "numeric" })} />
        <Figure label="Net income this month" value={fmt(round2(collectedMonth - spentMonth))} note={`after ${fmt(spentMonth)} in expenses`} color={collectedMonth - spentMonth < 0 ? "#d44" : gold} />
        <Figure label="Still to collect" value={fmt(owed)} note={`${receivables.length} booking${receivables.length === 1 ? "" : "s"} with a balance or penalty`} color={owed > 0 ? "#d4a800" : undefined} />
      </div>

      {!ops.loaded && ops.loading && <p style={{ color: "#8a7a66", fontSize: 13 }}>Loading payment records…</p>}

      <ViewTabs<View> value={view} onChange={setView} views={[
        { value: "Transactions", label: "Transactions", content: <Transactions payments={ops.payments} /> },
        { value: "Payments", label: "Invoices", content: <BookingPayments rows={withMoney} onPay={(id) => setPayFor({ bookingId: id })} onInvoice={setInvoiceId} /> },
        { value: "Receivables", label: `Receivables (${receivables.length})`, content: <Receivables rows={receivables} refunds={bookings.filter((b) => b.refundStatus === "Owed")} onPay={(id) => setPayFor({ bookingId: id })} onRefund={setRefundFor} onInvoice={setInvoiceId} /> },
        { value: "Settlements", label: "Settlements", content: <Settlements rows={withMoney} onInvoice={setInvoiceId} /> },
        { value: "Clients", label: "Clients", content: <Clients bookings={bookings} /> },
        { value: "Expenses", label: "Expenses", content: <Expenses expenses={ops.expenses} onAdd={() => setAddExpense(true)} /> },
        { value: "Closing", label: "Daily liquidation", content: <Closing /> },
      ]} />

      {payFor && <RecordPaymentModal bookings={bookings} bookingId={payFor.bookingId} onClose={() => setPayFor(null)} />}
      {refundFor && bookings.find((b) => b.id === refundFor) && (
        <RefundModal booking={bookings.find((b) => b.id === refundFor)!} onClose={() => setRefundFor(null)} />
      )}
      {addExpense && <ExpenseModal onClose={() => setAddExpense(false)} />}
      {invoiceOf && <InvoiceModal booking={invoiceOf} onClose={() => setInvoiceId(null)} />}
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
  const paged = usePaged(rows);
  const net = round2(rows.filter((p) => !p.voided).reduce((s, p) => s + signedAmount(p), 0));

  const exportCsv = () => downloadCsv(`StoneWood_Transactions_${from}_to_${to}.csv`, [
    ["Date", "Time", "Booking", "Guest", "Type", "Method", "Reference", "Amount (PHP)", "Voided", "Void reason", "Notes"],
    ...rows.map((p) => [manilaDate(p.receivedAt), manilaTime(p.receivedAt), p.bookingId ?? "", p.guestName, p.type, p.method, p.reference,
      signedAmount(p), p.voided ? "Yes" : "No", p.voidReason ?? "", p.notes]),
    [],
    ["", "", "", "", "", "", "Net total", net],
  ]);

  const sel = { ...inp, padding: "8px 12px", width: "auto" } as const;
  return (
    <div>
      {/* A grid that becomes the old single row only when there is width for
          one. Wrapping a flex row left the controls ragged at middling
          widths — a lone date input on its own line, the search box squeezed
          to its 200px minimum beside a stranded checkbox. Columns keep them
          aligned at every size, and the date pair stays together. */}
      <div className="mb-3 grid grid-cols-1 items-center gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" style={{ ...sel, minWidth: 0, flex: 1 }} />
          <span style={{ color: C.textS, fontSize: 13, flexShrink: 0 }}>to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" style={{ ...sel, minWidth: 0, flex: 1 }} />
        </div>
{/* FullSelect carries the w-full override on an ancestor of the
            wrapper, which is the only place it works: NativeSelect hands its
            className to the <select>, not to the w-fit wrapper around it. */}
        <FullSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" style={{ ...sel, width: "100%" }}>
          <option>All</option>{PAYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </FullSelect>
        <FullSelect value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method" style={{ ...sel, width: "100%" }}>
          <option>All</option>{PAYMENT_METHODS.map((t) => <option key={t}>{t}</option>)}
        </FullSelect>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guest, booking or reference" className="sm:col-span-2 xl:flex-1" style={{ ...sel, width: "100%", minWidth: 0 }} />
        <label style={{ color: C.textS, fontSize: 13, display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
          <Checkbox checked={showVoided} onCheckedChange={(v) => setShowVoided(v === true)} /> Show voided
        </label>
        <Btn size="sm" icon="download" onClick={exportCsv}>Export</Btn>
      </div>

      <TableShell head={["Date", "Booking", "Guest", "Type", "Method", "Reference", "Amount", ""]} minWidth={860}
        empty={rows.length === 0 ? "No payments in this range." : undefined}>
        {paged.rows.map((p, i) => (
          <Row key={p.id} style={{ background: rowBg(i), opacity: p.voided ? 0.5 : 1 }}>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(manilaDate(p.receivedAt))}<div style={{ color: C.textS, fontSize: 11.5 }}>{manilaTime(p.receivedAt)}</div></Cell>
            <Cell style={{ ...td, color: C.goldInk, fontFamily: "monospace" }}>{p.bookingId ?? "—"}</Cell>
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
      <Pager {...paged} noun="payments" />
      <TotalLine label="Net total" value={fmt(net)} />
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

// ── Booking payments ──────────────────────────────────────────────────
//
// Every booking and what it owes, including the ones that owe nothing.
function BookingPayments({ rows, onPay, onInvoice }: { rows: { b: Booking; m: BookingMoney }[]; onPay: (id: string) => void; onInvoice: (id: string) => void }) {
  const { C, rowBg, inp } = useAdminStyle();
  const [state, setState] = useState<"All" | BookingMoney["state"]>("All");
  const [q, setQ] = useState("");

  const counts = PAY_STATES.map((st) => [st, rows.filter((r) => r.m.state === st).length] as const);

  const search = q.toLowerCase().trim();
  const shown = rows
    .filter((r) => state === "All" || r.m.state === state)
    .filter((r) => !search
      || r.b.id.toLowerCase().includes(search)
      || r.b.name.toLowerCase().includes(search)
      || (r.b.contact ?? "").includes(search))
    // Newest visit first: monitoring starts from what just happened, while
    // Receivables counts down to the next date money is due.
    .sort((a, b) => b.b.date.localeCompare(a.b.date));

  const paged = usePaged(shown);
  const sum = (pick: (r: { b: Booking; m: BookingMoney }) => number) => round2(shown.reduce((n, r) => n + pick(r), 0));
  const expected = sum((r) => r.b.total);
  const collected = sum((r) => r.m.paid);
  const outstanding = sum((r) => r.m.due);

  return (
    <div>
      <p style={{ color: C.textS, fontSize: 13, marginTop: 0 }}>
        Where every booking stands. Figures follow the filter below, and come from the payment records rather than the booking total.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        <Figure label="Booked value" value={fmt(expected)} note={`${shown.length} booking${shown.length === 1 ? "" : "s"}`} />
        <Figure label="Collected" value={fmt(collected)} color="#2e9e4e" />
        <Figure label="Outstanding" value={fmt(outstanding)} color={outstanding > 0 ? "#d4a800" : undefined} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Segmented<"All" | BookingMoney["state"]>
          value={state}
          onChange={setState}
          size="sm"
          options={[
            { value: "All", label: `All (${rows.length})` },
            ...counts.map(([st, n]) => ({ value: st, label: `${st} (${n})` })),
          ]}
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search reference, guest or phone"
          aria-label="Search booking payments"
          style={{ ...inp, flex: 1, minWidth: 220 }}
        />
      </div>

      {/* Two columns were both headed "Booking" — the reference and the
          booking's status — which read as a mistake and collided as React
          keys. Each says which status it means. */}
      <TableShell head={["Reference", "Guest", "Visit", "Booking status", "Payment status", "Total", "Paid", "Balance", "Penalty due", ""]} minWidth={1080}
        empty={shown.length === 0 ? (rows.length === 0 ? "No bookings yet." : "No bookings match this filter.") : undefined}>
        {paged.rows.map(({ b, m }, i) => (
          <Row key={b.id} style={{ background: rowBg(i) }}>
            <Cell style={{ ...td, color: C.goldInk, fontFamily: "monospace" }}>
              {/* A TMP id is a booking this browser just made that the server
                  has not numbered yet -- showing the placeholder would read
                  as a real reference. */}
              {b.id.startsWith("TMP-") ? <span style={{ color: C.textS, fontFamily: "inherit" }}>Saving…</span> : b.id}
            </Cell>
            <Cell style={{ ...td, color: C.textH }}>{b.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{b.contact}</div></Cell>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</Cell>
            <Cell style={td}><Pill color={STATUS_COLOR[b.status]}>{b.status}</Pill></Cell>
            <Cell style={td}><Pill color={PAY_STATE_COLOR[m.state]}>{m.state}</Pill></Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(b.total)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(m.paid)}</Cell>
            <Cell style={{ ...td, color: m.balance > 0 ? "#d4a800" : C.textS }}>{fmt(m.balance)}</Cell>
            <Cell style={{ ...td, color: m.penaltyDue > 0 ? "#d44" : C.textS }}>{fmt(m.penaltyDue)}</Cell>
            <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
              <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                {!b.id.startsWith("TMP-") && <Btn size="sm" icon="receipt" onClick={() => onInvoice(b.id)}>Invoice</Btn>}
                {m.due > 0
                  ? <Btn size="sm" kind="green" icon="cash" onClick={() => onPay(b.id)}>Record</Btn>
                  : <span style={{ color: C.textS, fontSize: 12 }}>{m.state === "Forfeited" || m.state === "Refunded" || m.state === "Refund owed" || m.state === "Held for guest" ? m.state : "Settled"}</span>}
              </div>
            </Cell>
          </Row>
        ))}
      </TableShell>
      <Pager {...paged} noun="bookings" />
    </div>
  );
}

// ── Receivables ───────────────────────────────────────────────────────
function Receivables({ rows, refunds, onPay, onRefund, onInvoice }: {
  rows: { b: Booking; m: ReturnType<typeof bookingMoney> }[];
  /** Bookings the resort cancelled whose refund hasn't been sent yet. */
  refunds: Booking[];
  onPay: (id: string) => void;
  onRefund: (id: string) => void;
  onInvoice: (id: string) => void;
}) {
  const { C, rowBg, inp } = useAdminStyle();
  const sorted = [...rows].sort((a, b) => a.b.date.localeCompare(b.b.date));
  const total = round2(rows.reduce((s, r) => s + r.m.due, 0));
  const refundTotal = round2(refunds.reduce((s, b) => s + (b.refundAmount ?? 0), 0));
  const pagedRec = usePaged(sorted);
  return (
    <div>
      {/* Money the resort owes back comes first: a guest is waiting on it. */}
      {refunds.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ color: "#e07a3a", fontSize: 14, margin: "0 0 8px" }}>Refunds owed to guests ({fmt(refundTotal)})</h4>
          <TableShell head={["Booking", "Guest", "Original visit", "Refund owed", ""]} minWidth={640}>
            {refunds.map((b, i) => (
              <Row key={b.id} style={{ background: rowBg(i) }}>
                <Cell style={{ ...td, color: C.goldInk, fontFamily: "monospace" }}>{b.id}</Cell>
                <Cell style={{ ...td, color: C.textH }}>{b.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{b.contact}</div></Cell>
                <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</Cell>
                <Cell style={{ ...td, color: "#e07a3a", fontWeight: 700 }}>{fmt(b.refundAmount ?? 0)}</Cell>
                <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm" kind="primary" icon="cash" onClick={() => onRefund(b.id)}>Send refund</Btn></Cell>
              </Row>
            ))}
          </TableShell>
        </div>
      )}
      <p style={{ color: C.textS, fontSize: 13, marginTop: 0 }}>
        Online guests pay the remaining balance on the day of their visit, normally when the booking is settled in Daily Operations. Money that comes in later is recorded here.
      </p>
      <TableShell head={["Booking", "Guest", "Visit", "Status", "Total", "Paid", "Balance", "Penalty", "Owed", ""]} minWidth={940}
        empty={sorted.length === 0 ? "Nothing to collect. Every booking is paid up." : undefined}>
        {pagedRec.rows.map(({ b, m }, i) => (
          <Row key={b.id} style={{ background: rowBg(i) }}>
            <Cell style={{ ...td, color: C.goldInk, fontFamily: "monospace" }}>{b.id}</Cell>
            <Cell style={{ ...td, color: C.textH }}>{b.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{b.contact}</div></Cell>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</Cell>
            <Cell style={td}><Pill color={STATUS_COLOR[b.status]}>{b.status}</Pill></Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(b.total)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(m.paid)}</Cell>
            <Cell style={{ ...td, color: m.balance > 0 ? "#d4a800" : C.textS }}>{fmt(m.balance)}</Cell>
            <Cell style={{ ...td, color: m.penaltyDue > 0 ? "#d44" : C.textS }}>{fmt(m.penaltyDue)}</Cell>
            <Cell style={{ ...td, color: C.textH, fontWeight: 700 }}>{fmt(m.due)}</Cell>
            <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <Btn size="sm" icon="receipt" onClick={() => onInvoice(b.id)}>Invoice</Btn>
                <Btn size="sm" kind="green" icon="cash" onClick={() => onPay(b.id)}>Record</Btn>
              </div>
            </Cell>
          </Row>
        ))}
      </TableShell>
      <Pager {...pagedRec} noun="bookings" />
      <TotalLine label="Total owed" value={fmt(total)} />
    </div>
  );
}

// ── Settlements: the per-booking liquidations ─────────────────────────
function Settlements({ rows, onInvoice }: { rows: { b: Booking; m: BookingMoney }[]; onInvoice: (id: string) => void }) {
  const { C, rowBg, inp } = useAdminStyle();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const search = q.toLowerCase().trim();
  const settled = rows
    .filter(({ b }) => b.status === "Completed" && b.settledAt)
    .map((r) => ({ ...r, on: manilaDate(r.b.settledAt!) }))
    .filter(({ on }) => (!from || on >= from) && (!to || on <= to))
    .filter(({ m }) => !onlyUnpaid || m.due > 0)
    .filter(({ b }) => !search || b.id.toLowerCase().includes(search) || b.name.toLowerCase().includes(search) || b.contact.includes(search))
    .sort((a, b) => b.b.settledAt!.localeCompare(a.b.settledAt!));

  const sum = (pick: (r: { b: Booking; m: BookingMoney }) => number) => round2(settled.reduce((n, r) => n + pick(r), 0));
  const charges = sum((r) => r.b.total + r.m.penaltyTotal);
  const paid = sum((r) => r.m.paid + r.m.penaltyPaid);
  const unpaid = sum((r) => r.m.due);
  const sel = { ...inp, padding: "8px 12px", width: "auto" } as const;

  const pagedSet = usePaged(settled);
  return (
    <div>
      <p style={{ color: C.textS, fontSize: 13, marginTop: 0 }}>
        Each booking settled in Daily Operations: the stay and any damage penalties, against what was paid. The daily cash count is under Daily liquidation.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        <Figure label="Settled bookings" value={settled.length} />
        <Figure label="Charges" value={fmt(charges)} />
        <Figure label="Paid" value={fmt(paid)} color="#2e9e4e" />
        <Figure label="Closed unpaid" value={fmt(unpaid)} color={unpaid > 0 ? "#d4a800" : undefined} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, guest or phone" aria-label="Search settlements" style={{ ...sel, flex: "1 1 220px" }} />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Settled from" style={sel} />
        <span style={{ color: C.textS, fontSize: 13 }}>to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Settled to" style={sel} />
        <label style={{ color: C.textS, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <Checkbox checked={onlyUnpaid} onCheckedChange={(v) => setOnlyUnpaid(v === true)} /> Only closed unpaid
        </label>
      </div>
      <TableShell head={["Settled", "Booking", "Guest", "Stay", "Penalties", "Paid", "Unpaid", ""]} minWidth={940}
        empty={settled.length === 0 ? "No settled bookings match." : undefined}>
        {pagedSet.rows.map(({ b, m, on }, i) => (
          <Row key={b.id} style={{ background: rowBg(i) }}>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(on)}<div style={{ color: C.textS, fontSize: 11.5 }}>{manilaTime(b.settledAt!)}</div></Cell>
            <Cell style={{ ...td, color: C.goldInk, fontFamily: "monospace" }}>{b.id}</Cell>
            <Cell style={{ ...td, color: C.textH }}>{b.name}<div style={{ color: C.textS, fontSize: 11.5 }}>Visit {fmtDate(b.date)}</div></Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(b.total)}</Cell>
            <Cell style={{ ...td, color: m.penaltyTotal > 0 ? "#d44" : C.textS }}>{fmt(m.penaltyTotal)}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{fmt(round2(m.paid + m.penaltyPaid))}</Cell>
            <Cell style={{ ...td, color: m.due > 0 ? "#d4a800" : C.textS }}>
              {m.due > 0 ? fmt(m.due) : "—"}
              {b.settlementNote && <div style={{ color: C.textS, fontSize: 11.5 }}>{b.settlementNote}</div>}
            </Cell>
            <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm" icon="receipt" onClick={() => onInvoice(b.id)}>Invoice</Btn></Cell>
          </Row>
        ))}
      </TableShell>
      <Pager {...pagedSet} noun="settlements" />
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

  const pagedCli = usePaged(shown);
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client name, phone or email" style={{ ...inp, marginBottom: 12 }} />
      <TableShell head={["Client", "Bookings", "Last visit", "Total paid", "Owed", ""]} minWidth={700}
        empty={shown.length === 0 ? "No clients match." : undefined}>
        {pagedCli.rows.map((c, i) => (
          <Row key={c.key} className="sw-click-row" style={{ background: rowBg(i) }} onClick={() => setOpen(c.key)}>
            <Cell style={{ ...td, color: C.textH }}>{c.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{c.contact}{c.email ? ` · ${c.email}` : ""}</div></Cell>
            <Cell style={{ ...td, color: C.textB }}>{c.bookings.length}</Cell>
            <Cell style={{ ...td, color: C.textB }}>{c.last ? fmtDate(c.last) : "—"}</Cell>
            <Cell style={{ ...td, color: C.textH, fontWeight: 600 }}>{fmt(c.paid)}</Cell>
            <Cell style={{ ...td, color: c.owed > 0 ? "#d4a800" : C.textS }}>{fmt(c.owed)}</Cell>
            <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm">View</Btn></Cell>
          </Row>
        ))}
      </TableShell>
      <Pager {...pagedCli} noun="clients" />

      {current && (
        <Modal title={current.name} subtitle={`${current.contact}${current.email ? " · " + current.email : ""}`} onClose={() => setOpen(null)} width={820}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
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
                  <Cell style={{ ...td, color: C.goldInk, fontFamily: "monospace" }}>{b.id}</Cell>
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
          <h4 style={{ color: C.textH, fontSize: 14, margin: "20px 0 8px" }}>Payments</h4>
          <div style={{ background: soft, borderRadius: 8, padding: "8px 16px" }}>
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

  const pagedExp = usePaged(rows);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} aria-label="Month" style={{ ...inp, width: "auto", padding: "8px 12px" }} />
        <Btn size="sm" icon="plus" onClick={onAdd}>Add expense</Btn>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "3 1 520px", minWidth: 0 }}>
        <TableShell head={["Date", "Category", "Description", "Method", "Amount", ""]} minWidth={640}
          empty={rows.length === 0 ? "No expenses recorded for this month." : undefined}>
          {pagedExp.rows.map((e, i) => (
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
        <Pager {...pagedExp} noun="expenses" />
        </div>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px", flex: "1 1 240px" }}>
          <div style={{ color: C.textS, fontSize: 12.5, marginBottom: 8 }}>By category</div>
          {byCat.map(([c, v]) => <Line key={c} label={c} value={fmt(v)} />)}
          {byCat.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: "4px 0" }}>Nothing spent yet.</p>}
          <div style={{ borderTop: "1px solid rgba(150,130,100,0.25)", marginTop: 8, paddingTop: 4 }}>
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
      footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
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
//
// Before the cash count, every reservation up to the chosen day has to be
// finished (lib/operations.ts → closingBlockers; /api/closings enforces it
// too). Daily Operations passes `onAct`, so each unfinished booking gets the
// button that finishes it right here; Sales lists them and points there.

/** What a closing checklist button asks Daily Operations to open. */
export type CloseAction = "accept" | "reject" | "checkout" | "noshow" | "settle";

export function Closing({ onAct }: { onAct?: (action: CloseAction, b: Booking) => void } = {}) {
  const { C, soft, rowBg, cBg, cBr, inp } = useAdminStyle();
  const ops = useOps();
  const { bookings } = useApp();
  const { toast } = useToast();
  const today = manilaDate();
  const [date, setDate] = useState(today);
  const existing = ops.closings.find((c) => c.closingDate === date);
  const blockers = closingBlockers(bookings, date);
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
    if (blockers.length > 0) return setError("Finish the bookings listed above first.");
    if (counted === "" || Number(counted) < 0) return setError("Enter the cash you counted in the drawer.");
    setBusy(true);
    const r = await ops.closeDay({ date, openingFloat: floatNum, countedCash: Number(counted), notes });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`${fmtDate(date)} closed.`, "success");
    setCounted(""); setNotes("");
  };

  const pick = (d: string) => { setDate(d); setCounted(""); setOpeningFloat(""); setNotes(""); setError(""); };

  const pagedClo = usePaged(ops.closings);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Label htmlFor="close-date">Day</Label>
        <Input id="close-date" type="date" max={manilaDate()} value={date} onChange={(e) => pick(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px" }} />
        {existing && <Pill color="#2e9e4e">Closed at {manilaTime(existing.closedAt)}</Pill>}
      </div>

      {blockers.length > 0 && (
        <section aria-labelledby="close-blockers" style={{ border: "1px solid #d4a80066", background: "rgba(212,168,0,0.06)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <h4 id="close-blockers" style={{ color: C.textH, fontSize: 14.5, fontWeight: 600, margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="alert" size={15} style={{ color: "#d4a800" }} />
            Finish {blockers.length === 1 ? "this booking" : `these ${blockers.length} bookings`} before closing {date === today ? "today" : fmtDate(date)}
          </h4>
          <p style={{ color: C.textS, fontSize: 13, margin: "4px 0 8px" }}>
            Every reservation up to this day has to be completed or cancelled first, so the cash count includes everything those groups paid.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {blockers.map(({ b, need }) => (
              <li key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${cBr}` }}>
                <span style={{ flex: "1 1 240px", fontSize: 13.5, color: C.textB }}>
                  <strong style={{ color: C.textH }}>{b.name}</strong> · {b.date === today ? "today" : fmtDate(b.date)} · <span style={{ color: "#d4a800" }}>{CLOSE_NEED[need].label}</span>
                  <span style={{ color: C.textS }}>: {CLOSE_NEED[need].todo}</span>
                </span>
                {onAct && (
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {need === "confirm" && <>
                      <Btn size="sm" kind="green" onClick={() => onAct("accept", b)}>Accept</Btn>
                      <Btn size="sm" kind="red" onClick={() => onAct("reject", b)}>Cancel</Btn>
                    </>}
                    {need === "arrival" && <>
                      <Btn size="sm" kind="primary" onClick={() => onAct("checkout", b)}>Complete stay</Btn>
                      <Btn size="sm" kind="red" onClick={() => onAct("noshow", b)}>No-show</Btn>
                    </>}
                    {need === "checkout" && <Btn size="sm" kind="primary" onClick={() => onAct("checkout", b)}>Check out</Btn>}
                    {need === "settle" && <Btn size="sm" kind="primary" onClick={() => onAct("settle", b)}>Settle</Btn>}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!onAct && <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0" }}>Finish them in Daily Operations, then come back to close the day.</p>}
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ background: soft, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 8 }}>Income and expenses</div>
          {MANUAL_METHODS.map((m) => <Line key={m} label={`Received by ${m}`} value={fmt(byMethod(m))} />)}
          <Line label="Received online (PayMongo)" value={fmt(byMethod("PayMongo"))} />
          <Line label="Total received" value={fmt(income)} strong />
          <Line label="Expenses" value={`− ${fmt(spent)}`} color="#d44" />
          <div style={{ borderTop: "1px solid rgba(150,130,100,0.25)", marginTop: 8, paddingTop: 4 }}>
            <Line label="Net for the day" value={fmt(round2(income - spent))} strong color={income - spent < 0 ? "#d44" : "#2e9e4e"} />
          </div>
        </div>

        <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 12 }}>Cash count</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
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
          <div style={{ marginTop: 12 }}>
            <Label htmlFor="close-notes">Notes (optional)</Label>
            <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. ₱50 short, change given wrong" style={inp} />
          </div>
          <ErrorNote>{error}</ErrorNote>
          {/* Same clearance: this is the page's last row, right-aligned,
              and the toggle floats over that corner. */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, paddingRight: TOGGLE_CLEARANCE }}>
            <Btn kind="primary" disabled={busy || blockers.length > 0} onClick={save}>
              {busy ? "Saving…" : blockers.length > 0 ? "Finish the bookings above first" : existing ? "Close this day again" : "Close the day"}
            </Btn>
          </div>
        </div>
      </div>

      <h4 style={{ color: C.textH, fontSize: 14, margin: "0 0 8px" }}>Past closings</h4>
      <TableShell head={["Day", "Received", "Expenses", "Net", "Expected cash", "Counted", "Difference", "Notes"]} minWidth={860}
        empty={ops.closings.length === 0 ? "No days closed yet." : undefined}>
        {pagedClo.rows.map((c, i) => (
          <Row key={c.closingDate} className="sw-click-row" style={{ background: rowBg(i) }} onClick={() => pick(c.closingDate)}>
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
      <Pager {...pagedClo} noun="days" />
    </div>
  );
}

