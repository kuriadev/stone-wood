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
import { isMailConfigured } from "@/lib/mailer";
import { sendGuestReminder } from "@/lib/guestReminder.server";
import { manilaDate } from "@/lib/finance";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import type { BookingRow } from "@/types/database";
import { sendNoShowOffers } from "@/lib/noShow.server";

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
  // The day after a no-show, the guest is offered a new date
  // (lib/noShow.server.ts). Its window opens even without email.
  let noShowOffers = 0;
  try { noShowOffers = await sendNoShowOffers(); } catch (err) { console.error("[/api/reminders] no-show offers", err); }
  if (!isMailConfigured()) return NextResponse.json({ success: true, sent: 0, noShowOffers, note: "Email isn't set up on this server." });

  await ensureSettings();
  const tomorrow = manilaDate(new Date(Date.now() + 86_400_000));
  try {
    const { data, error } = await getSupabaseAdmin().from("bookings").select("*")
      .eq("date", tomorrow).eq("status", "Confirmed").eq("archived", false).is("reminded_at", null);
    if (error) {
      if (/reminded_at/.test(error.message)) return NextResponse.json({ success: true, sent: 0, noShowOffers, enabled: false });
      throw new Error(error.message);
    }

    let sent = 0;
    for (const row of (data ?? []) as BookingRow[]) {
      const b = rowToBooking(row);
      if (await sendGuestReminder(b)) sent++;
    }
    return NextResponse.json({ success: true, sent, noShowOffers, enabled: true });
  } catch (err) {
    console.error("[/api/reminders POST]", err);
    return NextResponse.json({ success: false, error: "Could not send the reminders." }, { status: 500 });
  }
}
