"use client";

// ── Reports (reports generation, from the capstone title)
//
// Printable and exportable summaries for any month, year or custom range.
// Money figures come from the payments and expenses ledgers — the same
// numbers Sales shows — so a printed report always agrees with the screen.
// Booking figures (counts, guests, slots) are by visit date. This replaces
// both the old Reports tab, which counted booking totals as revenue, and
// the separate Analytics tab, whose charts now live at the bottom here.

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useMemo, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import {
  bookingMoney, manilaDate, manilaTime, monthRange, livePayments, liveExpenses, signedAmount, round2, downloadCsv,
} from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { escapeHtml } from "@/lib/escapeHtml";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_TYPES } from "@/types/finance";
import type { Booking, BookingSlot } from "@/types/booking";
import type { Room } from "@/types/room";
import { gold } from "@/lib/styles";
import { Panel, BarChart, ProgressRow } from "@/components/admin/charts";
import { PageHead, Figure, Segmented, Btn, Line, useAdminStyle } from "@/components/admin/ui";

type Period = "Month" | "Year" | "Custom";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ReportsTab({ bookings, rooms, mob }: { bookings: Booking[]; rooms: Room[]; mob: boolean }) {
  const { C, soft, inp } = useAdminStyle();
  const ops = useOps();
  const today = manilaDate();

  const [period, setPeriod] = useState<Period>("Month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [cFrom, setCFrom] = useState(monthRange(today).from);
  const [cTo, setCTo] = useState(today);

  const { from, to, label } = useMemo(() => {
    if (period === "Month") {
      const r = monthRange(`${month}-01`);
      return { ...r, label: new Date(`${month}-01T00:00:00`).toLocaleString("en-PH", { month: "long", year: "numeric" }) };
    }
    if (period === "Year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: year };
    return { from: cFrom, to: cTo, label: `${fmtDate(cFrom)} – ${fmtDate(cTo)}` };
  }, [period, month, year, cFrom, cTo]);

  // Years that have any data, plus this one.
  const years = useMemo(() => {
    const ys = new Set<string>([today.slice(0, 4)]);
    bookings.forEach((b) => b.date && ys.add(b.date.slice(0, 4)));
    ops.payments.forEach((p) => ys.add(manilaDate(p.receivedAt).slice(0, 4)));
    return [...ys].sort().reverse();
  }, [bookings, ops.payments, today]);

  const inRange = (d: string) => d >= from && d <= to;
  const pays = livePayments(ops.payments).filter((p) => inRange(manilaDate(p.receivedAt)));
  const exps = liveExpenses(ops.expenses).filter((e) => inRange(e.spentOn));
  const bks = bookings.filter((b) => !b.id.startsWith("TMP-") && b.date && inRange(b.date));
  const kept = bks.filter((b) => b.status !== "Cancelled");

  const collected = round2(pays.reduce((s, p) => s + signedAmount(p), 0));
  const spent = round2(exps.reduce((s, e) => s + e.amount, 0));
  const owed = round2(kept.reduce((s, b) => s + bookingMoney(b, ops.payments, ops.damages).due, 0));
  const byType = PAYMENT_TYPES.map((t) => [t, round2(pays.filter((p) => p.type === t).reduce((s, p) => s + p.amount, 0))] as const);
  const byMethod = PAYMENT_METHODS.map((m) => [m, round2(pays.filter((p) => p.method === m).reduce((s, p) => s + signedAmount(p), 0))] as const);
  const byCat = EXPENSE_CATEGORIES.map((c) => [c, round2(exps.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0))] as const).filter(([, v]) => v > 0);
  const statusCount = (["Pending", "Confirmed", "Completed", "Cancelled"] as const).map((s) => [s, bks.filter((b) => b.status === s).length] as const);
  const guests = kept.reduce((s, b) => s + b.guests, 0);
  const slotCount = (["Day", "Night", "WholeDay"] as BookingSlot[]).map((s) => [s, kept.filter((b) => getBookingSlot(b) === s).length] as const);

  // Chart: per month for a year, per day otherwise.
  const series = useMemo(() => {
    if (period === "Year") {
      return MONTHS.map((m, i) => {
        const r = monthRange(`${year}-${String(i + 1).padStart(2, "0")}-01`);
        const money = livePayments(ops.payments).filter((p) => { const d = manilaDate(p.receivedAt); return d >= r.from && d <= r.to; }).reduce((s, p) => s + signedAmount(p), 0);
        const count = bookings.filter((b) => b.status !== "Cancelled" && b.date >= r.from && b.date <= r.to);
        return { label: m, money: round2(money), bookings: count.length, guests: count.reduce((s, b) => s + b.guests, 0) };
      });
    }
    const out: { label: string; money: number; bookings: number; guests: number }[] = [];
    const start = new Date(`${from}T00:00:00`); const end = new Date(`${to}T00:00:00`);
    for (let d = new Date(start), n = 0; d <= end && n < 93; d.setDate(d.getDate() + 1), n++) {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const money = pays.filter((p) => manilaDate(p.receivedAt) === ds).reduce((s, p) => s + signedAmount(p), 0);
      const count = kept.filter((b) => b.date === ds);
      out.push({ label: String(d.getDate()), money: round2(money), bookings: count.length, guests: count.reduce((s, b) => s + b.guests, 0) });
    }
    return out;
  }, [period, year, from, to, ops.payments, bookings, pays, kept]);

  const fileTag = label.replace(/[^\w]+/g, "_");
  const roomNames = (b: Booking) => (b.rooms || []).map((id) => rooms.find((r) => r.id === id)?.name ?? `#${id}`).join(" | ") || "None";

  const exportBookings = () => downloadCsv(`StoneWood_Bookings_${fileTag}.csv`, [
    ["Booking ID", "Guest", "Contact", "Email", "Visit date", "Slot", "Package", "Source", "Guests", "Rooms", "Total (PHP)", "Paid (PHP)", "Penalties (PHP)", "Owed (PHP)", "Status", "Notes"],
    ...bks.map((b) => {
      const m = bookingMoney(b, ops.payments, ops.damages);
      return [b.id, b.name, b.contact, b.email, b.date, SLOTS[getBookingSlot(b)].label, b.package, b.source ?? "Online", b.guests, roomNames(b),
        b.total, m.paid, m.penaltyTotal, m.due, b.status, b.notes];
    }),
    [],
    ["Summary", label],
    ["Bookings", bks.length], ["Guests (not cancelled)", guests],
    ...statusCount.map(([s, n]) => [s, n]),
  ]);

  const exportMoney = () => downloadCsv(`StoneWood_Sales_${fileTag}.csv`, [
    ["Date", "Time", "Booking", "Guest", "Type", "Method", "Reference", "Amount (PHP)"],
    ...pays.map((p) => [manilaDate(p.receivedAt), manilaTime(p.receivedAt), p.bookingId ?? "", p.guestName, p.type, p.method, p.reference, signedAmount(p)]),
    [],
    ["Date", "Category", "Description", "Method", "", "", "", "Amount (PHP)"],
    ...exps.map((e) => [e.spentOn, e.category, e.description, e.method, "", "", "", -e.amount]),
    [],
    ["", "", "", "", "", "", "Money received", collected],
    ["", "", "", "", "", "", "Expenses", -spent],
    ["", "", "", "", "", "", "Net income", round2(collected - spent)],
  ]);

  const print = () => {
    const rows = (pairs: readonly (readonly [string, number | string])[]) =>
      pairs.map(([k, v]) => `<Row><Cell>${escapeHtml(String(k))}</Cell><Cell class="n">${typeof v === "number" ? escapeHtml(fmt(v)) : escapeHtml(v)}</Cell></Row>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>StoneWood report · ${escapeHtml(label)}</title>
<style>body{font:13px/1.5 system-ui,sans-serif;color:#222;margin:32px}h1{font:400 26px Georgia,serif;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
table{border-collapse:collapse;width:100%}td,th{padding:4px 6px;border-bottom:1px solid #eee;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.muted{color:#777}</style></head><body>
<h1>StoneWood Garden Private Pool</h1><div class="muted">Sales and bookings report · ${escapeHtml(label)} · generated ${escapeHtml(fmtDate(today))}</div>
<h2>Summary</h2><table>${rows([["Money received", collected], ["Expenses", spent], ["Net income", round2(collected - spent)], ["Still owed on these bookings", owed]])}</table>
<div class="grid"><div><h2>Received by type</h2><table>${rows(byType.filter(([, v]) => v > 0))}</table>
<h2>Received by method</h2><table>${rows(byMethod.filter(([, v]) => v !== 0))}</table></div>
<div><h2>Expenses by category</h2><table>${byCat.length ? rows(byCat) : "<Row><Cell class='muted'>None</Cell></Row>"}</table>
<h2>Bookings</h2><table>${rows([["Total bookings", String(bks.length)], ["Guests (not cancelled)", String(guests)], ...statusCount.map(([s, n]) => [s, String(n)] as const)])}</table></div></div>
<h2>Payments</h2><table><Row><th>Date</th><th>Booking</th><th>Guest</th><th>Type</th><th>Method</th><th class="n">Amount</th></Row>
${pays.map((p) => `<Row><Cell>${escapeHtml(manilaDate(p.receivedAt))}</Cell><Cell>${escapeHtml(p.bookingId ?? "")}</Cell><Cell>${escapeHtml(p.guestName)}</Cell><Cell>${p.type}</Cell><Cell>${p.method}</Cell><Cell class="n">${escapeHtml((p.type === "Refund" ? "−" : "") + fmt(p.amount))}</Cell></Row>`).join("") || "<Row><Cell class='muted' colspan='6'>No payments in this period.</Cell></Row>"}</table>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  const sel = { ...inp, padding: "8px 10px", width: "auto" } as const;

  return (
    <div>
      <PageHead title="Reports" mob={mob} subtitle={`Summary for ${label}.`}
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn icon="download" onClick={exportMoney}>Sales CSV</Btn>
          <Btn icon="download" onClick={exportBookings}>Bookings CSV</Btn>
          <Btn kind="primary" icon="printer" onClick={print}>Print report</Btn>
        </div>} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ width: 280 }}>
          <Segmented value={period} onChange={setPeriod} size="sm" options={[
            { value: "Month", label: "Month" }, { value: "Year", label: "Year" }, { value: "Custom", label: "Custom" },
          ]} />
        </div>
        {period === "Month" && <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" style={sel} />}
        {period === "Year" && (
          <NativeSelect value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" style={sel}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </NativeSelect>
        )}
        {period === "Custom" && <>
          <Input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} aria-label="From" style={sel} />
          <span style={{ color: C.textS, fontSize: 13 }}>to</span>
          <Input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} aria-label="To" style={sel} />
        </>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <Figure label="Money received" value={fmt(collected)} note={`${pays.length} payment${pays.length === 1 ? "" : "s"}`} color="#2e9e4e" />
        <Figure label="Expenses" value={fmt(spent)} note={`${exps.length} expense${exps.length === 1 ? "" : "s"}`} />
        <Figure label="Net income" value={fmt(round2(collected - spent))} color={collected - spent < 0 ? "#d44" : gold} />
        <Figure label="Still owed" value={fmt(owed)} note="on bookings in this period" color={owed > 0 ? "#d4a800" : undefined} />
      </div>

      <Panel title={period === "Year" ? `Money received per month (${year})` : "Money received per day"} style={{ marginBottom: 18 }}>
        <BarChart data={series.map((s) => ({ label: s.label, value: s.money }))} color="#4caf50" height={210} mob={mob}
          formatValue={(v) => (v >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : `₱${v}`)} />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Received by type</div>
          {byType.map(([t, v]) => <Line key={t} label={t} value={`${t === "Refund" && v > 0 ? "−" : ""}${fmt(v)}`} />)}
        </div>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Received by method</div>
          {byMethod.map(([m, v]) => <Line key={m} label={m} value={fmt(v)} />)}
        </div>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Expenses by category</div>
          {byCat.map(([c, v]) => <Line key={c} label={c} value={fmt(v)} />)}
          {byCat.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: "4px 0" }}>No expenses in this period.</p>}
        </div>
      </div>

      <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: "26px 0 12px" }}>Bookings and guests</h3>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <Figure label="Bookings" value={bks.length} note={`${kept.length} not cancelled`} />
        <Figure label="Guests" value={guests} />
        <Figure label="Walk-ins" value={kept.filter((b) => b.source === "Walk-In").length} />
        <Figure label="Cancellation rate" value={`${bks.length ? Math.round((statusCount[3][1] / bks.length) * 100) : 0}%`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Panel title="By status">
          {statusCount.map(([s, n]) => <ProgressRow key={s} label={s} value={n} pct={bks.length ? Math.round((n / bks.length) * 100) : 0} color={gold} />)}
        </Panel>
        <Panel title="By slot">
          {slotCount.map(([s, n]) => <ProgressRow key={s} label={`${SLOTS[s].label} (${SLOTS[s].hours})`} value={n} pct={kept.length ? Math.round((n / kept.length) * 100) : 0} color={gold} />)}
        </Panel>
      </div>
      <Panel title={period === "Year" ? `Guests per month (${year})` : "Guests per day"}>
        <BarChart data={series.map((s) => ({ label: s.label, value: s.guests }))} color={gold} height={190} mob={mob} />
      </Panel>
    </div>
  );
}
