// ── What the resort emails ITSELF
//
// SERVER ONLY — these build mail sent to the owner, not to a guest.
//
// ── The rule that shapes all of this ──
//
// A notification nobody reads is worse than none, because it teaches the
// owner to ignore the next one. So the volume is fixed at roughly TWO
// emails a day plus one per booking, and the split is by urgency, not by
// event:
//
//   Something happened that needs you        → its own email, immediately.
//     a booking and its money arrived; the day was closed.
//
//   Something is true that you should know   → one briefing each morning.
//     who arrives today, who leaves, what is still unconfirmed, and any
//     guest whose reschedule deadline has run out.
//
// A guest checking out does NOT get its own email: it happens several
// times a day, it is already on the board, and an email per checkout is
// exactly the stream that makes someone filter the sender. It appears as
// "leaving today" in the briefing and in the day's closing summary.
//
// ── Every builder may return null ──
//
// A briefing with nothing in it is not sent. "Nothing is happening today"
// is not news, and an inbox with six of them is where the one that mattered
// gets lost. This is the single most important thing here, so it is a type:
// `MailOut | null`, and the caller skips on null.

import { RESORT_CONTACT, SLOTS } from "@/lib/resort";
import { escapeHtml } from "@/lib/escapeHtml";
import { fmt, fmtDate, getBookingSlot, stayLabel, bookingEndDate } from "@/lib/utils";
import type { Booking } from "@/types/booking";

export interface MailOut { subject: string; html: string }

/** Where these go. An env var so a manager can be added without a deploy;
 *  the resort's own address is the default. */
export function adminNotifyTo(): string {
  return (process.env.ADMIN_NOTIFY_EMAIL || RESORT_CONTACT.email).trim();
}

/** The letterhead, so every one of these looks like the guest mail the
 *  resort already sends. `accent` colours the header rule: gold for news,
 *  red when something has run out of time. */
