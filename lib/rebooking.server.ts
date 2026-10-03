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
  return `${APP_URL}/cancelbooking?booking=${encodeURIComponent(b.id)}&t=${guestToken(b.id, b.email)}`;
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

  const db = getSupabaseAdmin();
  const [closed, sameDay, fac, holds] = await Promise.all([
    db.from("closed_dates").select("date").eq("date", date).maybeSingle(),
    db.from("bookings").select("*").eq("date", date).neq("id", b.id).not("status", "in", FREED_STATUS_LIST),
    db.from("facilities").select("*"),
    heldBookings({ date, excludeBookingId: b.id }),
  ]);
  if (closed.error) throw new Error(closed.error.message);
  if (sameDay.error) throw new Error(sameDay.error.message);
  if (fac.error) throw new Error(fac.error.message);
  if (closed.data) return no("The resort is closed on that date.");

  const others = [...(sameDay.data as BookingRow[]).map(rowToBooking), ...holds];
  const facilities = (fac.data as FacilityRow[]).map(rowToFacility);
  const slot = getBookingSlot(b);
  const overtime = b.overtime ?? 0;
  const capacity = checkBookingAvailability(date, slot, b.guests, getBookingTier(b), getBookingResource(b), others, facilities, overtime);
  if (!capacity.ok) return no(capacity.reason ?? "That date is no longer available.");
  const taken = roomsTakenOn(date, slot, others, overtime);
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
      const done = await db.from("bookings")
        .update({ status: "Cancelled", refund_status: held > 0 ? "Owed" : null, refund_amount: held, held_amount: 0 })
        .eq("id", b.id).eq("status", "ResortCancelled").select("id").maybeSingle();
      if (done.data) {
        logs.push({
          actor: "System", action: "booking.choice_expired", bookingId: b.id, entity: "booking", entityId: b.id,
          summary: `${b.name} didn't choose within ${GUEST_CHOICE_DAYS} days. ${held > 0 ? `A refund of ${fmt(held)} is now owed.` : "The booking is cancelled."}`,
        });
      }
    }

    for (const r of (holds.data ?? []) as DateChangeRow[]) {
      const done = await db.from("date_change_requests")
        .update({ status: "Expired", decided_at: now })
        .eq("id", r.id).eq("status", "Pending").select("id").maybeSingle();
      if (done.data) {
        logs.push({
          actor: "System", action: "date_change.expired", bookingId: r.booking_id, entity: "date_change", entityId: r.id,
          summary: `The 48-hour hold on ${r.to_date} for ${r.booking_id} ran out before it was answered.`,
          details: { from: r.from_date, to: r.to_date },
        });
      }
    }
    await logActivity(logs);
  } catch (err) {
    // Before the migration the columns and table don't exist; nothing to do.
    console.error("[sweep]", err);
  }
}
