// ── POST /api/reminders → email tomorrow's guests a reminder     (staff, or a scheduler)
//
// Guests forgot, or arrived at the wrong hour. The day before each visit,
// every confirmed guest with an email gets one reminder: the date, the
// hours, the balance due on arrival and a link to their booking.
//
// ── Nobody has to remember to run it ──
//
// The Dashboard calls this the first time it is opened each day, and a
// scheduler can call it too with `Authorization: Bearer <NOTIFY_SECRET>`
// (the same secret as /api/notify). Either way each booking is emailed
// ONCE: bookings.reminded_at is stamped when its email goes out, and only
// bookings without one are picked. Before that column exists
// (20261012150000_guest_reminders.sql) nothing is sent, because there would
// be no way to avoid sending twice.
//
// Text messages are separate and manual on purpose: they go from the
// owner's own phone (Dashboard → Tomorrow's arrivals), which is what guests
// here actually read and trust.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { ensureSettings } from "@/lib/settings.server";
import { guestLinkFor } from "@/lib/rebooking.server";
import { loadBookingLedger } from "@/lib/ledger.server";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { isMailConfigured, trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { manilaDate } from "@/lib/finance";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

function schedulerAuthorised(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_SECRET;
  return !!secret && (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!schedulerAuthorised(req)) {
    const denied = await requirePermission(req, "ops.view");
    if (denied) return denied;
  }
  const limited = rateLimit(req, { name: "reminders", limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);
  if (!isMailConfigured()) return NextResponse.json({ success: true, sent: 0, note: "Email isn't set up on this server." });

  await ensureSettings();
  const tomorrow = manilaDate(new Date(Date.now() + 86_400_000));
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("bookings").select("*")
      .eq("date", tomorrow).eq("status", "Confirmed").eq("archived", false).is("reminded_at", null);
    if (error) {
      if (/reminded_at/.test(error.message)) return NextResponse.json({ success: true, sent: 0, enabled: false });
      throw new Error(error.message);
    }

    let sent = 0;
    for (const row of (data ?? []) as BookingRow[]) {
      const b = rowToBooking(row);
      if (!b.email) continue;
      // Claim it first, so two Dashboards opening at once can't both send.
      const claim = await db.from("bookings").update({ reminded_at: new Date().toISOString() })
        .eq("id", b.id).is("reminded_at", null).select("id").maybeSingle();
      if (claim.error || !claim.data) continue;

      const ledger = await loadBookingLedger(b.id);
      const balance = ledger ? Math.max(0, ledger.money.balance) : 0;
      const { subject, html } = buildNoticeEmail(notices.reminder(b, guestLinkFor(b), balance).email);
      const ok = await trySendMail({ to: b.email, subject, html }, `reminder ${b.id}`);
      if (!ok) {
        // Let the next run try again.
        await db.from("bookings").update({ reminded_at: null }).eq("id", b.id);
        continue;
      }
      sent++;
      await logActivity({
        actor: "System", action: "guest.reminded", bookingId: b.id, entity: "booking", entityId: b.id,
        summary: `Emailed ${b.name} a reminder for tomorrow (${b.id}).`,
      });
    }
    return NextResponse.json({ success: true, sent, enabled: true });
  } catch (err) {
    console.error("[/api/reminders POST]", err);
    return NextResponse.json({ success: false, error: "Could not send the reminders." }, { status: 500 });
  }
}
