// ── Moving bookings, server side
//
// SERVER ONLY. The rules are in lib/rebooking.ts; this is what enforces
// them against the database:
//
//   guest links     a signed link that opens a guest's booking without
//                   asking for their email (walk-ins often have none, and
//                   the link goes out by text message)
//   held dates      a pending guest request holds its new date for 48 hours;
//                   every availability check counts those holds as bookings
//   checkMove       can this booking move to that date? (same rules as a new
//                   booking: window, closed dates, capacity, rooms)
//   sweepExpired    deadlines that have passed, applied when something next
//                   reads the data, since nothing runs in the background

import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin, rowToBooking, rowToFacility } from "@/lib/supabase";
import {
  checkBookingAvailability, roomsTakenOn, isRoomOpen,
  getBookingSlot, getBookingResource, getBookingTier, fmt,
} from "@/lib/utils";
import { isWithinBookingWindow, describeDateProblem } from "@/lib/validators";
import { logActivity, type ActivityInput } from "@/lib/activity.server";
import { GUEST_CHOICE_DAYS } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { loadBookingLedger } from "@/lib/ledger.server";
import type { Booking } from "@/types/booking";
import type { BookingRow, FacilityRow, DateChangeRow } from "@/types/database";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Statuses whose booking no longer occupies its date, as a PostgREST list. */
export const FREED_STATUS_LIST = "(Cancelled,ResortCancelled)";

// ── Guest links ─────────────────────────────────────────────────────
function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET is missing or too short.");
  return s;
}

