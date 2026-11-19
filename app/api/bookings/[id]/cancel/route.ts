// ── POST /api/bookings/[id]/cancel  → a guest cancels their own booking
//
// Public, so it proves ownership the same way the lookup does: the caller
// must know BOTH the reference and the email on it. A wrong pair gets the
// same "not found" as a missing booking, so a reference alone can't be
// used to cancel — or even confirm the existence of — someone else's stay.
//
// The Cancel Booking page used to flip the status in the browser only; the
// database never heard about it, so the admin kept seeing the booking as
// active and the date stayed blocked.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToBooking, missingNewColumn, withoutNewColumns } from "@/lib/supabase";
import { loadGuestBooking } from "@/lib/rebooking.server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeNotes, startOfToday, toDateStr } from "@/lib/validators";
import { CANCELLATION_TYPE } from "@/lib/emergency";
import { buildGuestCancelAlert } from "@/lib/adminNotify";
import { notifyStaff } from "@/lib/staffNotify.server";
import { fmtDate } from "@/lib/utils";
import type { BookingRow } from "@/types/database";
import { ensureSettings } from "@/lib/settings.server";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  // The owner's contact details and hours go into the email.
  await ensureSettings();
  const limited = rateLimit(req, { name: "booking-cancel", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await readJson(req).catch(() => null)) as { email?: unknown; t?: unknown; ep?: unknown; reason?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const token = String(body?.t ?? "").trim();
  const reason = sanitizeNotes(String(body?.reason ?? "")).slice(0, 200) || null;
  if (!email && !token) {
    return NextResponse.json({ success: false, error: "An email address is required." }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    // The email on the booking, or the signed link the resort sent them.
    const b = await loadGuestBooking(id, { email, token, emailProof: String(body?.ep ?? "") });
    if (!b) {
      return NextResponse.json({ success: false, error: "No booking found for those details." }, { status: 404 });
    }
    if (b.status === "Cancelled") {
      return NextResponse.json({ success: false, error: "This booking is already cancelled." }, { status: 409 });
    }
    if (b.status === "ResortCancelled") {
      return NextResponse.json({ success: false, error: "The resort cancelled this booking. Choose a new date or a refund instead." }, { status: 409 });
    }
    if (b.checkedInAt) {
      return NextResponse.json({ success: false, error: "You're already checked in, so the booking can't be cancelled." }, { status: 409 });
    }
    if (b.status === "Completed") {
      return NextResponse.json({ success: false, error: "A completed stay can't be cancelled." }, { status: 409 });
    }
    if (b.date < toDateStr(startOfToday())) {
      return NextResponse.json({ success: false, error: "This booking's date has already passed." }, { status: 409 });
    }
    // A guest may cancel any time before they check in, even on the day or
    // straight after booking: no proof, no approval, the reason optional
    // (owner's rule, 2026-11-19). It used to be closed inside the date-change
    // notice window and sent to an emergency request instead, so a booking
    // for today could never be cancelled. Payments are not refunded.

    // The status guard in the WHERE clause means two cancel clicks, or a
    // cancel racing an admin action, can't both "win".
    const change = { status: "Cancelled", cancel_reason: reason, cancelled_at: new Date().toISOString() };
    let { data: updated, error: upErr } = await db
      .from("bookings").update(change).eq("id", id).eq("status", b.status).select().maybeSingle();
    if (upErr && missingNewColumn(upErr)) {
      ({ data: updated, error: upErr } = await db
        .from("bookings").update(withoutNewColumns(change)).eq("id", id).eq("status", b.status).select().maybeSingle());
    }
    if (upErr) throw new Error(upErr.message);
    if (!updated) {
      return NextResponse.json({ success: false, error: "This booking changed just now — please search again." }, { status: 409 });
    }

    // A receipt still waiting in "Pending proof of payment" has nothing left
    // to confirm.
    try {
      await db.from("payment_proofs").update({ status: "Replaced" }).eq("booking_id", b.id).eq("status", "Submitted");
    } catch { /* no proofs table yet */ }

    // The notice for staff: Guest Messages ("Booking Cancelled"), the
    // Dashboard's live messages and Reminders. Nothing to approve.
    const notice = {
      name: b.name, email: b.email, type: CANCELLATION_TYPE,
      message: `${b.id} · ${fmtDate(b.date)} was cancelled by the guest.\nReason: ${reason ?? "No reason given."}`,
      date: new Date().toISOString().slice(0, 10),
      booking_id: b.id,
    };
    try {
      let ins = await db.from("customer_messages").insert(notice);
      if (ins.error && /booking_id|column/i.test(ins.error.message)) {
        const { booking_id: _drop, ...plain } = notice;
        void _drop;
        ins = await db.from("customer_messages").insert(plain);
      }
      if (ins.error) console.error("[/api/bookings/[id]/cancel] notice:", ins.error.message);
    } catch (e) {
      console.error("[/api/bookings/[id]/cancel] notice:", e instanceof Error ? e.message : e);
    }
    await notifyStaff(["Owner", "FrontDesk"], buildGuestCancelAlert({ id: b.id, name: b.name, email: b.email, date: b.date, reason }), `guest-cancel ${b.id}`);

    await logActivity({
      actor: "Guest", action: "booking.cancelled_by_guest", bookingId: b.id, entity: "booking", entityId: b.id,
      summary: `${b.name} cancelled ${b.id} (${b.date}) from their booking page.${reason ? ` Reason: ${reason}` : ""} Under the policy, payments are not refunded.`,
      details: { reason, previousStatus: b.status },
    });
    return NextResponse.json({ success: true, booking: rowToBooking(updated as BookingRow) });
  } catch (err) {
    console.error("[/api/bookings/[id]/cancel POST]", err);
    return NextResponse.json({ success: false, error: "Could not cancel that booking. Please try again." }, { status: 500 });
  }
}
