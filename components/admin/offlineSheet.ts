// ── The offline sheet: what to have on paper when the internet drops
//
// Printed from the Dashboard (Quick tasks → Offline sheet) or the Import
// window. Everything on it comes from what the admin page already has in
// memory, so it prints from an open tab even after the connection is gone.
//
//   • today's and tomorrow's bookings: who, when, what, money, ready or not
//   • the caretaker's to-dos for today
//   • the rates, hours and the owner's number, to take a booking by phone
//   • blank tables for bookings and payments taken while offline, laid out
//     like the import template (All Bookings → Import), so typing them in
//     afterwards is a straight copy

import { escapeHtml } from "@/lib/escapeHtml";
import { bookingMoney, manilaDate } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot, holdsDate, bookingCoversDate } from "@/lib/utils";
import { packageAvailed } from "@/lib/pricing";
import { SLOTS, RESORT_CONTACT } from "@/lib/resort";
import { SHARED_PER_HEAD_RATE, EXCLUSIVE_FLAT_RATE, EVENT_VENUE_RATE, OVERTIME_RATE, OVERTIME_MAX, RESORT_MAX_CAPACITY } from "@/lib/validators";
import { caretakerTasks, addDaysIso } from "@/lib/tasks";
import { IMPORT_COLUMNS } from "@/lib/importBookings";
import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import type { DamageRecord, Inspection, Payment } from "@/types/finance";

export interface OfflineSheetInput {
  bookings: Booking[];
  payments: Payment[];
  damages: DamageRecord[];
  inspections: Inspection[];
  facilities: Facility[];
  rooms: { id: number; name: string }[];
}

/** Open the sheet in a new tab and bring up the print dialog. */
export function printOfflineSheet(input: OfflineSheetInput): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open(); w.document.write(offlineSheetHtml(input)); w.document.close();
}