function shell(title: string, intro: string, blocks: string, accent = "#c9a84c"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:28px 0;">
    <tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="background:#1a1108;border-radius:12px 12px 0 0;padding:28px 32px;">
        <p style="margin:0 0 4px;color:${accent};font-size:10px;letter-spacing:4px;text-transform:uppercase;">StoneWood · Resort Desk</p>
        <h1 style="margin:0;color:#f0e6cc;font-size:21px;font-weight:400;">${escapeHtml(title)}</h1>
      </td></tr>
      <tr><td style="background:#ffffff;padding:28px 32px;">
        <p style="margin:0 0 20px;color:#4a3a28;font-size:14px;line-height:1.7;">${escapeHtml(intro)}</p>
        ${blocks}
        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e8e0cc;color:#8a7a5a;font-size:11.5px;line-height:1.7;">
          Sent by the booking system to ${escapeHtml(adminNotifyTo())}. Open the admin panel to act on any of this.
        </p>
      </td></tr>
    </table></td></tr>
  </table>
</body>
</html>`;
}

/** A titled list. Returns "" when there is nothing in it, so an empty
 *  section disappears rather than printing "None". */
function section(title: string, lines: string[], tone = "#8a6d3b"): string {
  if (lines.length === 0) return "";
  return `
  <p style="margin:0 0 8px;color:${tone};font-size:10px;letter-spacing:3px;text-transform:uppercase;border-bottom:1px solid #e8e0cc;padding-bottom:6px;">${escapeHtml(title)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
    ${lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e8d8;color:#2a1f0e;font-size:13px;line-height:1.6;">${l}</td></tr>`).join("")}
  </table>`;
}

/** "SW-10141 · Juan Dela Cruz" with the reference set apart, as it is on
 *  the admin screens. */
function who(b: Booking): string {
  return `<strong style="font-family:monospace;">${escapeHtml(b.id)}</strong> · ${escapeHtml(b.name)}`;
}

// ── 1. A booking arrived ─────────────────────────────────────────────────

/** Immediate: money moved and a date is now spoken for. One per booking,
 *  which is a volume that matches how often it actually happens. */
export function buildNewBookingAlert(b: Booking, paid: number): MailOut {
  const slot = SLOTS[getBookingSlot(b)];
  const needsReview = b.status !== "Confirmed";
  const rows = [
    `<strong>${escapeHtml(b.name)}</strong> · ${escapeHtml(b.email || b.contact || "no contact given")}`,
    `${escapeHtml(stayLabel(b))} · ${escapeHtml(slot.label)} (${escapeHtml(slot.hours)})`,
    `${b.guests} guest${b.guests === 1 ? "" : "s"} · ${escapeHtml(b.package as string)}`,
    `Total ${escapeHtml(fmt(b.total))} · paid ${escapeHtml(fmt(paid))}${paid >= b.total ? " (in full)" : ` · ${escapeHtml(fmt(b.total - paid))} on arrival`}`,
  ];
  return {
    subject: `${needsReview ? "Review" : "New booking"} · ${b.id} · ${fmtDate(b.date)}`,
    html: shell(
      needsReview ? "A booking needs your review" : "A booking came in",
      needsReview
        ? "It is paid but held for you to look at before it is confirmed."
        : "It paid and the date was free, so the system has already confirmed it. Nothing is needed from you.",
      section(`Booking ${b.id}`, rows) + section("What to do", [
        needsReview
          ? "Open Bookings and accept or decline it."
          : "Nothing — it will appear on the dashboard on the day.",
      ]),
      needsReview ? "#e0a020" : "#c9a84c",
    ),
  };
}

// ── 1b. Front desk asked the owner for something ────────────────────────

/** A refund, void, cancellation or write-off waiting for the owner. The
 *  badge in the admin panel is the main signal; this is for the owner who
 *  is not looking at it, because these hold up a guest at the counter. */
export function buildOwnerRequestAlert(r: { label: string; summary: string; reason: string; by: string }): MailOut {
  return {
    subject: `Approval needed · ${r.label}`,
    html: shell(
      "Front desk needs your approval",
      `${r.by} sent this to you. Nothing has happened yet: it goes through only when you approve it.`,
      section(r.label, [escapeHtml(r.summary), ...(r.reason ? [`Reason given: ${escapeHtml(r.reason)}`] : [])]) +
        section("What to do", ["Open the admin panel. It is at the top of the Dashboard under Requests — approve or decline it there."]),
      "#e0a020",
    ),
  };
}

// ── 2. The morning briefing ──────────────────────────────────────────────

export interface BriefingInput {
  /** The Manila date being briefed, YYYY-MM-DD. */
  date: string;
  /** Every live booking. The builder picks out what matters for the day. */
  bookings: Booking[];
  /** Now, for deciding whether a reschedule deadline has run out. */
  now?: Date;
}

/** One email each morning, or none at all.
 *
 *  Null when the day has nothing in it — no arrivals, no departures,
 *  nothing unconfirmed and no deadline gone by. A quiet Tuesday should not
 *  produce an email saying so. */
export function buildMorningBriefing({ date, bookings, now = new Date() }: BriefingInput): MailOut | null {
  const live = bookings.filter((b) => !b.archived);

  // A deadline that has gone by with no answer. Money is being held and
  // nobody is chasing it, so this goes above everything else.
  const lapsed = live.filter(
    (b) => b.status === "ResortCancelled" && b.choiceDeadline && new Date(b.choiceDeadline) < now,
  );
  const arriving = live.filter((b) => b.date === date && (b.status === "Confirmed" || b.status === "Pending"));
  const leaving = live.filter(
    (b) => b.status === "Confirmed" && bookingEndDate(b) === date && !!b.checkedInAt && !b.checkedOutAt,
  );
  const unconfirmed = live.filter((b) => b.status === "Pending");

  if (!lapsed.length && !arriving.length && !leaving.length && !unconfirmed.length) return null;

  const urgent = lapsed.length > 0;
  const blocks =
    section(
      `Needs you — no new date chosen`,
      lapsed.map((b) => `${who(b)} — had until ${escapeHtml(fmtDate((b.choiceDeadline || "").slice(0, 10)))} and has not answered.${(b.heldAmount ?? 0) > 0 ? ` ${escapeHtml(fmt(b.heldAmount ?? 0))} is still held for them.` : ""}`),
      "#b02a2a",
    ) +
    section(
      "Arriving today",
      arriving.map((b) => `${who(b)} · ${escapeHtml(SLOTS[getBookingSlot(b)].label)} · ${b.guests} guest${b.guests === 1 ? "" : "s"}${b.status === "Pending" ? " — not confirmed yet" : ""}`),
    ) +
    section(
      "Leaving today",
      leaving.map((b) => `${who(b)} · checked in, due to check out`),
    ) +
    section(
      "Still waiting on you",
      unconfirmed
        .filter((b) => b.date !== date)
        .map((b) => `${who(b)} · ${escapeHtml(fmtDate(b.date))} — not accepted yet`),
    );

  const counts = [
    arriving.length ? `${arriving.length} arriving` : "",
    leaving.length ? `${leaving.length} leaving` : "",
    lapsed.length ? `${lapsed.length} needing an answer` : "",
  ].filter(Boolean).join(", ");

  return {
    subject: `${urgent ? "⚠ " : ""}Today at StoneWood · ${fmtDate(date)}${counts ? ` · ${counts}` : ""}`,
    html: shell(
      `Today — ${fmtDate(date)}`,
      urgent
        ? "Start with the first list: a guest's deadline to choose a new date has gone by."
        : "Here is the day. Nothing in it needs an answer before the guests arrive.",
      blocks,
      urgent ? "#e06060" : "#c9a84c",
    ),
  };
}

// ── 3. The day was closed ────────────────────────────────────────────────

export interface DayClosedInput {
  date: string;
  /** Cash counted in the drawer, and what the system expected. */
  counted: number;
  expected: number;
  /** Bookings that finished today. */
  checkedOut: Booking[];
  /** Still owed across the day's bookings, if anything. */
  outstanding?: number;
}

/** Sent when the owner closes the day. This is where checkouts are
 *  reported, in one place, rather than one email each as they happen. */
export function buildDayClosedEmail({ date, counted, expected, checkedOut, outstanding = 0 }: DayClosedInput): MailOut {
  const diff = Math.round((counted - expected) * 100) / 100;
  const cash = [
    `Counted ${escapeHtml(fmt(counted))} · expected ${escapeHtml(fmt(expected))}`,
    diff === 0
      ? "The drawer balances."
      : `<strong style="color:${diff > 0 ? "#2e7d32" : "#b02a2a"};">${diff > 0 ? "Over" : "Short"} by ${escapeHtml(fmt(Math.abs(diff)))}</strong>`,
  ];
  if (outstanding > 0) cash.push(`${escapeHtml(fmt(outstanding))} is still owed on the day's bookings.`);

  return {
    subject: `Day closed · ${fmtDate(date)}${diff !== 0 ? ` · drawer ${diff > 0 ? "over" : "short"} ${fmt(Math.abs(diff))}` : ""}`,
    html: shell(
      `Day closed — ${fmtDate(date)}`,
      diff === 0
        ? "The day is closed and the cash count matches."
        : "The day is closed. The cash count did not match, so it is worth a look while the day is fresh.",
      section("Cash", cash, diff === 0 ? "#8a6d3b" : "#b02a2a") +
        section("Guests who finished today", checkedOut.map((b) => `${who(b)} · ${escapeHtml(SLOTS[getBookingSlot(b)].label)} · ${b.guests} guest${b.guests === 1 ? "" : "s"}`)),
      diff === 0 ? "#c9a84c" : "#e06060",
    ),
  };
}
