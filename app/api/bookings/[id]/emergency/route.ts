// ── POST /api/bookings/[id]/emergency → a guest sends an emergency request
//
// Body: { email | t, message, files: [{ name, type, data }] }
//
// Inside the date-change notice window a guest can neither cancel nor move
// online (see /cancel). If an emergency stops them coming, they send what
// happened and their proof here. It is saved to Guest Messages as type
// "Emergency", linked to the booking, for staff to review and approve or
// decline (/api/customer-service/emergency). lib/emergency.ts has the rules.
//
// Public, so it proves ownership like the other guest routes: the booking's
// email, or the signed link the resort sent.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadGuestBooking } from "@/lib/rebooking.server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { rescheduleProblem, sanitizeNotes, startOfToday, toDateStr } from "@/lib/validators";
import { logActivity } from "@/lib/activity.server";
import { ensureSettings } from "@/lib/settings.server";
import { notifyStaff } from "@/lib/staffNotify.server";
import { buildEmergencyAlert } from "@/lib/adminNotify";
import { fmtDate } from "@/lib/utils";
import {
  EMERGENCY_TYPE, EMERGENCY_MESSAGE_MIN, EMERGENCY_MESSAGE_MAX,
  proofProblem, cleanProofName, type ProofFile,
} from "@/lib/emergency";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  await ensureSettings();
  const limited = rateLimit(req, { name: "booking-emergency", limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
  if (!body) return no("Invalid request.");
  const email = String(body.email ?? "").trim().toLowerCase();
  const token = String(body.t ?? "").trim();
  const message = sanitizeNotes(String(body.message ?? "")).slice(0, EMERGENCY_MESSAGE_MAX).trim();
  if (!email && !token) return no("An email address is required.");
  if (message.length < EMERGENCY_MESSAGE_MIN) return no(`Tell the resort what happened (at least ${EMERGENCY_MESSAGE_MIN} characters).`);
  const bad = proofProblem(body.files);
  if (bad) return no(bad);
  const files: ProofFile[] = (body.files as ProofFile[]).map((f, i) => ({ name: cleanProofName(f.name, i), type: f.type, data: f.data }));

  try {
    const b = await loadGuestBooking(id, { email, token, emailProof: String(body?.ep ?? "") });
    if (!b) return no("No booking found for those details.", 404);
    if (b.status === "Cancelled" || b.status === "Completed" || b.status === "ResortCancelled") return no("This booking is already closed.", 409);
    if (b.checkedInAt) return no("You're already checked in. Please speak to the front desk.", 409);
    if (b.date < toDateStr(startOfToday())) return no("This booking's date has already passed.", 409);
    // Outside the window the guest can move or cancel online themselves.
    if (!rescheduleProblem(b.date)) return no("Your visit isn't that close yet: you can change the date yourself from Manage booking.", 409);

    const db = getSupabaseAdmin();
    // One open request per booking: a second one waits for the first answer.
    const open = await db.from("customer_messages").select("id")
      .eq("booking_id", b.id).eq("type", EMERGENCY_TYPE).is("resolution", null).is("archived_at", null).limit(1);
    if (open.error) {
      if (/booking_id|resolution|column/i.test(open.error.message)) return no("Emergency requests aren't switched on yet. Please contact the resort directly.", 503);
      throw new Error(open.error.message);
    }
    if ((open.data ?? []).length) return no("You already sent an emergency request for this booking. The resort will email you their answer.", 409);

    const { error } = await db.from("customer_messages").insert({
      name: b.name, email: b.email, type: EMERGENCY_TYPE,
      message: `Emergency request for ${b.id} (${fmtDate(b.date)}):\n\n${message}`,
      date: new Date().toISOString().slice(0, 10),
      booking_id: b.id, attachments: files, attachment_count: files.length,
    });
    if (error) throw new Error(error.message);

    await logActivity({
      actor: "Guest", action: "message.emergency_request", bookingId: b.id, entity: "booking", entityId: b.id,
      summary: `${b.name} sent an emergency request for ${b.id} (${b.date}) with ${files.length} proof file${files.length === 1 ? "" : "s"}.`,
    });
    // A heads-up to the resort's inbox; the request itself is in Guest Messages.
    await notifyStaff(["Owner", "FrontDesk"], buildEmergencyAlert({ id: b.id, name: b.name, email: b.email, date: b.date, message, files: files.length }), `emergency ${b.id}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/bookings/[id]/emergency POST]", err instanceof Error ? err.message : err);
    return no("Your request couldn't be sent. Please try again, or contact the resort.", 500);
  }
}