/** The sheet as a printable page. */
export function offlineSheetHtml(input: OfflineSheetInput): string {
  const { bookings, payments, damages, inspections, facilities, rooms } = input;
  const today = manilaDate();
  const tomorrow = addDaysIso(today, 1);
  const e = (s: unknown) => escapeHtml(String(s ?? ""));
  const prepared = new Set(inspections.filter((i) => i.stage === "Preparation").map((i) => i.bookingId));
  const live = bookings.filter((b) => !b.archived && holdsDate(b) && !b.id.startsWith("TMP-"));
  const roomNames = (b: Booking) => (b.rooms ?? []).map((id) => rooms.find((r) => r.id === id)?.name.split(" –")[0] ?? `#${id}`).join(", ");

  const dayTable = (date: string) => {
    const list = live.filter((b) => bookingCoversDate(b, date)).sort((a, b) => getBookingSlot(a).localeCompare(getBookingSlot(b)));
    if (!list.length) return `<p class="muted">No bookings.</p>`;
    return `<table><tr><th>Ref</th><th>Guest</th><th>Contact</th><th>Time</th><th>Booked</th><th class="n">Guests</th><th>Rooms</th><th class="n">Total</th><th class="n">Paid</th><th class="n">To collect</th><th>Ready</th></tr>
${list.map((b) => {
      const m = bookingMoney(b, payments, damages);
      const s = SLOTS[getBookingSlot(b)];
      const ready = b.checkedOutAt ? "Checked out" : b.checkedInAt ? "On site" : prepared.has(b.id) ? "Prepared" : b.status === "Pending" ? "Not paid yet" : "To prepare";
      return `<tr><td class="mono">${e(b.id)}</td><td>${e(b.name)}</td><td>${e(b.contact)}</td><td>${e(`${s.label}, ${s.hours}`)}</td><td>${e(packageAvailed(b))}</td><td class="n">${b.guests}</td><td>${e(roomNames(b))}</td><td class="n">${e(fmt(b.total))}</td><td class="n">${e(fmt(m.paid))}</td><td class="n">${e(fmt(m.due))}</td><td>${e(ready)}</td></tr>`;
    }).join("")}</table>`;
  };

  const tasks = caretakerTasks({ bookings, facilities, inspections, upkeep: [], runs: [], today });
  const taskList = tasks.length
    ? `<ul>${tasks.map((t) => `<li><strong>${e(t.title)}</strong> — ${e(t.detail)}</li>`).join("")}</ul>`
    : `<p class="muted">Nothing to prepare, inspect or clean.</p>`;

  const blank = (headers: string[], n: number) =>
    `<table class="blank"><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr>${Array.from({ length: n }, () => `<tr>${headers.map(() => "<td></td>").join("")}</tr>`).join("")}</table>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>StoneWood offline sheet · ${e(fmtDate(today))}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font:12px/1.45 system-ui,sans-serif;color:#222;margin:0}h1{font:400 22px Georgia,serif;margin:0}
h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #bbb;padding-bottom:3px}table{border-collapse:collapse;width:100%}td,th{padding:3px 5px;border:1px solid #ccc;text-align:left;vertical-align:top}
th{background:#f3eee4}.n{text-align:right}.mono{font-family:monospace}.muted{color:#777}.blank td{height:22px}.box{border:1px solid #bbb;border-radius:6px;padding:8px 12px;margin-top:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}ul{margin:4px 0;padding-left:18px}.break{break-before:page}</style></head><body>
<h1>StoneWood — offline sheet</h1>
<div class="muted">Printed ${e(fmtDate(today))}. Keep it at the front desk in case the internet drops.</div>
<div class="box"><strong>While offline:</strong> take bookings on the last page (or in the import template on a laptop). Write the amount and how it was paid.
<strong>When the internet is back:</strong> All Bookings → Import, and enter any payments for existing bookings with Record payment.</div>
<div class="grid"><div><h2>Rates</h2><table>
<tr><td>Shared pool</td><td class="n">${e(fmt(SHARED_PER_HEAD_RATE))} per guest, per tour</td></tr>
<tr><td>Exclusive pool (up to ${RESORT_MAX_CAPACITY})</td><td class="n">${e(fmt(EXCLUSIVE_FLAT_RATE))} per tour</td></tr>
<tr><td>Events venue</td><td class="n">${e(fmt(EVENT_VENUE_RATE))} per tour</td></tr>
${OVERTIME_MAX > 0 ? `<tr><td>Day Tour overtime</td><td class="n">${e(fmt(OVERTIME_RATE))} per hour, up to ${OVERTIME_MAX}</td></tr>` : ""}
${rooms.length ? `<tr><td>Rooms</td><td class="n">${e(rooms.map((r) => r.name.split(" –")[0]).join(", "))}</td></tr>` : ""}
</table></div><div><h2>Hours and contact</h2><table>
${(["Day", "Night", "WholeDay"] as const).map((s) => `<tr><td>${e(SLOTS[s].label)}</td><td>${e(SLOTS[s].hours)}</td></tr>`).join("")}
<tr><td>Resort phone</td><td>${e(RESORT_CONTACT.phone)}</td></tr></table></div></div>
<h2>Today, ${e(fmtDate(today))}</h2>${dayTable(today)}
<h2>Tomorrow, ${e(fmtDate(tomorrow))}</h2>${dayTable(tomorrow)}
<h2>Caretaker, today</h2>${taskList}
<div class="break"></div>
<h2>New bookings taken offline</h2>
<div class="muted">The same columns as the import template, so they can be typed in as they are. Bookings from today on.</div>
${blank(IMPORT_COLUMNS.filter((c) => c.key !== "email" && c.key !== "notes").map((c) => c.header), 12)}
<h2>Payments for existing bookings</h2>
${blank(["Booking ref", "Guest", "Amount", "Paid by", "Reference no.", "Taken by"], 6)}
<script>window.onload=()=>window.print()</script></body></html>`;
  return html;
}
