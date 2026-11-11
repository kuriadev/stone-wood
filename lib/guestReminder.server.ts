// ── "See you tomorrow": the guest's reminder email (server only)
//
// Sent once per booking, the day before the visit. Two things send it:
//
//   • /api/reminders, run each day, for every confirmed booking tomorrow;
//   • a booking made (or confirmed) for TOMORROW gets it at once, because
//     that day's run may already have gone out without it.
//
// bookings.reminded_at is claimed before sending, so a guest is never
// reminded twice. Before that column exists nothing is sent.

import { getSupabaseAdmin } from "@/lib/supabase";
import { guestLinkFor } from "@/lib/rebooking.server";
import { loadBookingLedger } from "@/lib/ledger.server";
import { notices } from "@/lib/notices";
import { buildNoticeEmail } from "@/lib/emailTemplate";
import { trySendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity.server";
import { manilaDate } from "@/lib/finance";
import type { Booking } from "@/types/booking";

/** Email one guest their reminder. True when it went out. */
export async function sendGuestReminder(b: Booking): Promise<boolean> {
  if (!b.email) return false;
  const db = getSupabaseAdmin();
  // Claim it first, so two runs at once can't both send.
  const claim = await db.from("bookings").update({ reminded_at: new Date().toISOString() })
    .eq("id", b.id).is("reminded_at", null).select("id").maybeSingle();
  if (claim.error || !claim.data) return false;

  const ledger = await loadBookingLedger(b.id);
  const balance = ledger ? Math.max(0, ledger.money.balance) : 0;
  const { subject, html } = buildNoticeEmail(notices.reminder(b, guestLinkFor(b), balance).email);
  const ok = await trySendMail({ to: b.email, subject, html }, `reminder ${b.id}`);
  if (!ok) {
    // Let the next run try again.
    await db.from("bookings").update({ reminded_at: null }).eq("id", b.id);
    return false;
  }
  await logActivity({
    actor: "System", action: "guest.reminded", bookingId: b.id, entity: "booking", entityId: b.id,
    summary: `Emailed ${b.name} a reminder for tomorrow (${b.id}).`,
  });
  return true;
}

/** A confirmed booking whose visit is tomorrow: remind the guest now.
 *  Never throws. */
export async function remindGuestIfTomorrow(b: Booking): Promise<void> {
  try {
    if (b.status !== "Confirmed") return;
    const tomorrow = manilaDate(new Date(Date.now() + 86_400_000));
    if (b.date !== tomorrow) return;
    await sendGuestReminder(b);
  } catch (err) {
    console.error("[guestReminder]", err instanceof Error ? err.message : err);
  }
}
