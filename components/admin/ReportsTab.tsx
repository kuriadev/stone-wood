"use client";

// ── Reports (reports generation, from the capstone title)
//
// Printable and exportable summaries for any month, year or custom range.
// Money figures come from the payments and expenses ledgers — the same
// numbers Sales shows — so a printed report always agrees with the screen.
// Booking figures (counts, guests, slots) are by visit date. This replaces
// both the old Reports tab, which counted booking totals as revenue, and
// the separate Analytics tab, whose charts now live at the bottom here.

import { Icon, type IconName } from "@/components/common/Icon";
import "./Reports.css";
import { useToast } from "@/contexts/ToastContext";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusLabel, bookingStatusLabel, payTypeLabel, payMethodLabel, adminTabLabel, NO_SHOW, statusKey, isNoShow } from "@/lib/labels";
import { useMemo, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useApp } from "@/contexts/AppContext";
import { downloadWorkbook } from "@/lib/excelReport";
import type { StockMovement } from "@/types/tasks";
import {
  bookingMoney, manilaDate, manilaTime, monthRange, livePayments, liveExpenses, signedAmount, round2, downloadCsv,
} from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot, holdsDate, bookingEndDate, stayRange, bookingCoversDate } from "@/lib/utils";
import { packageAvailed } from "@/lib/pricing";
import { SLOTS } from "@/lib/resort";
import { escapeHtml } from "@/lib/escapeHtml";
import { EXPENSE_CATEGORIES, type PaymentType } from "@/types/finance";
import type { Booking, BookingSlot } from "@/types/booking";
import type { Room } from "@/types/room";
import { gold } from "@/lib/styles";
import { BarChart } from "@/components/admin/charts";
import { AdminPageHeader, ChoiceButtons, useAdminStyle, FullSelect } from "@/components/admin/ui";
import { dayjs, DATE_FMT } from "@/lib/dayjs";
import { DateField } from "@/components/common/DateField";

