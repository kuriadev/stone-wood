// ── The admin notification bell: what each staff member should know now
//
// Built from what the admin already has loaded and keeps live (bookings,
// the ops data OpsContext polls, guest messages, stock), so a new online
// booking, a payment or a guest arriving shows up without a reload.
//
// Two kinds of note:
//   • "action": something to do -- a booking to approve, a group arriving
//     today, a room to prepare, a reschedule to decide. Listed first,
//     soonest first, until it is done (then it simply stops being built).
//   • the rest: things that happened -- a new booking, money received, a
//     guest message -- newest first, for the last NOTE_DAYS days.
//
// Each note names the permission needed to see it, so every role gets the
// bell with only what it can act on (a caretaker is not told about money).
// Pure: the bell (components/admin/NotificationBell.tsx) filters, counts and
// remembers what was seen.

import type { Booking } from "@/types/booking";
import type { CustomerMessage, OwnerRequest, AdminTab } from "@/types/admin";
import type { DateChange, Inspection, Payment } from "@/types/finance";
import type { Permission } from "@/lib/permissions";
import { opsBoard } from "@/lib/operations";
import { SLOTS } from "@/lib/resort";
import { manilaDate } from "@/lib/finance";
import { fmt, getBookingSlot, stayLabel } from "@/lib/utils";

/** How far back "what happened" notes go. */
export const NOTE_DAYS = 7;

export type NoteTone = "info" | "good" | "warn" | "urgent";
export type NoteIcon = "calendar" | "wallet" | "users" | "clock" | "message" | "clipboard-check" | "flag" | "package" | "shield-alert";

export interface Note {
  /** Stable, so "seen" survives a reload: the same event, the same id. */
  id: string;
  /** Something to do (listed first) rather than something that happened. */
  action: boolean;
  tone: NoteTone;
  icon: NoteIcon;
  title: string;
  body: string;
  /** When it happened, or when it is due (ISO). */
  at: string;
  /** Who may see it. */
  perm: Permission;
  /** Where it opens: the first of these the person can open. */
  tabs: AdminTab[];
  bookingId?: string;
  /** On the Dashboard, the view this note's booking is shown in (it opens
   *  there, searched to that booking). */
  opsView?: "today" | "upcoming" | "reschedule";
}

const iso = (ms: number) => new Date(ms).toISOString();
/** A booking's tour start in Manila, as an instant. */
const startOf = (b: Booking) =>
  `${b.date}T${String(SLOTS[getBookingSlot(b)].startHour % 24).padStart(2, "0")}:00:00+08:00`;
const who = (b: Booking) => `${b.id} · ${b.name}`;

