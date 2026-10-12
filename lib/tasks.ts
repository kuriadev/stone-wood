// ── The caretakers' task list, worked out rather than typed in
//
// Nobody writes "prepare Room 2 for tomorrow" on a whiteboard any more.
// Every task here follows from something the system already knows:
//
//   Prepare   a booking whose preparation window is open (the day before
//             the visit, lib/operations.ts → prepBlocked) and not yet done
//   Inspect   a group checked in and not yet checked out — the check-out
//             inspection happens as they leave
//   Clean     a facility a check-out left "Needs Cleaning"
//   Upkeep    the owner's repeating work ("Pool cleaning, every 7 days"),
//             due on start_date + k × every_days, until a run is recorded
//
// Because the list is DERIVED, nothing has to run on a timer to create it:
// it is right whenever anyone opens the screen, and finishing the work
// (saving the preparation, the inspection, the cleaning, the run) is what
// takes a task off it.
//
// Pure: no database, no clock of its own. Safe on client and server.

import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import type { Inspection } from "@/types/finance";
import type { UpkeepRun, UpkeepTask } from "@/types/tasks";
import { prepBlocked } from "@/lib/operations";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { bookingEndDate } from "@/lib/utils";

export type TaskKind = "prepare" | "inspect" | "clean" | "upkeep";

export interface CaretakerTask {
  /** Stable across refreshes: "prepare:SW-10150", "upkeep:3:2026-10-12". */
  key: string;
  kind: TaskKind;
  title: string;
  /** One line under the title: who, which facilities, why now. */
  detail: string;
  /** The day it belongs to, YYYY-MM-DD. */
  date: string;
  /** Genuinely behind: an upkeep day that has passed, or a group still
   *  on site after their stay's last day. Preparing for a group arriving
   *  today is urgent, not late — the screen says "Today" for that. */
  overdue: boolean;
  booking?: Booking;
  facilities: Facility[];
  upkeep?: UpkeepTask;
}

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDaysIso = (iso: string, n: number): string => fromUtc(toUtc(iso) + n * DAY_MS);

/**
 * Where an upkeep task stands today.
 *
 * `dueDate` is the most recent scheduled day on or before today, or — when
 * the schedule hasn't started — the first one. A missed week does not pile
 * up into several tasks: the pool is cleaned once and the next date follows
 * the schedule, so only the latest due day is ever owed.
 */
export function upkeepStatus(task: Pick<UpkeepTask, "id" | "everyDays" | "startDate">, runs: Pick<UpkeepRun, "taskId" | "dueDate">[], today: string): {
  dueDate: string;
  state: "due" | "overdue" | "done" | "upcoming";
  /** The scheduled day after dueDate. */
  nextDate: string;
} {
  const every = Math.max(1, Math.floor(task.everyDays));
  if (today < task.startDate) {
    return { dueDate: task.startDate, state: "upcoming", nextDate: task.startDate };
  }
  const elapsed = Math.floor((toUtc(today) - toUtc(task.startDate)) / DAY_MS);
  const dueDate = addDaysIso(task.startDate, Math.floor(elapsed / every) * every);
  const nextDate = addDaysIso(dueDate, every);
  const done = runs.some((r) => r.taskId === task.id && r.dueDate === dueDate);
  if (done) return { dueDate, state: "done", nextDate };
  return { dueDate, state: dueDate < today ? "overdue" : "due", nextDate };
}