export function guestToken(id: string, email: string): string {
  return createHmac("sha256", secret())
    .update(`guest-link:${id}:${(email || "").trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

/** The guest's own booking page, opened without typing anything. */
export function guestLinkFor(b: Pick<Booking, "id" | "email">): string {
  return `${APP_URL}/my-booking?booking=${encodeURIComponent(b.id)}&t=${guestToken(b.id, b.email)}`;
}

function tokenMatches(b: Pick<Booking, "id" | "email">, token: string): boolean {
  const want = Buffer.from(guestToken(b.id, b.email));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** A booking the caller may see: its reference plus either the email on it
 *  or the token from their link. null for a wrong pair, the same as for a
 *  booking that doesn't exist, so a reference alone reveals nothing. */
export async function loadGuestBooking(id: string, proof: { email?: string | null; token?: string | null }): Promise<Booking | null> {
  const { data, error } = await getSupabaseAdmin().from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const b = rowToBooking(data as BookingRow);
  if (proof.token && tokenMatches(b, proof.token)) return b;
  const email = (proof.email ?? "").trim().toLowerCase();
  if (email && b.email && b.email.toLowerCase() === email) return b;
  return null;
}

// ── Held dates ──────────────────────────────────────────────────────
/** Pending guest requests whose hold hasn't run out, each as a stand-in
 *  booking on the date it holds. Before the migration that creates the
 *  table this returns nothing rather than failing the caller. */
export async function heldBookings(opts: { date?: string; fromDate?: string; excludeBookingId?: string } = {}): Promise<Booking[]> {
  let q = getSupabaseAdmin().from("date_change_requests")
    .select("id, to_date, booking_id, bookings(*)")
    .eq("status", "Pending")
    .gt("hold_until", new Date().toISOString());
  if (opts.date) q = q.eq("to_date", opts.date);
  if (opts.fromDate) q = q.gte("to_date", opts.fromDate);
  const { data, error } = await q;
  if (error) {
    console.error("[holds]", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as { id: number; to_date: string; booking_id: string; bookings: BookingRow | null }[];
  return rows
    .filter((r) => r.bookings && r.booking_id !== opts.excludeBookingId)
    .map((r) => ({ ...rowToBooking(r.bookings as BookingRow), id: `HOLD-${r.id}`, date: r.to_date, status: "Confirmed" as const }));
}

// ── Can this booking move to that date? ─────────────────────────────
export async function checkMove(b: Booking, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const no = (error: string) => ({ ok: false as const, error });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return no("Choose a date.");
  if (date === b.date) return no("Your booking is already on that date.");
  if (!isWithinBookingWindow(date)) return no(describeDateProblem(date) ?? "That date can't be booked.");

  const closed = await getSupabaseAdmin().from("closed_dates").select("date").eq("date", date).maybeSingle();
  if (closed.error) throw new Error(closed.error.message);
  if (closed.data) return no("The resort is closed on that date.");
  return checkFits({ ...b, date });
}

/** Does this booking, exactly as given (its date, guests, overtime, rooms),
 *  fit beside every other booking and held date that day? The same rules as
 *  a new booking. Used for a move (the booking on its new date) and for a
 *  charge added on the day (the booking with its extra guests, overtime or
 *  room), so neither can overbook the pool, take the Night slot or
 *  double-book a room. */
export async function checkFits(b: Booking): Promise<{ ok: true } | { ok: false; error: string }> {
  const no = (error: string) => ({ ok: false as const, error });
  const db = getSupabaseAdmin();
  const [sameDay, fac, holds] = await Promise.all([
    db.from("bookings").select("*").eq("date", b.date).neq("id", b.id).not("status", "in", FREED_STATUS_LIST),
    db.from("facilities").select("*"),
    heldBookings({ date: b.date, excludeBookingId: b.id }),
  ]);
  if (sameDay.error) throw new Error(sameDay.error.message);
  if (fac.error) throw new Error(fac.error.message);

  const others = [...(sameDay.data as BookingRow[]).map(rowToBooking), ...holds];
  const facilities = (fac.data as FacilityRow[]).map(rowToFacility);
  const slot = getBookingSlot(b);
  const overtime = b.overtime ?? 0;
  const capacity = checkBookingAvailability(b.date, slot, b.guests, getBookingTier(b), getBookingResource(b), others, facilities, overtime);
  if (!capacity.ok) return no(capacity.reason ?? "That date is no longer available.");
  const taken = roomsTakenOn(b.date, slot, others, overtime);
  if ((b.rooms ?? []).some((r) => taken.has(r))) return no("A room in your booking is already taken that date.");
  if ((b.rooms ?? []).some((r) => !isRoomOpen(r, facilities))) return no("A room in your booking is closed for maintenance.");
  return { ok: true };
}

/** Put a booking on its new date. Its preparation checklist belonged to
 *  the old date, so it goes; the facilities are prepared again for the
 *  new one. */
export async function moveBooking(b: Booking, date: string, extra: Record<string, unknown> = {}): Promise<Booking | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("bookings")
    .update({ date, ...extra })
    .eq("id", b.id).eq("status", b.status).is("checked_in_at", null)
    .select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await db.from("facility_inspections").delete().eq("booking_id", b.id).eq("stage", "Preparation");
  return rowToBooking(data as BookingRow);
}

/** A resort-cancelled guest's pick was declined or not answered in time:
 *  give them a fresh GUEST_CHOICE_DAYS to pick again. Their original
 *  deadline was cleared when they picked, and the wait was the resort's.
 *  Returns the updated booking, or null if it isn't waiting any more. */
export async function reopenChoice(bookingId: string): Promise<Booking | null> {
  const deadline = new Date(Date.now() + GUEST_CHOICE_DAYS * 86_400_000).toISOString();
  const { data, error } = await getSupabaseAdmin().from("bookings")
    .update({ choice_deadline: deadline })
    .eq("id", bookingId).eq("status", "ResortCancelled")
    .select().maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToBooking(data as BookingRow) : null;
}

// ── The guest chose a refund ────────────────────────────────────────
/** After a resort cancellation the guest asked the owner (by call or chat)
 *  for their money back instead of a new date. The booking is cancelled,
 *  what they paid becomes a refund OWED, and a new date they had picked is
 *  withdrawn. From there the usual "Send refund" flow records the transfer
 *  and tells the guest it was sent.
 *
 *  `refund_amount` is everything they paid in, and refunds already recorded
 *  count toward it: that is how /api/payments and the Send refund window
 *  measure what is left to send.
 *
 *  `notify` is false when this runs as part of recording the refund itself
 *  (the guest then gets the "refund sent" message instead). */
export async function chooseRefund(b: Booking, opts: { notify?: boolean } = {}): Promise<{ ok: true; booking: Booking; owed: number } | { ok: false; error: string }> {
  if (b.status !== "ResortCancelled") {
    return { ok: false, error: b.refundStatus ? "A refund is already recorded on this booking." : "Only a booking the resort cancelled can be refunded this way." };
  }
  const ledger = await loadBookingLedger(b.id);
  if (!ledger) return { ok: false, error: "That booking no longer exists." };
  const refunded = ledger.payments.filter((p) => p.type === "Refund" && !p.voided).reduce((s, p) => s + p.amount, 0);
  const owed = Math.max(0, ledger.money.paid);
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await db.from("bookings").update({
    status: "Cancelled",
    refund_status: owed > 0 ? "Owed" : null,
    refund_amount: owed > 0 ? Math.round((owed + refunded) * 100) / 100 : null,
    held_amount: 0,
    choice_deadline: null,
  }).eq("id", b.id).eq("status", "ResortCancelled").select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, error: "This booking just changed. Refresh and try again." };
  const saved = rowToBooking(data as BookingRow);

  await db.from("date_change_requests")
    .update({ status: "Declined", decided_at: now, note: "The guest chose a refund instead." })
    .eq("booking_id", b.id).eq("status", "Pending");

  if (opts.notify !== false && owed > 0 && saved.email) {
    const n = notices.refundRequested(saved, owed, guestLinkFor(saved));
    await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `refund-chosen ${saved.id}`);
  }
  await logActivity({
    actor: "Admin", action: "booking.refund_chosen", bookingId: saved.id, entity: "booking", entityId: saved.id,
    summary: owed > 0
      ? `${saved.name} chose a refund instead of a new date. ${saved.id} is cancelled and ${fmt(owed)} is owed back to them.`
      : `${saved.name} chose not to rebook. Nothing was paid, so ${saved.id} is just cancelled.`,
    details: { owed, alreadyRefunded: refunded },
  });
  return { ok: true, booking: saved, owed };
}

// ── Deadlines that have passed ──────────────────────────────────────
// Nothing runs on a timer here, so a passed deadline is applied the next
// time something reads bookings (the admin's live sync does every 15
// seconds; a guest opening their page does too). Availability never waits
// for this: it only counts holds that are still running.
let lastSweep = 0;

export async function sweepExpired(force = false): Promise<void> {
  if (!force && Date.now() - lastSweep < 30_000) return;
  lastSweep = Date.now();
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  try {
    const [choices, holds] = await Promise.all([
      db.from("bookings").select("*").eq("status", "ResortCancelled").lt("choice_deadline", now),
      db.from("date_change_requests").select("*").eq("status", "Pending").lt("hold_until", now),
    ]);
    const logs: ActivityInput[] = [];

    for (const row of (choices.data ?? []) as BookingRow[]) {
      const b = rowToBooking(row);
      const held = b.heldAmount ?? 0;
      /* Only the guest's own picker closes. The booking stays cancelled BY
         THE RESORT, with the payment held, because the guest is still owed a
         new date or (if they ask) their money back: the owner settles it with
         "Set a new date" or "Guest chose a refund" (choiceExpired). This used
         to make it a plain "Cancelled" booking, which hid both actions and
         left the held payment with no way out.

         Clearing the deadline is what keeps this from running again. */
      const done = await db.from("bookings")
        .update({ choice_deadline: null })
        .eq("id", b.id).eq("status", "ResortCancelled").lt("choice_deadline", now).select("id").maybeSingle();
      if (done.data) {
        logs.push({
          actor: "System", action: "booking.choice_expired", bookingId: b.id, entity: "booking", entityId: b.id,
          summary: `${b.name} didn't pick a new date for ${b.id} within ${GUEST_CHOICE_DAYS} days.${held > 0 ? ` ${fmt(held)} is still held for them.` : ""} Contact them to agree a new date or a refund.`,
        });
      }
    }

    for (const r of (holds.data ?? []) as DateChangeRow[]) {
      const done = await db.from("date_change_requests")
        .update({ status: "Expired", decided_at: now })
        .eq("id", r.id).eq("status", "Pending").select("id").maybeSingle();
      if (!done.data) continue;
      /* A resort-cancelled guest's pick that the owner never answered. The
         guest made their choice in time, so they get to choose again rather
         than lose the booking — and are told, since the guest page would
         otherwise just quietly show the picker again. A confirmed guest's
         own request needs none of this: their booking never left its date. */
      const reopened = await reopenChoice(r.booking_id);
      if (reopened?.choiceDeadline && reopened.email) {
        const n = notices.rebookDeclined(reopened, r.to_date, "The resort wasn't able to confirm it in time.", reopened.choiceDeadline, guestLinkFor(reopened));
        await trySendMail({ to: reopened.email, ...buildNoticeEmail(n.email) }, `rebook-expired ${reopened.id}`);
      }
      logs.push({
        actor: "System", action: "date_change.expired", bookingId: r.booking_id, entity: "date_change", entityId: r.id,
        summary: reopened
          ? `The 48-hour hold on ${r.to_date} for ${r.booking_id} ran out before you answered, so ${reopened.name} can pick again for another ${GUEST_CHOICE_DAYS} days.`
          : `The 48-hour hold on ${r.to_date} for ${r.booking_id} ran out before it was answered.`,
        details: { from: r.from_date, to: r.to_date },
      });
    }
    await logActivity(logs);
  } catch (err) {
    // Before the migration the columns and table don't exist; nothing to do.
    console.error("[sweep]", err);
  }
}
