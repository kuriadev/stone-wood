// ── GET    /api/bookings/[id]  → one booking
// ── PATCH  /api/bookings/[id]  → update status / fields   (admin only)
// ── DELETE /api/bookings/[id]  → delete                   (admin only)
//
// GET is public but deliberately narrow: the guest's booking page needs to
// look a booking up, and it can only do so with the reference AND either
// the email on it or the signed token from the link the resort sent them
// (?t=), so a reference alone cannot be used to enumerate other people's
// bookings. A guest gets the booking plus what their page shows: the
// payments and refunds on it, and any date-change request.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeNotes } from "@/lib/validators";
import { loadGuestBooking, sweepExpired } from "@/lib/rebooking.server";
import { GUEST_CHANGES_ALLOWED } from "@/lib/rebooking";
import { manilaDate } from "@/lib/finance";
import { logActivity, changes } from "@/lib/activity.server";
import { fmtDate } from "@/lib/utils";
import { rowToPayment, rowToDateChange, missingNewColumn, withoutNewColumns } from "@/lib/supabase";
import type { BookingRow, PaymentRow, DateChangeRow } from "@/types/database";
import type { Booking } from "@/types/booking";

export const dynamic = "force-dynamic";

const STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled", "ResortCancelled"] as const;

/** Which status changes a plain update may make; null when allowed.
 *
 *  Completing a stay is not one of them. It goes through check-out
 *  (/api/checkout, the inspection and any damage) and settlement
 *  (/api/settle, the final payment), so a booking can never read
 *  "Completed" while Sales still shows its balance owed and its facilities
 *  still read "In Use". */
function statusChangeError(from: string, to: string, checkedIn: boolean): string | null {
  if (to === "Completed") return "A stay is completed by checking the group out and collecting what's owed, so the payment and the inspection are recorded. Use Complete in Bookings or Check out in Daily Operations.";
  if (from === "ResortCancelled") return "This booking is waiting for the guest to choose a new date or a refund.";
  if (to === "ResortCancelled") return "Use \"Cancel (resort can't host)\", which tells the guest and holds their payment.";
  if (from === "Completed" || from === "Cancelled") return `This booking is already ${from.toLowerCase()} and can't be changed.`;
  if (to === "Pending") return "A confirmed booking can't be moved back to pending.";
  if (to === "Cancelled" && checkedIn) return "This group is already checked in. Check them out instead of cancelling.";
  return null; // Pending → Confirmed, and Pending / Confirmed → Cancelled
}

