// ── The day after a no-show: offer the guest a new date
//
// A booking marked a no-show (OperationsTab → Mark no-show) is cancelled
// and keeps what was paid. The day after, the guest is emailed a link to
// pick a new date within NO_SHOW_CHOICE_DAYS (lib/rebooking.ts). This runs
// from POST /api/reminders, which the Dashboard calls each day and a
// scheduler may call too.
//
// "The day after" is the next Manila calendar day, not 24 hours: the
// Dashboard calls this once a day, so a 24-hour rule would slip a booking
// marked in the afternoon to the morning after next.
//
// Each booking is offered once: no_show_notified_at is claimed before the
// email goes out, and released again if it fails so the next run retries.
// A guest with no email still gets the window; the desk can text them the
// link from the booking.

import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { guestLinkFor } from "@/lib/rebooking.server";
import { loadBookingLedger } from "@/lib/ledger.server";
import { NO_SHOW_CHOICE_DAYS, fmtDeadline } from "@/lib/rebooking";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { isMailConfigured, trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { manilaDate } from "@/lib/finance";
import type { BookingRow } from "@/types/database";

/** Offer every no-show from before today its new-date window. Returns how
 *  many guests were emailed. Before 20261106120000_booking_no_show.sql has
 *  run there is nothing to do. */
export async function sendNoShowOffers(): Promise<number> {
  const db = getSupabaseAdmin();
  const today = manilaDate();
  const { data, error } = await db.from("bookings").select("*")
    .eq("status", "Cancelled").eq("no_show", true).eq("archived", false).is("no_show_notified_at", null);
  if (error) {
    if (/no_show/.test(error.message)) return 0;
    throw new Error(error.message);
  }

  const mail = isMailConfigured();
  let sent = 0;
  for (const row of (data ?? []) as BookingRow[]) {
    // Marked today: wait for tomorrow.
    if (!row.cancelled_at || manilaDate(new Date(row.cancelled_at)) >= today) continue;
    const now = new Date();
    const deadline = new Date(now.getTime() + NO_SHOW_CHOICE_DAYS * 86_400_000).toISOString();
    const claim = await db.from("bookings")
      .update({ no_show_notified_at: now.toISOString(), choice_deadline: deadline })
      .eq("id", row.id).eq("status", "Cancelled").is("no_show_notified_at", null).select().maybeSingle();
    if (claim.error || !claim.data) continue;
    const b = rowToBooking(claim.data as BookingRow);

    if (b.email && mail) {
      const ledger = await loadBookingLedger(b.id);
      const paid = ledger ? Math.max(0, ledger.money.paid) : 0;
      const balance = Math.max(0, b.total - paid);
      const { subject, html } = buildNoticeEmail(notices.noShowRebookOffer(b, paid, balance, deadline, guestLinkFor(b)).email);
      if (!(await trySendMail({ to: b.email, subject, html }, `no-show offer ${b.id}`))) {
        await db.from("bookings").update({ no_show_notified_at: null, choice_deadline: null }).eq("id", b.id);
        continue;
      }
      sent++;
    }
    await logActivity({
      actor: "System", action: "booking.noshow_offer", bookingId: b.id, entity: "booking", entityId: b.id,
      summary: b.email && mail
        ? `Emailed ${b.name} after the no-show on ${b.id}: they can pick a new date until ${fmtDeadline(deadline)}.`
        : `${b.name} can pick a new date for ${b.id} until ${fmtDeadline(deadline)}.${b.email ? " Email isn't set up on the server" : " They have no email"}, so text them the link from the booking.`,
    });
  }
  return sent;
}