export function buildNotes(input: {
  bookings: Booking[];
  payments: Payment[];
  dateChanges: DateChange[];
  inspections: Inspection[];
  messages: CustomerMessage[];
  requests: OwnerRequest[];
  inventory?: { name: string; qty: number; minQty: number; deletedAt?: string | null }[];
  now: Date;
}): Note[] {
  const { bookings, payments, dateChanges, inspections, messages, requests, inventory = [], now } = input;
  const nowMs = now.getTime();
  const since = nowMs - NOTE_DAYS * 86_400_000;
  const today = manilaDate(now);
  const tomorrow = manilaDate(new Date(nowMs + 86_400_000));
  const notes: Note[] = [];
  const byId = new Map(bookings.map((b) => [b.id, b]));

  // ── To do ──────────────────────────────────────────────────────────
  for (const b of bookings) {
    if (b.status === "Pending" && !b.archived) {
      notes.push({
        id: `approve-${b.id}`, action: true, tone: b.date <= today ? "urgent" : "warn", icon: "calendar",
        title: "Booking waiting for approval",
        body: `${who(b)} · ${stayLabel(b)}`,
        at: b.createdAt ? iso(b.createdAt) : startOf(b),
        perm: "bookings.edit", tabs: ["Bookings"], bookingId: b.id,
      });
    }
    if (b.status === "Confirmed" && !b.archived && b.date === tomorrow) {
      notes.push({
        id: `tomorrow-${b.id}`, action: true, tone: "info", icon: "users",
        title: "Arriving tomorrow",
        body: `${who(b)} · ${SLOTS[getBookingSlot(b)].label}, ${b.guests} guest${b.guests === 1 ? "" : "s"}`,
        at: startOf(b),
        perm: "ops.view", tabs: ["Operations", "Tasks"], bookingId: b.id, opsView: "upcoming",
      });
    }
  }

  for (const c of opsBoard(bookings, inspections, now)) {
    const b = c.b;
    if (c.view !== "today") continue;
    if (c.overdue) {
      notes.push({
        id: `overdue-${b.id}`, action: true, tone: "urgent", icon: "shield-alert",
        title: "Never checked in",
        body: `${who(b)} was due ${stayLabel(b)}. Check them in or mark a no-show.`,
        at: startOf(b), perm: "bookings.edit", tabs: ["Operations"], bookingId: b.id, opsView: "today",
      });
    } else if (c.stage === "arriving") {
      notes.push({
        id: `arriving-${b.id}`, action: true, tone: c.prepared ? "info" : "warn", icon: "users",
        title: c.prepared ? "Arriving today" : "Arriving today — not prepared yet",
        body: `${who(b)} · ${SLOTS[getBookingSlot(b)].label}, ${b.guests} guest${b.guests === 1 ? "" : "s"}`,
        at: startOf(b), perm: "ops.view", tabs: ["Operations", "Tasks"], bookingId: b.id, opsView: "today",
      });
    }
    if (c.timeUp && c.endsAt) {
      notes.push({
        id: `timeup-${b.id}`, action: true, tone: "urgent", icon: "clock",
        title: "Time is up — check out",
        body: `${who(b)}: their booked hours have ended. Inspect and check them out.`,
        at: c.endsAt.toISOString(), perm: "ops.view", tabs: ["Operations", "Tasks"], bookingId: b.id, opsView: "today",
      });
    }
  }

  for (const r of dateChanges) {
    if (r.status !== "Pending") continue;
    const b = byId.get(r.bookingId);
    if (!b) continue;
    notes.push({
      id: `move-${r.id}`, action: true, tone: "warn", icon: "calendar",
      title: "Reschedule to decide",
      body: `${who(b)} asks to move to ${r.toDate}.`,
      at: r.createdAt, perm: "bookings.edit", tabs: ["Operations"], bookingId: b.id, opsView: "reschedule",
    });
  }

  for (const r of requests) {
    if (r.status !== "Pending") continue;
    notes.push({
      id: `request-${r.id}`, action: true, tone: "warn", icon: "flag",
      title: `${r.requestedByName} asks: ${r.label}`,
      body: r.summary,
      at: r.requestedAt, perm: "requests.decide", tabs: ["Tasks", "Operations"], bookingId: r.bookingId ?? undefined,
    });
  }

  const low = inventory.filter((i) => !i.deletedAt && i.qty <= i.minQty);
  if (low.length) {
    notes.push({
      // One note per day, so restocking tomorrow is a fresh reminder.
      id: `stock-${today}`, action: true, tone: "warn", icon: "package",
      title: `${low.length} item${low.length === 1 ? "" : "s"} running low`,
      body: low.slice(0, 3).map((i) => `${i.name} (${i.qty} left)`).join(", ") + (low.length > 3 ? `, and ${low.length - 3} more` : ""),
      at: `${today}T00:00:00+08:00`, perm: "inventory.view", tabs: ["Inventory"],
    });
  }

  // ── What happened ──────────────────────────────────────────────────
  for (const b of bookings) {
    if (!b.createdAt || b.createdAt < since) continue;
    const online = (b.source ?? "Online") === "Online";
    notes.push({
      id: `new-${b.id}`, action: false, tone: "info", icon: "calendar",
      title: online ? "New online booking" : "New walk-in booking",
      body: `${who(b)} · ${stayLabel(b)} · ${fmt(b.total)}`,
      at: iso(b.createdAt), perm: "bookings.view", tabs: ["Bookings", "Occupancy"], bookingId: b.id,
    });
    if (b.status === "Cancelled" && b.cancelledAt && Date.parse(b.cancelledAt) >= since) {
      notes.push({
        id: `cancel-${b.id}`, action: false, tone: "warn", icon: "calendar",
        title: "Booking cancelled",
        body: `${who(b)} · ${stayLabel(b)}`,
        at: b.cancelledAt, perm: "bookings.view", tabs: ["Bookings"], bookingId: b.id,
      });
    }
  }

  for (const p of payments) {
    if (p.voided || Date.parse(p.receivedAt) < since) continue;
    const refund = p.type === "Refund";
    notes.push({
      id: `pay-${p.id}`, action: false, tone: refund ? "warn" : "good", icon: "wallet",
      title: refund ? `Refund of ${fmt(p.amount)} sent` : `${fmt(p.amount)} received`,
      body: `${p.type} by ${p.method} from ${p.guestName}${p.bookingId ? ` · ${p.bookingId}` : ""}`,
      at: p.receivedAt, perm: "payments.record", tabs: p.bookingId ? ["Bookings", "Sales"] : ["Sales"], bookingId: p.bookingId ?? undefined,
    });
  }

  for (const m of messages) {
    if (m.archivedAt) continue;
    const at = m.createdAt ?? (m.date ? `${m.date}T00:00:00+08:00` : null);
    if (!at || Date.parse(at) < since) continue;
    notes.push({
      id: `msg-${m.id}`, action: false, tone: "info", icon: "message",
      title: `Message from ${m.name}`,
      body: m.message.length > 110 ? `${m.message.slice(0, 107)}…` : m.message,
      at, perm: "messages.handle", tabs: ["Customer Service", "Operations"],
    });
  }

  return notes;
}

/** To do first (soonest first), then what happened (newest first). */
export function sortNotes(notes: Note[]): Note[] {
  const todo = notes.filter((n) => n.action).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const done = notes.filter((n) => !n.action).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return [...todo, ...done];
}

/** "Just now", "12 min ago", "3 h ago", "in 2 h", "Yesterday", "28 Oct". */
export function noteWhen(at: string, now: Date): string {
  const diff = Date.parse(at) - now.getTime();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const future = diff > 0;
  if (mins < 1) return "Just now";
  if (mins < 60) return future ? `in ${mins} min` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return future ? `in ${hours} h` : `${hours} h ago`;
  const day = manilaDate(new Date(at));
  if (day === manilaDate(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  if (day === manilaDate(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return new Date(at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short" });
}

/** "2:14 PM · Wed 28 Oct", in Manila. */
export function noteStamp(at: string): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", day: "numeric", month: "short" });
  return `${time} · ${date}`;
}
