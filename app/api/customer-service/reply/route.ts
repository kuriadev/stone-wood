// ── POST /api/customer-service/reply { id, message }      (staff: messages.handle)
//
// Sends staff's reply to a guest message by email, from the resort's own
// Gmail account (nodemailer, lib/mailer.ts). The address comes from the
// stored message, never from the screen, so a reply can only go to the guest
// who wrote in. The reply text is kept in the activity log.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { buildMessageReplyEmail, GUEST_MESSAGE_MAX } from "@/lib/emailTemplate";
import { logActivity } from "@/lib/activity.server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail } from "@/lib/validators";
import type { CustomerMessageRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "messages.handle");
  if (denied) return denied;
  const limited = rateLimit(req, { name: "cs-reply", limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id);
  const message = String(b.message ?? "").trim();
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "Which message?" }, { status: 400 });
  if (!message) return NextResponse.json({ success: false, error: "Write a reply before sending." }, { status: 400 });
  if (message.length > GUEST_MESSAGE_MAX) return NextResponse.json({ success: false, error: `A reply can be at most ${GUEST_MESSAGE_MAX} characters.` }, { status: 400 });
  if (!isMailConfigured()) return NextResponse.json({ success: false, error: "Email isn't set up on the server yet, so the reply can't be sent." }, { status: 503 });

  try {
    const { data, error } = await getSupabaseAdmin().from("customer_messages").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const m = data as CustomerMessageRow | null;
    if (!m) return NextResponse.json({ success: false, error: "That message no longer exists." }, { status: 404 });
    if (!m.email || !isValidEmail(m.email)) return NextResponse.json({ success: false, error: "This message has no valid email to reply to." }, { status: 400 });

    const { subject, html } = buildMessageReplyEmail("Re: your message to Stonewood Garden", message);
    await sendMail({ to: m.email, subject, html });
    await logActivity({
      actor: "Admin", action: "email.message_reply", entity: "message", entityId: m.id,
      summary: `Replied by email to ${m.name} (${m.email}).`,
      details: { message: message.slice(0, GUEST_MESSAGE_MAX) },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/customer-service/reply POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "The reply couldn't be sent. Try again in a moment." }, { status: 502 });
  }
}
