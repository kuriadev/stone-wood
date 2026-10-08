// ── POST /api/bookings/[id]/move → the owner moves a booking   (admin only)
//
// Body: { date, note? }
//
// The manual counterpart to the guest's own date change. A guest asks and
// waits for approval; the owner moves it directly, because they are the
// approval. It exists for the cases the automatic path cannot reach: a guest
// who phones instead of using the website, a date agreed by message, or a
// request that went wrong somewhere and has to be put right by hand.
//
// It is NOT a shortcut around the rules. The move runs through `checkMove`,
// the same function the guest route and the approval route use, so a date
// that is closed, full, double-booked or outside the booking window is
// refused here too. The owner can override their own calendar by opening the
// date, not by bypassing the check.
//
// Every move writes a `date_change_requests` row (requestedBy "Resort",
// already Approved) so it appears in Daily Operations → Reschedules beside
// the guest-initiated ones. One place shows every date change, whoever made
// it — which is the whole point of that section.
//
// It also books a guest the RESORT cancelled onto the date agreed with them
// by call or chat ("Set a new date"): the booking moves and is confirmed
// again, with what they paid carried over, exactly as approving their own
// pick does. That is the way out once their time to pick online has passed.
// A date they already picked is answered in Reschedules instead.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { checkMove, moveBooking, guestLinkFor, sweepExpired } from "@/lib/rebooking.server";
import { manilaDate } from "@/lib/finance";
import { sanitizeNotes } from "@/lib/validators";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { fmt, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = String(body.date ?? "");
  const note = sanitizeNotes(String(body.note ?? "")).slice(0, 300);
  const no = (error: string, status = 409) => NextResponse.json({ success: false, error }, { status });

  try {
    await sweepExpired();
    const db = getSupabaseAdmin();
    const cur = await db.from("bookings").select("*").eq("id", id).maybeSingle();
    if (cur.error) throw new Error(cur.error.message);
    if (!cur.data) return no("Booking not found.", 404);

    const { rowToBooking } = await import("@/lib/supabase");
    const b = rowToBooking(cur.data as never);

    const rebook = b.status === "ResortCancelled";
    if (b.status !== "Confirmed" && b.status !== "Pending" && !rebook) {
      return no(`A ${b.status.toLowerCase()} booking can't be moved.`);
    }
    if (b.checkedInAt) return no("This group has already checked in.");
    if (rebook) {
      const picked = await db.from("date_change_requests").select("to_date")
        .eq("booking_id", b.id).eq("status", "Pending").maybeSingle();
      if (picked.error) throw new Error(picked.error.message);
      if (picked.data) {
        return no(`${b.name} already picked ${fmtDate((picked.data as { to_date: string }).to_date)}. Approve or decline it in Reschedules first.`);
      }
    } else if (b.date <= manilaDate()) {
      // Same cut-off the guest and approval routes enforce: a visit that has
      // been and gone is not rescheduled, it is rebooked. (A resort-cancelled
      // booking's old date was called off, so only the new date matters.)
      return no("That visit date has already passed. Take a new booking instead.");
    }

    const check = await checkMove(b, date);
    if (!check.ok) return no(check.error);

    const now = new Date().toISOString();
    const saved = await moveBooking(b, date, rebook
      ? { status: "Confirmed", confirmed_at: now, choice_deadline: null, held_amount: 0 }
      : {});
    if (!saved) return no("This booking just changed. Refresh and try again.");

    await db.from("date_change_requests").insert({
      booking_id: b.id, from_date: b.date, to_date: date,
      requested_by: "Resort", status: "Approved", decided_at: now,
      note: note || (rebook ? "New date agreed with the guest after the resort cancelled." : "Moved by the resort."),
    });

    const link = guestLinkFor(saved);
    const n = rebook ? notices.rebooked(saved, b.date, link) : notices.dateChangeApproved(saved, b.date, link);
    if (saved.email) await trySendMail({ to: saved.email, ...buildNoticeEmail(n.email) }, `${rebook ? "rebooked" : "booking-moved"} ${saved.id}`);

    await logActivity({
      actor: "Admin", action: rebook ? "booking.rebooked" : "booking.moved", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: rebook
        ? `Set a new date for ${saved.id} (${saved.name}) after the resort cancelled ${fmtDate(b.date)}: ${fmtDate(date)}. It is confirmed again${(b.heldAmount ?? 0) > 0 ? `, with the ${fmt(b.heldAmount ?? 0)} they paid carried over` : ""}.${note ? ` Note: ${note}` : ""}`
        : `Moved ${saved.id} (${saved.name}) from ${fmtDate(b.date)} to ${fmtDate(date)} by hand.${note ? ` Reason: ${note}` : ""}`,
      details: { from: b.date, to: date, note, ...(rebook ? { rebook: true } : {}) },
    });

    return NextResponse.json({ success: true, booking: saved, sms: n.sms });
  } catch (err) {
    console.error("[/api/bookings/[id]/move POST]", err);
    return NextResponse.json({ success: false, error: "Could not move that booking." }, { status: 500 });
  }
}