type Period = "Month" | "Year" | "Custom";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ReportsTab({ bookings, rooms, mob }: { bookings: Booking[]; rooms: Room[]; mob: boolean }) {
  const { C, inp, cBg, cBr } = useAdminStyle();
  const ops = useOps();
  const { inventory } = useApp();
  const today = manilaDate();

  const [period, setPeriod] = useState<Period>("Month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [cFrom, setCFrom] = useState(monthRange(today).from);
  const [cTo, setCTo] = useState(today);
  // Filters: which bookings count (and the payments made on them), and
  // whether each figure is compared with the period before.
  const [source, setSource] = useState<"All" | "Online" | "Walk-In">("All");
  const [compare, setCompare] = useState(true);
  const [view, setView] = useState<"Overview" | "Money" | "Bookings">("Overview");
  const [showPeriod, setShowPeriod] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  const { from, to, label: periodLabel } = useMemo(() => {
    if (period === "Month") {
      const r = monthRange(`${month}-01`);
      return { ...r, label: dayjs(`${month}-01`, DATE_FMT, true).format("MMMM YYYY") };
    }
    if (period === "Year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: year };
    return { from: cFrom, to: cTo, label: `${fmtDate(cFrom)} – ${fmtDate(cTo)}` };
  }, [period, month, year, cFrom, cTo]);
  const sourceNote = source === "All" ? "" : source === "Walk-In" ? "Walk-ins only" : "Online only";
  const label = sourceNote ? `${periodLabel} · ${sourceNote}` : periodLabel;

  // The period before, the same length: last month, last year, or the same
  // number of days just before a custom range.
  const prevRange = useMemo(() => {
    const f = dayjs(from, DATE_FMT, true), t = dayjs(to, DATE_FMT, true);
    if (period === "Month") {
      const p = f.subtract(1, "month");
      return { ...monthRange(p.format(DATE_FMT)), label: p.format("MMMM YYYY") };
    }
    if (period === "Year") { const y = String(Number(year) - 1); return { from: `${y}-01-01`, to: `${y}-12-31`, label: y }; }
    const days = Math.max(1, t.diff(f, "day") + 1);
    const pt = f.subtract(1, "day"), pf = pt.subtract(days - 1, "day");
    return { from: pf.format(DATE_FMT), to: pt.format(DATE_FMT), label: `${fmtDate(pf.format(DATE_FMT))} – ${fmtDate(pt.format(DATE_FMT))}` };
  }, [period, year, from, to]);

  // Years that have any data, plus this one.
  const years = useMemo(() => {
    const ys = new Set<string>([today.slice(0, 4)]);
    bookings.forEach((b) => b.date && ys.add(b.date.slice(0, 4)));
    ops.payments.forEach((p) => ys.add(manilaDate(p.receivedAt).slice(0, 4)));
    return [...ys].sort().reverse();
  }, [bookings, ops.payments, today]);

  // The source filter: a booking is a walk-in or it came online; a payment
  // follows the booking it was made on (one with no booking counts only
  // under All). Expenses belong to the resort, not to a booking, so they
  // are never filtered.
  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const srcOk = (b: Booking) => source === "All" || (source === "Walk-In" ? b.source === "Walk-In" : b.source !== "Walk-In");
  const payOk = (p: { bookingId: string | null }) => {
    if (source === "All") return true;
    const b = p.bookingId ? bookingById.get(p.bookingId) : undefined;
    return !!b && srcOk(b);
  };
  /** Everything a period's figures are made from. */
  const slice = (f: string, t: string) => {
    const inR = (d: string) => d >= f && d <= t;
    const sp = livePayments(ops.payments).filter((p) => inR(manilaDate(p.receivedAt)) && payOk(p));
    const se = liveExpenses(ops.expenses).filter((e) => inR(e.spentOn));
    const sb = bookings.filter((b) => !b.id.startsWith("TMP-") && b.date && inR(b.date) && srcOk(b));
    return { pays: sp, exps: se, bks: sb, kept: sb.filter(holdsDate) };
  };
  const { pays, exps, bks, kept } = slice(from, to);
  /** The headline figures for one period. */
  const figures = (x: ReturnType<typeof slice>) => {
    const got = round2(x.pays.reduce((n, p) => n + signedAmount(p), 0));
    const out = round2(x.exps.reduce((n, e) => n + e.amount, 0));
    // A no-show is stored as Cancelled; it is counted on its own.
    const noShows = x.bks.filter(isNoShow).length;
    const cancelled = x.bks.filter((b) => b.status === "Cancelled").length - noShows;
    return {
      collected: got, payments: x.pays.length, spent: out, expenses: x.exps.length, net: round2(got - out),
      owed: round2(x.kept.reduce((n, b) => n + bookingMoney(b, ops.payments, ops.damages).due, 0)),
      bookings: x.bks.length, kept: x.kept.length, guests: x.kept.reduce((n, b) => n + b.guests, 0),
      walkins: x.kept.filter((b) => b.source === "Walk-In").length,
      cancelRate: x.bks.length ? Math.round((cancelled / x.bks.length) * 100) : 0,
      noShowRate: x.bks.length ? Math.round((noShows / x.bks.length) * 100) : 0,
    };
  };
  const now = figures({ pays, exps, bks, kept });
  const before = figures(slice(prevRange.from, prevRange.to));

  const collected = round2(pays.reduce((s, p) => s + signedAmount(p), 0));
  const spent = round2(exps.reduce((s, e) => s + e.amount, 0));
  const owed = round2(kept.reduce((s, b) => s + bookingMoney(b, ops.payments, ops.damages).due, 0));
  // The resort takes two ways to pay: QR Ph (the online checkout, recorded
  // as "PayMongo") and cash at the desk. Anything older that was entered as
  // GCash or Bank Transfer is shown as one "Other" line, and only when it is
  // not zero, so the two methods still add up to Money received.
  const methodTotal = (match: (m: string) => boolean) =>
    round2(pays.filter((p) => match(p.method)).reduce((s, p) => s + signedAmount(p), 0));
  const otherMethods = methodTotal((m) => m !== "PayMongo" && m !== "Cash");
  const byMethod: (readonly [string, number])[] = [
    ["QR Ph", methodTotal((m) => m === "PayMongo")],
    ["Cash", methodTotal((m) => m === "Cash")],
    ...(otherMethods !== 0 ? [["Other (GCash, bank)", otherMethods] as const] : []),
  ];

  // Summary: what came in, by what it paid for. Zero rows are left out, so
  // only the lines that carry money this period are listed; the total last.
  const typeTotal = (t: PaymentType) => round2(pays.filter((p) => p.type === t).reduce((s, p) => s + p.amount, 0));
  const summary = ([
    ["Down payments", typeTotal("Downpayment")],
    ["Balances", typeTotal("Balance")],
    ["Paid in full", typeTotal("Full")],
    ["Penalties", typeTotal("Penalty")],
    ["Refunds", -typeTotal("Refund")],
  ] as const).filter(([, v]) => v !== 0);
  const byCat = EXPENSE_CATEGORIES.map((c) => [c, round2(exps.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0))] as const).filter(([, v]) => v > 0);
  const statusCount = (["Pending", "Confirmed", "Completed", "Cancelled", NO_SHOW, "ResortCancelled"] as const).map((s) => [s, bks.filter((b) => statusKey(b) === s).length] as const);
  const guests = kept.reduce((s, b) => s + b.guests, 0);
  const slotCount = (["Day", "Night", "WholeDay"] as BookingSlot[]).map((s) => [s, kept.filter((b) => getBookingSlot(b) === s).length] as const);

  // Chart: per month for a year, per day otherwise.
  const series = useMemo(() => {
    if (period === "Year") {
      return MONTHS.map((m, i) => {
        const r = monthRange(`${year}-${String(i + 1).padStart(2, "0")}-01`);
        const money = livePayments(ops.payments).filter((p) => { const d = manilaDate(p.receivedAt); return d >= r.from && d <= r.to && payOk(p); }).reduce((s, p) => s + signedAmount(p), 0);
        const spentM = liveExpenses(ops.expenses).filter((e) => e.spentOn >= r.from && e.spentOn <= r.to).reduce((s, e) => s + e.amount, 0);
        const count = bookings.filter((b) => holdsDate(b) && srcOk(b) && b.date >= r.from && b.date <= r.to);
        return { label: m, date: r.from, money: round2(money), spent: round2(spentM), bookings: count.length, guests: count.reduce((s, b) => s + b.guests, 0) };
      });
    }
    const out: { label: string; date: string; money: number; spent: number; bookings: number; guests: number }[] = [];
    // Was a mutable Date advanced in the loop header. dayjs is immutable, so
    // each step produces a new value and the cursor cannot be clobbered.
    const end = dayjs(to, DATE_FMT, true);
    for (let d = dayjs(from, DATE_FMT, true), n = 0; !d.isAfter(end, "day") && n < 93; d = d.add(1, "day"), n++) {
      const ds = d.format(DATE_FMT);
      const money = pays.filter((p) => manilaDate(p.receivedAt) === ds).reduce((s, p) => s + signedAmount(p), 0);
      // Groups at the resort that day: a three-day stay counts on all three.
      const count = kept.filter((b) => bookingCoversDate(b, ds));
      const spentD = exps.filter((e) => e.spentOn === ds).reduce((s, e) => s + e.amount, 0);
      out.push({ label: String(d.date()), date: ds, money: round2(money), spent: round2(spentD), bookings: count.length, guests: count.reduce((s, b) => s + b.guests, 0) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payOk/srcOk follow `source`
  }, [period, year, from, to, ops.payments, ops.expenses, bookings, pays, exps, kept, source]);

  const fileTag = label.replace(/[^\w]+/g, "_");
  const roomNames = (b: Booking) => (b.rooms || []).map((id) => rooms.find((r) => r.id === id)?.name ?? `#${id}`).join(" | ") || "None";

  const exportBookings = () => downloadCsv(`StoneWood_Bookings_${fileTag}.csv`, [
    ["Booking ID", "Guest", "Contact", "Email", "Date", "Last day", "Slot", "Package", "Source", "Guests", "Rooms", "Total (PHP)", "Paid (PHP)", "Penalties (PHP)", "Owed (PHP)", "Status", "Notes"],
    ...bks.map((b) => {
      const m = bookingMoney(b, ops.payments, ops.damages);
      return [b.id, b.name, b.contact, b.email, b.date, bookingEndDate(b), SLOTS[getBookingSlot(b)].label, packageAvailed(b), b.source ?? "Online", b.guests, roomNames(b),
        b.total, m.paid, m.penaltyTotal, m.due, b.status, b.notes];
    }),
    [],
    ["Summary", label],
    ["Bookings", bks.length], ["Guests (not cancelled)", guests],
    ...statusCount.map(([s, n]) => [statusLabel(s), n]),
  ]);

  const exportMoney = () => downloadCsv(`StoneWood_Sales_${fileTag}.csv`, [
    ["Date", "Time", "Booking", "Guest", "Type", "Payment method", "Reference", "Amount (PHP)"],
    ...pays.map((p) => [manilaDate(p.receivedAt), manilaTime(p.receivedAt), p.bookingId ?? "", p.guestName, p.type, p.method, p.reference, signedAmount(p)]),
    [],
    ["Date", "Category", "Description", "Payment method", "", "", "", "Amount (PHP)"],
    ...exps.map((e) => [e.spentOn, e.category, e.description, e.method, "", "", "", -e.amount]),
    [],
    ["", "", "", "", "", "", "Money received", collected],
    ["", "", "", "", "", "", "Expenses", -spent],
    ["", "", "", "", "", "", "Net income", round2(collected - spent)],
  ]);

  const print = () => {
    const rows = (pairs: readonly (readonly [string, number | string])[]) =>
      pairs.map(([k, v]) => `<tr><td>${escapeHtml(String(k))}</td><td class="n">${typeof v === "number" ? escapeHtml(fmt(v)) : escapeHtml(v)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>StoneWood report · ${escapeHtml(label)}</title>
<style>body{font:13px/1.5 system-ui,sans-serif;color:#2a2a2a;margin:32px}h1{font:400 26px Georgia,serif;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
table{border-collapse:collapse;width:100%}td,th{padding:4px 6px;border-bottom:1px solid #eee;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.muted{color:#777}</style></head><body>
<h1>StoneWood Garden Private Pool</h1><div class="muted">Sales and bookings report · ${escapeHtml(label)} · generated ${escapeHtml(fmtDate(today))}</div>
<h2>Summary</h2><table>${rows([["Money received", collected], ["Expenses", spent], ["Net income", round2(collected - spent)], ["Still owed on these bookings", owed]])}</table>
<div class="grid"><div><h2>Received</h2><table>${rows([...summary, ["Total received", collected]])}</table>
<h2>Payment Method</h2><table>${rows(byMethod)}</table></div>
<div><h2>Expenses by category</h2><table>${byCat.length ? rows(byCat) : "<tr><td class='muted'>None</td></tr>"}</table>
<h2>Bookings</h2><table>${rows([["Total bookings", String(bks.length)], ["Guests (not cancelled)", String(guests)], ...statusCount.map(([s, n]) => [statusLabel(s), String(n)] as const)])}</table></div></div>
<h2>Reservations (${bks.length})</h2><table><tr><th>Booking</th><th>Guest</th><th>Contact</th><th>Date</th><th>Time</th><th>Package</th><th class="n">Guests</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Owed</th><th>Status</th></tr>
${bks.map((b) => {
      const m = bookingMoney(b, ops.payments, ops.damages);
      return `<tr><td>${escapeHtml(b.id)}</td><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.contact)}</td><td>${escapeHtml(stayRange(b))}</td><td>${escapeHtml(SLOTS[getBookingSlot(b)].label)}</td><td>${escapeHtml(packageAvailed(b))}</td><td class="n">${b.guests}</td><td class="n">${escapeHtml(fmt(b.total))}</td><td class="n">${escapeHtml(fmt(m.paid))}</td><td class="n">${escapeHtml(fmt(m.due))}</td><td>${escapeHtml(bookingStatusLabel(b))}</td></tr>`;
    }).join("") || "<tr><td class='muted' colspan='11'>No reservations in this period.</td></tr>"}
${bks.length ? `<tr><td colspan="7"><strong>Totals</strong></td><td class="n"><strong>${escapeHtml(fmt(round2(bks.reduce((n, b) => n + b.total, 0))))}</strong></td><td class="n"><strong>${escapeHtml(fmt(round2(bks.reduce((n, b) => n + bookingMoney(b, ops.payments, ops.damages).paid, 0))))}</strong></td><td class="n"><strong>${escapeHtml(fmt(round2(bks.reduce((n, b) => n + bookingMoney(b, ops.payments, ops.damages).due, 0))))}</strong></td><td></td></tr>` : ""}</table>
<h2>Payments</h2><table><tr><th>Date</th><th>Booking</th><th>Guest</th><th>Type</th><th>Method</th><th class="n">Amount</th></tr>
${pays.map((p) => `<tr><td>${escapeHtml(manilaDate(p.receivedAt))}</td><td>${escapeHtml(p.bookingId ?? "")}</td><td>${escapeHtml(p.guestName)}</td><td>${escapeHtml(payTypeLabel(p.type))}</td><td>${escapeHtml(payMethodLabel(p.method))}</td><td class="n">${escapeHtml((p.type === "Refund" ? "−" : "") + fmt(p.amount))}</td></tr>`).join("") || "<tr><td class='muted' colspan='6'>No payments in this period.</td></tr>"}</table>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* One workbook for the accountant: a sheet per table, pesos formatted as
     money (lib/excelReport.ts). Stock movements for the period come along,
     so the supplies bought and used sit next to the money spent on them. */
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const mv = await fetch(`/api/inventory/movements?since=${from}&limit=300`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => null) as { movements?: StockMovement[] } | null;
      const moves = (mv?.movements ?? []).filter((m) => manilaDate(m.at) <= to);
      const itemName = (id: number) => inventory.find((i) => i.id === id);
      await downloadWorkbook(`StoneWood_Report_${fileTag}`, `StoneWood report · ${label}`, [
        {
          name: "Summary",
          columns: [{ header: "What", key: "k", width: 34 }, { header: "Amount", key: "v", width: 18, money: true }],
          rows: [
            { k: "Money received", v: collected },
            ...summary.map(([k, v]) => ({ k: `  ${k}`, v })),
            ...byMethod.map(([k, v]) => ({ k: `  by ${k}`, v })),
            { k: "Expenses", v: -spent },
            ...byCat.map(([k, v]) => ({ k: `  ${k}`, v: -v })),
            { k: "Net income", v: round2(collected - spent) },
            { k: "Still owed on these bookings", v: owed },
          ],
          footer: [["Period", label], ["Bookings", bks.length], ["Guests (not cancelled)", guests]],
        },
        {
          name: "Bookings",
          columns: [
            { header: "Booking", key: "id", width: 12 }, { header: "Guest", key: "name", width: 22 }, { header: "Contact", key: "contact", width: 15 },
            { header: "Email", key: "email", width: 24 }, { header: "First day", key: "date", width: 12 }, { header: "Last day", key: "end", width: 12 },
            { header: "Slot", key: "slot", width: 11 }, { header: "Package", key: "pkg", width: 26 }, { header: "Source", key: "src", width: 9 },
            { header: "Guests", key: "guests", width: 8 }, { header: "Rooms", key: "rooms", width: 18 },
            { header: "Total", key: "total", width: 12, money: true }, { header: "Paid", key: "paid", width: 12, money: true },
            { header: "Penalties", key: "pen", width: 12, money: true }, { header: "Owed", key: "due", width: 12, money: true },
            { header: "Status", key: "status", width: 16 },
          ],
          rows: bks.map((b) => {
            const m = bookingMoney(b, ops.payments, ops.damages);
            return {
              id: b.id, name: b.name, contact: b.contact, email: b.email, date: b.date, end: bookingEndDate(b),
              slot: SLOTS[getBookingSlot(b)].label, pkg: packageAvailed(b), src: b.source ?? "Online", guests: b.guests,
              rooms: roomNames(b), total: b.total, paid: m.paid, pen: m.penaltyTotal, due: m.due, status: bookingStatusLabel(b),
            };
          }),
        },
        {
          name: "Payments",
          columns: [
            { header: "Date", key: "d", width: 12 }, { header: "Time", key: "t", width: 9 }, { header: "Booking", key: "b", width: 12 },
            { header: "Guest", key: "g", width: 22 }, { header: "Type", key: "type", width: 14 }, { header: "Payment method", key: "m", width: 17 },
            { header: "Reference", key: "ref", width: 18 }, { header: "Amount", key: "amt", width: 13, money: true },
          ],
          rows: pays.map((p) => ({
            d: manilaDate(p.receivedAt), t: manilaTime(p.receivedAt), b: p.bookingId ?? "", g: p.guestName,
            type: payTypeLabel(p.type), m: payMethodLabel(p.method), ref: p.reference, amt: signedAmount(p),
          })),
          footer: [["Money received", collected]],
        },
        {
          name: "Expenses",
          columns: [
            { header: "Date", key: "d", width: 12 }, { header: "Category", key: "c", width: 18 }, { header: "Description", key: "desc", width: 36 },
            { header: "Payment method", key: "m", width: 17 }, { header: "Amount", key: "amt", width: 13, money: true },
          ],
          rows: exps.map((e) => ({ d: e.spentOn, c: e.category, desc: e.description, m: e.method, amt: e.amount })),
          footer: [["Expenses", spent]],
        },
        {
          name: "Stock",
          columns: [
            { header: "When", key: "d", width: 17 }, { header: "Item", key: "item", width: 24 }, { header: "Change", key: "delta", width: 9 },
            { header: "Unit", key: "unit", width: 8 }, { header: "Why", key: "why", width: 12 }, { header: "Note", key: "note", width: 30 },
            { header: "Who", key: "who", width: 16 }, { header: "Cost each", key: "cost", width: 12, money: true },
          ],
          rows: moves.map((m) => ({
            d: `${manilaDate(m.at)} ${manilaTime(m.at)}`, item: itemName(m.itemId)?.name ?? `#${m.itemId}`, delta: m.delta,
            unit: itemName(m.itemId)?.unit ?? "", why: m.reason, note: m.note, who: m.staffName ?? "", cost: m.unitCost,
          })),
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  const sel = { ...inp, padding: "8px 12px", width: "auto" } as const;

  // ── The pieces the page is built from (Reports.css) ──
  /** "↗ 12%" against the period before. Green when it moved the good way,
   *  red when the bad way; the arrow says which way it moved. */
  const delta = (cur: number, prev: number, up = true) => {
    if (cur === prev) return <span className="sw-rep__delta is-flat">— 0%</span>;
    if (prev === 0) return <span className={`sw-rep__delta ${(cur > 0) === up ? "is-good" : "is-bad"}`}>{cur > 0 ? "↗ New" : "↘ New"}</span>;
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    const rising = pct > 0;
    const shown = Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)).toLocaleString() : Math.abs(pct).toFixed(1).replace(/\.0$/, "");
    return <span className={`sw-rep__delta ${rising === up ? "is-good" : "is-bad"}`} title={`Was ${prev.toLocaleString()}`}>{rising ? "↗" : "↘"} {shown}%</span>;
  };
  /** A small line of the figure across the period. */
  const spark = (vals: number[], color: string) => {
    const W = 96, H = 34, max = Math.max(...vals), min = Math.min(...vals, 0), span = max - min || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)] as const);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const id = `sp${color.replace(/[^a-z0-9]/gi, "")}${vals.length}`;
    return (
      <svg className="sw-rep__spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };
  /** Share: the period's headline figures as text, to a chat or the clipboard. */
  const share = async () => {
    const text = [
      `StoneWood report · ${label}`,
      `Money received: ${fmt(now.collected)} (${now.payments} payments)`,
      `Expenses: ${fmt(now.spent)}`,
      `Net income: ${fmt(now.net)}`,
      `Still owed: ${fmt(now.owed)}`,
      `Bookings: ${now.bookings} (${now.kept} not cancelled) · Guests: ${now.guests} · Walk-ins: ${now.walkins}`,
      `Cancellation rate: ${now.cancelRate}%`,
    ].join("\n");
    try {
      if (typeof navigator.share === "function" && mob) { await navigator.share({ title: `StoneWood report · ${label}`, text }); return; }
      await navigator.clipboard.writeText(text);
      toast("Report summary copied. Paste it into a chat or email.", "success");
    } catch {
      toast("Could not share from this browser. Use ••• to export instead.", "error");
    }
  };
  const SLOT_ICON: Record<BookingSlot, IconName> = { Day: "sun", Night: "moon", WholeDay: "staycation" };
  /** A section heading: an icon, the name, and one line on what it is for. */
  const section = (icon: IconName, title: string, hint: string) => (
    <div className="sw-rep__section">
      <span className="sw-rep__sicon" aria-hidden><Icon name={icon} size={16} /></span>
      <div>
        <h3 style={{ color: C.textH }}>{title}</h3>
        <p style={{ color: C.textS }}>{hint}</p>
      </div>
    </div>
  );
  /** A headline figure. The colour is on the icon and the edge, never the
   *  number, so the figures read alike and the label says what each is. */
  const kpi = ({ icon, label, value, note, accent, meter, cur, prev, up = true, trend }: {
    icon: IconName; label: string; value: string; note?: string; accent: string;
    meter?: { pct: number; text: string };
    /** This period and the one before, for the change. */
    cur?: number; prev?: number; up?: boolean;
    /** The figure across the period, drawn small. */
    trend?: number[];
  }) => (
    <div className="sw-rep__kpi" style={{ background: cBg, borderColor: cBr, ["--acc" as string]: accent }}>
      <div className="sw-rep__kpitop">
        <span style={{ color: C.textS }}>{label}</span>
        <span className="sw-rep__kpiicon" aria-hidden><Icon name={icon} size={15} /></span>
      </div>
      <div className="sw-rep__kpimid">
        <div className="sw-rep__kpival" style={{ color: C.textH }}>{value}</div>
        {trend && trend.length > 1 && spark(trend, accent)}
      </div>
      {compare && cur !== undefined && prev !== undefined && (
        <div className="sw-rep__vs" style={{ color: C.textS }}>{delta(cur, prev, up)} <span>vs {prevRange.label}</span></div>
      )}
      {meter && (
        <div className="sw-rep__meter" title={meter.text}>
          <i style={{ width: `${Math.min(100, Math.max(0, meter.pct * 100))}%` }} />
        </div>
      )}
      {(meter || note) && <div className="sw-rep__kpinote" style={{ color: C.textS }}>{meter ? meter.text : note}</div>}
    </div>
  );
  /** A money breakdown: each line with its share of the whole as a bar. */
  const breakdown = ({ icon, title, hint, rows, empty, total }: {
    icon: IconName; title: string; hint: string;
    rows: readonly (readonly [string, number, string])[];
    empty?: string; total?: [string, string];
  }) => {
    const whole = rows.reduce((t, [, v]) => t + Math.abs(v), 0);
    return (
      <div className="sw-rep__card" style={{ background: cBg, borderColor: cBr }}>
        <div className="sw-rep__cardhead">
          <span className="sw-rep__sicon is-sm" aria-hidden><Icon name={icon} size={14} /></span>
          <div><h4 style={{ color: C.textH }}>{title}</h4><p style={{ color: C.textS }}>{hint}</p></div>
        </div>
        {rows.length === 0 && empty && <p className="sw-rep__empty" style={{ color: C.textS }}>{empty}</p>}
        {rows.map(([l, v, shown]) => {
          const share = whole ? Math.abs(v) / whole : 0;
          return (
            <div key={l} className="sw-rep__line" title={`${l}: ${shown} · ${Math.round(share * 100)}%`}>
              <div className="sw-rep__linetop">
                <span style={{ color: C.textB }}>{l}</span>
                <span className="sw-rep__pct" style={{ color: C.textS }}>{Math.round(share * 100)}%</span>
                <strong style={{ color: C.textH }}>{shown}</strong>
              </div>
              <div className="sw-rep__meter"><i style={{ width: `${share * 100}%` }} /></div>
            </div>
          );
        })}
        {total && (
          <div className="sw-rep__total" style={{ borderColor: cBr }}>
            <span style={{ color: C.textH }}>{total[0]}</span>
            <strong style={{ color: C.textH }}>{total[1]}</strong>
          </div>
        )}
      </div>
    );
  };
  /** A count split (by status, by slot): each row's share of the whole. */
  const dist = (title: string, icon: IconName, rows: { label: string; sub?: string; icon?: IconName; n: number; pct: number }[]) => (
    <div className="sw-rep__card" style={{ background: cBg, borderColor: cBr }}>
      <div className="sw-rep__cardhead">
        <span className="sw-rep__sicon is-sm" aria-hidden><Icon name={icon} size={14} /></span>
        <div><h4 style={{ color: C.textH }}>{title}</h4></div>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="sw-rep__line" title={`${r.label}: ${r.n} · ${r.pct}%`}>
          <div className="sw-rep__linetop">
            <span style={{ color: C.textB, display: "inline-flex", alignItems: "center", gap: 7 }}>
              {r.icon && <Icon name={r.icon} size={14} style={{ color: C.goldInk }} />}
              {r.label}{r.sub && <small style={{ color: C.textS }}>{r.sub}</small>}
            </span>
            <span className="sw-rep__pct" style={{ color: C.textS }}>{r.pct}%</span>
            <strong style={{ color: C.textH }}>{r.n}</strong>
          </div>
          <div className="sw-rep__meter"><i style={{ width: `${r.pct}%` }} /></div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <AdminPageHeader title={adminTabLabel("Reports")} mob={mob}
        subtitle={`Activity from ${fmtDate(from)} – ${fmtDate(to)}${sourceNote ? ` · ${sourceNote}` : ""}`}
        action={
          <div className="sw-rep__actions">
            {/* The period on show, and what it is compared with. Opens and
                closes the period controls. */}
            <button type="button" className="sw-rep__btn sw-rep__datebtn" aria-expanded={showPeriod} onClick={() => setShowPeriod((v) => !v)}
              style={{ borderColor: cBr, color: C.textH }}>
              <Icon name="calendar" size={15} />
              <strong>{fmtDate(from)} – {fmtDate(to)}</strong>
              {compare && <small style={{ color: C.textS }}>vs {prevRange.label}</small>}
            </button>
            {/* "•••": the four ways out (Excel, the two CSVs, print / PDF). */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="sw-rep__btn is-icon" disabled={exporting} aria-label="Export or print this report" title="Export or print"
                  style={{ borderColor: cBr, color: C.textH }}>
                  <Icon name="more" size={17} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ minWidth: 230 }}>
                <DropdownMenuItem onSelect={() => void exportExcel()}><Icon name="download" />Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onSelect={exportMoney}><Icon name="download" />Sales CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={exportBookings}><Icon name="download" />Bookings CSV</DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* The print view's own "Save as PDF" makes the PDF: the same
                    report, laid out for paper. */}
                <DropdownMenuItem onSelect={print}><Icon name="printer" />Print / Save as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" className="sw-rep__btn" onClick={() => void share()} style={{ borderColor: cBr, color: C.textH }}>
              <Icon name="upload" size={15} /> Share
            </button>
            <button type="button" className={`sw-rep__btn${showFilters || source !== "All" ? " is-on" : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}
              style={{ borderColor: cBr, color: C.textH }}>
              <Icon name="filter" size={15} /> Filters{source !== "All" && <span className="sw-rep__badge">1</span>}
            </button>
          </div>
        } />

      {/* The period controls (Month / Year / Custom and the picker). */}
      {showPeriod && (
        <div className="sw-rep__bar" style={{ background: cBg, borderColor: cBr }}>
          <div style={{ width: 280, maxWidth: "100%" }}>
            <ChoiceButtons value={period} onChange={setPeriod} size="sm" options={[
              { value: "Month", label: "Month" }, { value: "Year", label: "Year" }, { value: "Custom", label: "Custom" },
            ]} />
          </div>
          {period === "Month" && <DateField mode="month" value={month} onChange={(v) => v && setMonth(v)} aria-label="Month" style={sel} />}
          {period === "Year" && (
            <FullSelect value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" style={sel}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </FullSelect>
          )}
          {period === "Custom" && <>
            <DateField value={cFrom} onChange={setCFrom} max={cTo || undefined} aria-label="From" placeholder="From" style={sel} />
            <span style={{ color: C.textS, fontSize: 13 }}>to</span>
            <DateField value={cTo} onChange={setCTo} min={cFrom || undefined} aria-label="To" placeholder="To" style={sel} />
          </>}
          <span className="sw-rep__range" style={{ color: C.textS, borderColor: cBr }}>
            <Icon name="history" size={13} /> Compared with {prevRange.label}
          </span>
        </div>
      )}

      {/* Filters: which bookings count, and the comparison. */}
      {showFilters && (
        <div className="sw-rep__bar" style={{ background: cBg, borderColor: cBr }}>
          <span className="sw-rep__barlabel" style={{ color: C.textS }}>Bookings from</span>
          <div style={{ width: 300, maxWidth: "100%" }}>
            <ChoiceButtons value={source} onChange={setSource} size="sm" options={[
              { value: "All", label: "All" }, { value: "Online", label: "Online" }, { value: "Walk-In", label: "Walk-in" },
            ]} />
          </div>
          <label className="sw-rep__check" style={{ color: C.textH }}>
            <Checkbox checked={compare} onCheckedChange={(v) => setCompare(v === true)} /> Compare with the period before
          </label>
          {source !== "All" && (
            <span className="sw-rep__range" style={{ color: C.textS, borderColor: cBr }}>
              <Icon name="info" size={13} /> Payments follow their booking; expenses always count.
            </span>
          )}
        </div>
      )}

      {/* Overview shows everything; Money and Bookings show their half. */}
      <div className="sw-rep__tabs" role="tablist" aria-label="Report sections" style={{ borderColor: cBr }}>
        {(["Overview", "Money", "Bookings"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={view === t} className={view === t ? "is-on" : undefined}
            onClick={() => setView(t)} style={{ color: view === t ? C.goldInk : C.textS }}>
            <Icon name={t === "Overview" ? "grid" : t === "Money" ? "cash" : "calendar"} size={15} /> {t}
          </button>
        ))}
      </div>

      {view === "Overview" && (
        <>
          {/* Performance summary: the four figures that tell the period. */}
          <div className="sw-rep__summary" style={{ background: cBg, borderColor: cBr }}>
            <div className="sw-rep__summaryhead" style={{ borderColor: cBr }}>
              <div>
                <h3 style={{ color: C.textH }}>Performance Summary</h3>
                <p style={{ color: C.textS }}>The key figures for {periodLabel}{compare ? `, against ${prevRange.label}` : ""}.</p>
              </div>
              <button type="button" className="sw-rep__btn is-icon" title="See every figure in a table" aria-label="Go to the full table"
                onClick={() => document.getElementById("sw-rep-table")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ borderColor: cBr, color: C.textS }}>
                <Icon name="grid" size={16} />
              </button>
            </div>
            <div className="sw-rep__summarygrid" style={{ gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,minmax(0,1fr))" }}>
              {([
                ["Money received", fmt(now.collected), now.collected, before.collected, true],
                ["Net income", fmt(now.net), now.net, before.net, true],
                ["Bookings", String(now.bookings), now.bookings, before.bookings, true],
                ["Guests", String(now.guests), now.guests, before.guests, true],
              ] as const).map(([l, v, cur, prev, up]) => (
                <div key={l} className="sw-rep__summarycell" style={{ borderColor: cBr }}>
                  <span className="sw-rep__dotted" style={{ color: C.textS }}>{l}</span>
                  <div className="sw-rep__bigline">
                    <strong style={{ color: C.textH }}>{v}</strong>
                    {compare && delta(cur, prev, up)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {(view === "Overview" || view === "Money") && <>
      {/* ── Money ── */}
      {section("cash", "Financial Overview", "What came in, what went out, and what is still owed.")}
      <div className="sw-rep__kpis" style={{ gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,minmax(0,1fr))" }}>
        {kpi({ icon: "cash", label: "Money received", value: fmt(collected), note: `${pays.length} payment${pays.length === 1 ? "" : "s"}`, accent: "#2e9e4e", cur: now.collected, prev: before.collected, trend: series.map((x) => x.money) })}
        {kpi({ icon: "receipt", label: "Expenses", value: fmt(spent), note: `${exps.length} expense${exps.length === 1 ? "" : "s"}`, accent: "#9a8f80", cur: now.spent, prev: before.spent, up: false, trend: series.map((x) => x.spent),
          meter: collected > 0 ? { pct: spent / collected, text: `${Math.round((spent / collected) * 100)}% of money received` } : undefined })}
        {kpi({ icon: "trending-up", label: "Net income", value: fmt(round2(collected - spent)), accent: collected - spent < 0 ? "#e5484d" : gold, cur: now.net, prev: before.net, trend: series.map((x) => round2(x.money - x.spent)),
          note: collected - spent < 0 ? "Spent more than came in" : undefined })}
        {kpi({ icon: "wallet", label: "Still owed", value: fmt(owed), note: "on bookings in this period", accent: owed > 0 ? "#f5a524" : "#9a8f80", cur: now.owed, prev: before.owed, up: false })}
      </div>

      {(() => {
        const peak = series.reduce<(typeof series)[number] | null>((m, x) => (x.money > (m?.money ?? 0) ? x : m), null);
        return (
          <div className="sw-rep__panel" style={{ background: cBg, borderColor: cBr }}>
            <div className="sw-rep__panelhead">
              <h4 style={{ color: C.textH }}><Icon name="bar-chart" size={15} style={{ color: C.goldInk }} />
                {period === "Year" ? `Money received per month (${year})` : "Money received per day"}</h4>
              <div className="sw-rep__chips">
                <span className="sw-rep__chip" style={{ borderColor: cBr, color: C.textS }}>Total <strong style={{ color: C.textH }}>{fmt(collected)}</strong></span>
                {compare && <span className="sw-rep__chip" style={{ borderColor: cBr, color: C.textS }}>{prevRange.label} <strong style={{ color: C.textH }}>{fmt(before.collected)}</strong> {delta(now.collected, before.collected)}</span>}
                {peak && <span className="sw-rep__chip" style={{ borderColor: cBr, color: C.textS }}>
                  Best {period === "Year" ? "month" : "day"} <strong style={{ color: C.textH }}>{period === "Year" ? peak.label : fmtDate(peak.date)} · {fmt(peak.money)}</strong>
                </span>}
              </div>
            </div>
            <BarChart data={series.map((x) => ({ label: x.label, value: x.money }))} color="#4caf50" height={210} mob={mob}
              formatValue={(v) => (v >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : `₱${v}`)} />
          </div>
        );
      })()}

      <div className="sw-rep__grid3" style={{ gridTemplateColumns: mob ? "1fr" : "repeat(3,minmax(0,1fr))" }}>
        {breakdown({
          icon: "receipt", title: "Summary", hint: "Money in, by what it paid for",
          rows: summary.map(([t, v]) => [t, v, v < 0 ? `−${fmt(-v)}` : fmt(v)] as const),
          empty: "No payments in this period.",
          total: ["Total received", fmt(collected)],
        })}
        {breakdown({
          icon: "wallet", title: "Payment Method", hint: "How guests paid",
          rows: byMethod.map(([m, v]) => [m, v, fmt(v)] as const),
        })}
        {breakdown({
          icon: "folder", title: "Expenses by category", hint: "Where the money went",
          rows: byCat.map(([c, v]) => [c, v, fmt(v)] as const),
          empty: "No expenses in this period.",
        })}
      </div>

      </>}

      {(view === "Overview" || view === "Bookings") && <>
      {/* ── Bookings ── */}
      {section("calendar", "Bookings and guests", "Who came, how they booked, and which tours.")}
      <div className="sw-rep__kpis" style={{ gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,minmax(0,1fr))" }}>
        {kpi({ icon: "calendar", label: "Bookings", value: String(bks.length), note: `${kept.length} not cancelled`, accent: gold, cur: now.bookings, prev: before.bookings, trend: series.map((x) => x.bookings) })}
        {kpi({ icon: "users", label: "Guests", value: String(guests), accent: gold, cur: now.guests, prev: before.guests, trend: series.map((x) => x.guests) })}
        {kpi({ icon: "log-in", label: "Walk-ins", value: String(kept.filter((b) => b.source === "Walk-In").length), accent: gold, cur: now.walkins, prev: before.walkins })}
        {kpi({ icon: "x", label: "Cancellation rate", value: `${bks.length ? Math.round((statusCount[3][1] / bks.length) * 100) : 0}%`, accent: "#9a8f80", cur: now.cancelRate, prev: before.cancelRate, up: false,
          meter: bks.length ? { pct: statusCount[3][1] / bks.length, text: `${statusCount[3][1]} of ${bks.length} bookings` } : undefined })}
      </div>
      <div className="sw-rep__grid2" style={{ gridTemplateColumns: mob ? "1fr" : "repeat(2,minmax(0,1fr))" }}>
        {dist("By status", "clipboard-check", statusCount.map(([st, n]) => ({
          label: statusLabel(st), n, pct: bks.length ? Math.round((n / bks.length) * 100) : 0,
        })))}
        {dist("By slot", "clock", slotCount.map(([sl, n]) => ({
          label: SLOTS[sl].label, sub: SLOTS[sl].hours, icon: SLOT_ICON[sl], n, pct: kept.length ? Math.round((n / kept.length) * 100) : 0,
        })))}
      </div>
      <div className="sw-rep__panel" style={{ background: cBg, borderColor: cBr }}>
        <div className="sw-rep__panelhead">
          <h4 style={{ color: C.textH }}><Icon name="users" size={15} style={{ color: C.goldInk }} />
            {period === "Year" ? `Guests per month (${year})` : "Guests per day"}</h4>
          <div className="sw-rep__chips">
            <span className="sw-rep__chip" style={{ borderColor: cBr, color: C.textS }}>Total <strong style={{ color: C.textH }}>{guests}</strong></span>
            {compare && <span className="sw-rep__chip" style={{ borderColor: cBr, color: C.textS }}>{prevRange.label} <strong style={{ color: C.textH }}>{before.guests}</strong> {delta(now.guests, before.guests)}</span>}
          </div>
        </div>
        <BarChart data={series.map((x) => ({ label: x.label, value: x.guests }))} color={gold} height={190} mob={mob} />
      </div>
      </>}

      {view === "Overview" && (
        /* Every figure in one table: this period, the one before, and the
           change. */
        <div id="sw-rep-table" className="sw-rep__table" style={{ background: cBg, borderColor: cBr }}>
          <div className="sw-rep__panelhead" style={{ padding: "16px 18px 6px" }}>
            <h4 style={{ color: C.textH }}><Icon name="clipboard" size={15} style={{ color: C.goldInk }} /> Report metrics</h4>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr style={{ color: C.textS, borderColor: cBr }}>
                  <th>Metric</th><th className="n">{periodLabel}</th>
                  {compare && <><th className="n">{prevRange.label}</th><th className="n">Change</th></>}
                </tr>
              </thead>
              <tbody>
                {([
                  ["Money received", now.collected, before.collected, fmt, true],
                  ["Payments", now.payments, before.payments, String, true],
                  ["Expenses", now.spent, before.spent, fmt, false],
                  ["Net income", now.net, before.net, fmt, true],
                  ["Still owed", now.owed, before.owed, fmt, false],
                  ["Bookings", now.bookings, before.bookings, String, true],
                  ["Not cancelled", now.kept, before.kept, String, true],
                  ["Guests", now.guests, before.guests, String, true],
                  ["Walk-ins", now.walkins, before.walkins, String, true],
                  ["Cancellation rate", now.cancelRate, before.cancelRate, (n: number) => `${n}%`, false],
                  ["No-show rate", now.noShowRate, before.noShowRate, (n: number) => `${n}%`, false],
                ] as const).map(([l, cur, prev, f, up]) => (
                  <tr key={l} style={{ borderColor: cBr }}>
                    <td style={{ color: C.textH }}>{l}</td>
                    <td className="n" style={{ color: C.textH }}><strong>{(f as (n: number) => string)(cur)}</strong></td>
                    {compare && <>
                      <td className="n" style={{ color: C.textS }}>{(f as (n: number) => string)(prev)}</td>
                      <td className="n">{delta(cur, prev, up)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