/** Next 16 hands route params in as a promise. */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  // Admins may fetch any booking. Everyone else must prove they know the
  // email on it, or hold the signed link the resort sent them.
  const isAdmin = requireAdmin(req) === null;
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() || null;
  const token = req.nextUrl.searchParams.get("t")?.trim() || null;

  if (!isAdmin) {
    const limited = rateLimit(req, { name: "booking-lookup", limit: 20, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) return tooManyRequests(limited.retryAfter);
    if (!email && !token) {
      return NextResponse.json({ success: false, error: "An email address is required." }, { status: 400 });
    }
  }

  try {
    await sweepExpired();
    const db = getSupabaseAdmin();
    let booking: Booking | null;
    if (isAdmin && !email && !token) {
      const { data, error } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      booking = data ? rowToBooking(data as BookingRow) : null;
    } else {
      booking = await loadGuestBooking(id, { email, token });
    }
    if (!booking) {
      // Same response whether the reference is wrong or the email does not
      // match it — distinguishing the two would confirm that a reference is
      // real to someone guessing.
      return NextResponse.json({ success: false, error: "No booking found for those details." }, { status: 404 });
    }

    // What the guest's page shows besides the booking. Date changes are
    // optional until their migration has run.
    const [pays, dc] = await Promise.all([
      db.from("payments").select("*").eq("booking_id", booking.id).eq("voided", false).order("received_at"),
      db.from("date_change_requests").select("*").eq("booking_id", booking.id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (pays.error) throw new Error(pays.error.message);
    const dateChanges = dc.error ? [] : (dc.data as DateChangeRow[]).map(rowToDateChange);
    const used = dateChanges.filter((r) => r.requestedBy === "Guest" && r.status === "Approved").length;

    return NextResponse.json({
      success: true,
      booking,
      payments: (pays.data as PaymentRow[]).map(rowToPayment).map((p) => ({
        type: p.type, method: p.method, amount: p.amount, reference: p.reference, receivedAt: p.receivedAt,
      })),
      dateChanges,
      changesLeft: Math.max(0, GUEST_CHANGES_ALLOWED - used),
      today: manilaDate(),
    });
  } catch (err) {
    console.error("[/api/bookings/[id] GET]", err);
    return NextResponse.json({ success: false, error: "Could not load that booking." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    }

    // An allow-list, not a spread: a PATCH must never be able to rewrite the
    // id, the created_at, or the guest's own details.
    const cur = await getSupabaseAdmin().from("bookings").select("*").eq("id", id).maybeSingle();
    if (cur.error) throw new Error(cur.error.message);
    if (!cur.data) return NextResponse.json({ success: false, error: "Booking not found." }, { status: 404 });
    const before = cur.data as BookingRow;

    const patch: Partial<BookingRow> = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: "Unknown status." }, { status: 400 });
      }
      if (body.status !== before.status) {
        const why = statusChangeError(before.status, body.status, !!before.checked_in_at);
        if (why) return NextResponse.json({ success: false, error: why }, { status: 409 });
        if (body.status === "Confirmed") patch.confirmed_at = new Date().toISOString();
        if (body.status === "Cancelled") patch.cancelled_at = new Date().toISOString();
      }
      patch.status = body.status;
    }
    if (body.paymentProof !== undefined) patch.payment_proof = !!body.paymentProof;
    if (body.cancelReason !== undefined) patch.cancel_reason = sanitizeNotes(String(body.cancelReason)).slice(0, 500) || null;
    if (body.notes !== undefined) patch.notes = sanitizeNotes(String(body.notes));
    // Archiving used to live only in the browser and was lost on reload.
    if (body.archived !== undefined) {
      patch.archived = !!body.archived;
      patch.archived_at = body.archived ? (typeof body.archivedAt === "string" ? body.archivedAt : new Date().toISOString()) : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
    }

    let { data, error } = await getSupabaseAdmin()
      .from("bookings").update(patch).eq("id", id).select().maybeSingle();
    if (error && missingNewColumn(error)) {
      ({ data, error } = await getSupabaseAdmin().from("bookings").update(withoutNewColumns(patch)).eq("id", id).select().maybeSingle());
    }

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Booking not found." }, { status: 404 });
    const after = data as BookingRow;

    // The sync sends the whole booking on every change; only what actually
    // changed is logged.
    const who = `${after.id} (${after.name}, ${fmtDate(after.date)})`;
    const logs = [];
    if (after.status !== before.status) {
      logs.push(after.status === "Confirmed"
        ? { action: "booking.confirmed", summary: `Accepted ${who}.` }
        : after.status === "Cancelled"
          ? { action: "booking.cancelled", summary: `Cancelled ${who}.${after.cancel_reason ? ` Reason: ${after.cancel_reason}` : ""}` }
          : { action: "booking.status", summary: `Changed ${who} from ${before.status} to ${after.status}.` });
    }
    if (after.archived !== before.archived) {
      logs.push({ action: after.archived ? "booking.archived" : "booking.restored", summary: `${after.archived ? "Archived" : "Restored"} ${who}.` });
    }
    if (after.notes !== before.notes) logs.push({ action: "booking.notes", summary: `Edited the notes on ${who}.` });
    const diff = changes(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, ["archived_at", "confirmed_at", "cancelled_at"]);
    await logActivity(logs.map((l) => ({ actor: "Admin" as const, bookingId: after.id, entity: "booking", entityId: after.id, details: { changes: diff }, ...l })));

    return NextResponse.json({ success: true, booking: rowToBooking(after) });
  } catch (err) {
    console.error("[/api/bookings/[id] PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that booking." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    const { data, error } = await getSupabaseAdmin().from("bookings").delete().eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      const b = data as BookingRow;
      await logActivity({
        actor: "Admin", action: "booking.deleted", bookingId: b.id, entity: "booking", entityId: b.id,
        summary: `Deleted ${b.id} (${b.name}, ${fmtDate(b.date)}, ${b.status}).`,
        details: { booking: { ...b, refund_receipt: b.refund_receipt ? "(photo)" : null } },
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/bookings/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not delete that booking." }, { status: 500 });
  }
}