/** Everything a caretaker should do now, most pressing first. */
export function caretakerTasks(input: {
  bookings: Booking[];
  facilities: Facility[];
  inspections: Inspection[];
  upkeep: UpkeepTask[];
  runs: Pick<UpkeepRun, "taskId" | "dueDate">[];
  today: string;
}): CaretakerTask[] {
  const { bookings, facilities, inspections, upkeep, runs, today } = input;
  const prepared = new Set(inspections.filter((i) => i.stage === "Preparation").map((i) => i.bookingId));
  const live = bookings.filter((b) =>
    !b.archived && !b.id.startsWith("TMP-") && (b.status === "Confirmed" || b.status === "Pending"));
  const tasks: CaretakerTask[] = [];

  // ── Inspect: groups on site ──
  for (const b of live) {
    if (b.status !== "Confirmed" || !b.checkedInAt || b.checkedOutAt) continue;
    const used = facilitiesForBooking(b, facilities);
    tasks.push({
      key: `inspect:${b.id}`, kind: "inspect",
      title: `Inspect when ${b.name} leaves`,
      detail: used.length ? used.map((f) => f.name).join(", ") : "No listed facilities",
      date: bookingEndDate(b), overdue: bookingEndDate(b) < today,
      booking: b, facilities: used,
    });
  }

  // ── Prepare: the window is open and it isn't done ──
  for (const b of live) {
    if (prepared.has(b.id) || prepBlocked(b, today)) continue;
    const used = facilitiesForBooking(b, facilities);
    tasks.push({
      key: `prepare:${b.id}`, kind: "prepare",
      title: `Prepare for ${b.name}`,
      detail: `${b.date === today ? "Arriving today" : "Arriving tomorrow"} · ${used.map((f) => f.name).join(", ") || "no listed facilities"}`,
      date: b.date, overdue: false,
      booking: b, facilities: used,
    });
  }

  // ── Clean: what a check-out left behind ──
  for (const f of facilities) {
    if (f.status !== "Needs Cleaning" || f.active === false) continue;
    tasks.push({
      key: `clean:${f.id}`, kind: "clean",
      title: `Clean ${f.name}`,
      detail: f.lastUsedGuestName ? `After ${f.lastUsedGuestName}` : "Flagged at check-out",
      date: today, overdue: false,
      facilities: [f],
    });
  }

  // ── Upkeep: the owner's schedule ──
  for (const t of upkeep) {
    if (!t.active) continue;
    const s = upkeepStatus(t, runs, today);
    if (s.state !== "due" && s.state !== "overdue") continue;
    const f = t.facilityId ? facilities.find((x) => x.id === t.facilityId) : undefined;
    tasks.push({
      key: `upkeep:${t.id}:${s.dueDate}`, kind: "upkeep",
      title: t.title,
      detail: `${s.state === "overdue" ? `Was due ${s.dueDate}` : "Due today"} · every ${t.everyDays === 1 ? "day" : `${t.everyDays} days`}${f ? ` · ${f.name}` : ""}`,
      date: s.dueDate, overdue: s.state === "overdue",
      facilities: f ? [f] : [], upkeep: t,
    });
  }

  // Groups leaving first (they won't wait), then arrivals, then the rest;
  // within each, what has fallen behind first.
  const order: Record<TaskKind, number> = { inspect: 0, prepare: 1, clean: 2, upkeep: 3 };
  return tasks.sort((a, b) =>
    order[a.kind] - order[b.kind] || Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Upkeep coming up in the next `days` days, for the "coming up" list. */
export function upcomingUpkeep(upkeep: UpkeepTask[], runs: Pick<UpkeepRun, "taskId" | "dueDate">[], today: string, days = 7): { task: UpkeepTask; date: string }[] {
  const until = addDaysIso(today, days);
  const out: { task: UpkeepTask; date: string }[] = [];
  for (const t of upkeep) {
    if (!t.active) continue;
    const s = upkeepStatus(t, runs, today);
    const next = s.state === "upcoming" ? s.dueDate : s.nextDate;
    if (next > today && next <= until) out.push({ task: t, date: next });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** How long the stock lasts at the rate it has been used: "about 3 weeks".
 *  `usedLast60` is the total used (positive) in the last 60 days. Null when
 *  nothing was used, so no forecast is invented. */
export function stockForecast(qty: number, usedLast60: number): { days: number; label: string } | null {
  if (usedLast60 <= 0 || qty <= 0) return null;
  const perDay = usedLast60 / 60;
  const days = Math.floor(qty / perDay);
  const label = days < 7 ? `about ${days} day${days === 1 ? "" : "s"}`
    : days < 60 ? `about ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? "" : "s"}`
      : `about ${Math.round(days / 30)} months`;
  return { days, label };
}
