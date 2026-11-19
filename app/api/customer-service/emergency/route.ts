// ── GET   /api/customer-service/emergency?id=  → an emergency request's proof   (staff)
// ── PATCH /api/customer-service/emergency?id=  → approve or decline it          (staff)
//
// Body for PATCH: { decision: "Approved" | "Declined", note? }
//
// The proof is kept off the inbox list (it can be a few MB) and loaded only
// when staff open the message. Deciding records who decided and emails the
// guest. Approving doesn't move the booking by itself: staff then move it to
// the free date agreed with the guest, at no charge, from the booking
// (Move), which runs the usual availability checks. See lib/emergency.ts.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission, sessionOf } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { trySendMail } from "@/lib/mailer";
import { buildMessageReplyEmail } from "@/lib/emailTemplate";
import { logActivity } from "@/lib/activity.server";
import { sanitizeNotes } from "@/lib/validators";
import { ensureSettings } from "@/lib/settings.server";
import { fmtDate } from "@/lib/utils";
import { EMERGENCY_TYPE } from "@/lib/emergency";
import { guestLinkFor } from "@/lib/rebooking.server";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const idOf = (req: NextRequest) => Number(req.nextUrl.searchParams.get("id"));

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "messages.handle");
  if (denied) return denied;
  const id = idOf(req);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "Which message?" }, { status: 400 });
  try {
    const { data, error } = await getSupabaseAdmin().from("customer_messages").select("attachments").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That message no longer exists." }, { status: 404 });
    return NextResponse.json({ success: true, files: (data as { attachments: unknown }).attachments ?? [] });
  } catch (err) {
    console.error("[/api/customer-service/emergency GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Couldn't load the proof." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "messages.handle");
  if (denied) return denied;
  await ensureSettings();
  const id = idOf(req);
  const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
  const decision = body.decision === "Approved" || body.decision === "Declined" ? body.decision : null;
  const note = sanitizeNotes(String(body.note ?? "")).slice(0, 600).trim();
  const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
  if (!Number.isFinite(id)) return no("Which message?");
  if (!decision) return no("Approve or decline the request.");
  if (decision === "Declined" && note.length < 5) return no("Tell the guest why it was declined.");

  try {
    const db = getSupabaseAdmin();
    const cur = await db.from("customer_messages").select("id,name,email,type,booking_id,resolution").eq("id", id).maybeSingle();
    if (cur.error) throw new Error(cur.error.message);
    const m = cur.data as { id: number; name: string; email: string; type: string; booking_id: string | null; resolution: string | null } | null;
    if (!m) return no("That message no longer exists.", 404);
    if (m.type !== EMERGENCY_TYPE) return no("Only a cancellation request can be approved or declined.");
    if (m.resolution) return no(`This request was already ${m.resolution.toLowerCase()}.`, 409);

    let bookingDate = "";
    let link = "";
    type BookingBits = { id: string; date: string; email: string; status: string; checked_in_at: string | null };
    let bookingRow: BookingBits | null = null;
    if (m.booking_id) {
      const bk = await db.from("bookings").select("id,date,email,status,checked_in_at").eq("id", m.booking_id).maybeSingle();
      bookingRow = bk.data as BookingBits | null;
      bookingDate = bookingRow?.date ?? "";
      if (bookingRow?.id && bookingRow.email) link = guestLinkFor({ id: bookingRow.id, email: bookingRow.email });
    }

    const session = sessionOf(req);
    const by = session?.nm || session?.u || "Staff";
    const at = new Date().toISOString();
    // The guard on resolution means two staff deciding at once can't both win.
    const { data: updated, error } = await db.from("customer_messages")
      .update({ resolution: decision, resolution_note: note || null, resolved_at: at, resolved_by: by })
      .eq("id", id).is("resolution", null).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return no("Someone else just answered this request.", 409);

    /* Approving a cancellation request cancels the booking at once (owner,
       2026-11-19): it is what the guest asked for, and the date opens for
       others. Payments are not refunded; a receipt still waiting to be
       checked stays in Pending proof of payment to be settled (kept / no
       payment). Not once the guest has checked in. */
    let cancelled = false;
    if (decision === "Approved" && bookingRow && (bookingRow.status === "Pending" || bookingRow.status === "Confirmed") && !bookingRow.checked_in_at) {
      const reason = (await db.from("customer_messages").select("message").eq("id", id).maybeSingle()).data as { message?: string } | null;
      const why = String(reason?.message ?? "").replace(/^(Cancellation|Emergency) request for [^\n]*:\s*/i, "").trim().slice(0, 200);
      const up = await db.from("bookings")
        .update({ status: "Cancelled", cancel_reason: why ? `Cancellation request approved: ${why}`.slice(0, 200) : "Cancellation request approved", cancelled_at: at })
        .eq("id", bookingRow.id).eq("status", bookingRow.status).select("id").maybeSingle();
      if (up.error) console.error("[/api/customer-service/emergency] cancel:", up.error.message);
      cancelled = !!up.data;
    }

    const ref = m.booking_id ?? "your booking";
    const when = bookingDate ? ` on ${fmtDate(bookingDate)}` : "";
    const text = decision === "Approved"
      ? `Hello ${m.name},\n\nWe've reviewed your cancellation request for ${ref}${when}, and it's approved. We're sorry for what happened.\n\n${cancelled ? "Your booking is now cancelled." : "Your booking can now be cancelled from Manage booking."} As our booking policy says, payments already made aren't refunded when a booking is cancelled by the guest. We'd be glad to welcome you on another date.${link ? `\n\nYour booking: ${link}` : ""}${note ? `\n\n${note}` : ""}\n\nTake care,\nStonewood Garden Private Resort`
      : `Hello ${m.name},\n\nWe've reviewed your cancellation request for ${ref}${when}. We're sorry, but we couldn't approve it.\n\n${note}\n\nYour booking stays as it is. If you have more proof to share, reply to this email.\n\nStonewood Garden Private Resort`;
    const mail = buildMessageReplyEmail(`Your cancellation request – ${ref}: ${decision.toLowerCase()}`, text);
    const emailed = await trySendMail({ to: m.email, subject: mail.subject, html: mail.html }, `emergency ${decision.toLowerCase()}`);

    await logActivity({
      actor: "Admin", action: decision === "Approved" ? "message.emergency_approved" : "message.emergency_declined",
      bookingId: m.booking_id ?? undefined, entity: "customer_message", entityId: id,
      summary: `${by} ${decision.toLowerCase()} ${m.name}'s cancellation request for ${ref}.${cancelled ? " The booking is cancelled." : ""}${note ? ` Note: ${note}` : ""}`,
    });
    return NextResponse.json({ success: true, resolution: decision, resolutionNote: note || undefined, resolvedAt: at, resolvedBy: by, emailed, cancelled });
  } catch (err) {
    console.error("[/api/customer-service/emergency PATCH]", err instanceof Error ? err.message : err);
    return no("Couldn't save the decision. Try again.", 500);
  }
}
