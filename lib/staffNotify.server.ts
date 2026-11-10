// ── Emailing the staff who need to act (server only)
//
// Each staff account can have a confirmed email (Staff Accounts). The
// system's own emails go to the people whose job they are:
//
//   a booking arrived / was made at the desk     super admin + front desk
//   a guest asks to move a date, sends a message
//     or an emergency request                     super admin + front desk
//   front desk asks the super admin to approve    super admin
//   the day was closed                            super admin
//   the morning briefing                          super admin + front desk
//   who is arriving to prepare for                caretaker (morning list, and
//                                                 at once for a booking made
//                                                 for today or tomorrow)
//
// The resort's own inbox (ADMIN_NOTIFY_EMAIL or the contact email) keeps
// getting what the super admin gets, as it always has. If nobody in a role
// has an email yet, their emails go to that inbox instead, so nothing is
// lost while accounts are being set up. Only active accounts are emailed.

import { getSupabaseAdmin } from "@/lib/supabase";
import { trySendMail } from "@/lib/mailer";
import { adminNotifyTo, buildCaretakerArrivalAlert, type MailOut } from "@/lib/adminNotify";
import { manilaDate } from "@/lib/finance";
import type { Booking } from "@/types/booking";
import type { StaffRole } from "@/lib/permissions";

/** Confirmed emails of the active staff in these roles. Empty before the
 *  staff email migration (20261114120000_staff_email.sql). */
export async function staffEmails(roles: StaffRole[]): Promise<string[]> {
  try {
    const { data, error } = await getSupabaseAdmin().from("staff").select("email, email_verified_at, role, active").in("role", roles);
    if (error) return [];
    return ((data ?? []) as { email: string | null; email_verified_at: string | null; active: boolean }[])
      .filter((s) => s.active && s.email && s.email_verified_at)
      .map((s) => s.email!.trim().toLowerCase());
  } catch {
    return [];
  }
}

/** Who gets an email meant for these roles (see the table above). */
export async function recipientsFor(roles: StaffRole[]): Promise<string[]> {
  const staff = await staffEmails(roles);
  const inbox = adminNotifyTo().toLowerCase();
  const list = roles.includes("Owner") || staff.length === 0 ? [...staff, inbox] : staff;
  return [...new Set(list.filter(Boolean))];
}

/** Send to everyone in these roles, one email each (so nobody sees the
 *  others' addresses). Never throws; returns who it reached. */
export async function notifyStaff(roles: StaffRole[], mail: MailOut, label: string): Promise<string[]> {
  const to = await recipientsFor(roles);
  const sent: string[] = [];
  for (const addr of to) {
    if (await trySendMail({ to: addr, subject: mail.subject, html: mail.html }, `${label} → ${addr}`)) sent.push(addr);
  }
  return sent;
}

/** A booking just made for today or tomorrow: the caretaker's morning list
 *  may already have gone out without it, so they hear at once. Later dates
 *  wait for the morning list. */
export async function alertCaretakerIfSoon(b: Booking): Promise<void> {
  try {
    const today = manilaDate();
    const [y, m, d] = today.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    if (b.date !== today && b.date !== tomorrow) return;
    if (b.status === "Cancelled" || b.status === "ResortCancelled") return;
    const { data } = await getSupabaseAdmin().from("rooms").select("id, name");
    await notifyStaff(["Caretaker"], buildCaretakerArrivalAlert(b, today, (data ?? []) as { id: number; name: string }[]), `caretaker-arrival ${b.id}`);
  } catch (err) {
    console.error("[staffNotify] caretaker alert:", err instanceof Error ? err.message : err);
  }
}
