// ── POST /api/bookings/[id]/details → a guest corrects their own details
//
// Body: { email | t, name, newEmail, contact }
//
// Only the name, email and mobile number change; everything else on the
// booking stays. Once every DETAILS_COOLDOWN_HOURS (lib/guestDetails.ts).
// The old address is told about the change, so a booking can't be quietly
// taken over by someone who learned its reference and email.
//
// Public, so it proves ownership like the other guest routes. A new email
// also changes the booking's signed link, so old links stop working; the
// guest finds the booking with the new email from then on.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { loadGuestBooking, guestToken } from "@/lib/rebooking.server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail, isValidName, isValidPHNumber, sanitizeContact, sanitizeName } from "@/lib/validators";
import { logActivity } from "@/lib/activity.server";
import { ensureSettings } from "@/lib/settings.server";
import { trySendMail } from "@/lib/mailer";
import { buildMessageReplyEmail } from "@/lib/emailTemplate";
import { DETAILS_COOLDOWN_HOURS, detailsCooldownUntil, cooldownLabel } from "@/lib/guestDetails";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  await ensureSettings();
  const limited = rateLimit(req, { name: "booking-details", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
  if (!body) return no("Invalid request.");
  const email = String(body.email ?? "").trim().toLowerCase();
  const token = String(body.t ?? "").trim();
  if (!email && !token) return no("An email address is required.");

  const name = sanitizeName(String(body.name ?? "")).trim();
  const newEmail = String(body.newEmail ?? "").trim().toLowerCase();
  const contact = sanitizeContact(String(body.contact ?? ""));
  if (!isValidName(name)) return no("Enter your full name.");
  if (!isValidEmail(newEmail)) return no("Enter a valid email address.");
  if (!isValidPHNumber(contact)) return no("Enter a valid PH mobile number (09XXXXXXXXX).");

  try {
    const b = await loadGuestBooking(id, { email, token, emailProof: String(body?.ep ?? "") });
    if (!b) return no("No booking found for those details.", 404);
    if (b.status === "Cancelled" || b.status === "Completed" || b.status === "ResortCancelled") {
      return no("This booking is closed, so its details can't be changed.", 409);
    }
    const until = detailsCooldownUntil(b.detailsUpdatedAt);
    if (until) return no(`You changed your details recently. You can change them again after ${cooldownLabel(until)}.`, 429);
    if (name === b.name && newEmail === b.email.toLowerCase() && contact === b.contact) return no("Nothing has changed.");

    const db = getSupabaseAdmin();
    const at = new Date().toISOString();
    // The cooldown guard in the WHERE clause: two tabs applying at once
    // can't both get through.
    let q = db.from("bookings").update({ name, email: newEmail, contact, details_updated_at: at }).eq("id", b.id);
    q = b.detailsUpdatedAt ? q.eq("details_updated_at", b.detailsUpdatedAt) : q.is("details_updated_at", null);
    const { data, error } = await q.select().maybeSingle();
    if (error) {
      if (/details_updated_at/i.test(error.message)) return no("Changing your details online isn't switched on yet. Please contact the resort.", 503);
      throw new Error(error.message);
    }
    if (!data) return no("Your booking changed just now. Search for it again.", 409);

    const changed = [
      name !== b.name && `name: ${b.name} → ${name}`,
      newEmail !== b.email.toLowerCase() && `email: ${b.email} → ${newEmail}`,
      contact !== b.contact && `number: ${b.contact} → ${contact}`,
    ].filter(Boolean) as string[];
    await logActivity({
      actor: "Guest", action: "booking.details_updated_by_guest", bookingId: b.id, entity: "booking", entityId: b.id,
      summary: `${name} updated their details on ${b.id} from their booking page (${changed.join("; ")}).`,
      details: { before: { name: b.name, email: b.email, contact: b.contact }, after: { name, email: newEmail, contact } },
    });

    // Tell the old address, and the new one if it changed.
    const text = `Hello ${name},\n\nThe guest details on booking ${b.id} were changed from Manage booking:\n\n${changed.map((c) => `• ${c}`).join("\n")}\n\nThey can be changed again in ${DETAILS_COOLDOWN_HOURS} hours.${newEmail !== b.email.toLowerCase() ? `\n\nFrom now on, find your booking with ${newEmail}.` : ""}\n\nIf you didn't make this change, contact the resort right away.\n\nStonewood Garden Private Resort`;
    const mail = buildMessageReplyEmail(`Your booking details were updated – ${b.id}`, text);
    const to = [...new Set([b.email.toLowerCase(), newEmail])];
    for (const addr of to) await trySendMail({ to: addr, subject: mail.subject, html: mail.html }, "guest details updated");

    // The page keeps working on the new address with the booking's signed
    // link, since the email the guest confirmed is no longer on it.
    return NextResponse.json({ success: true, booking: rowToBooking(data as BookingRow), t: guestToken(b.id, newEmail) });
  } catch (err) {
    console.error("[/api/bookings/[id]/details POST]", err instanceof Error ? err.message : err);
    return no("Your details couldn't be saved. Please try again.", 500);
  }
}
