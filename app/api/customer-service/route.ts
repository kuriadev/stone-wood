// ── GET  /api/customer-service  → list messages   (admin only)
// ── POST /api/customer-service  → submit one      (public)
// ── PATCH / DELETE ?id= (archive, delete an archived one) and DELETE ?archived=all (clear the archive) -- admin only
//
// Backed by Supabase. This used to be a module-level array, which meant every
// enquiry a guest sent was lost on the next deploy, and each serverless
// instance held its own copy — so two admins could see two different inboxes.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToCustomerMessage } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeName, sanitizeNotes, isValidEmail, NAME_MIN, NAME_MAX } from "@/lib/validators";
import type { CustomerMessageRow } from "@/types/database";
import { ensureSettings } from "@/lib/settings.server";
import { notifyStaff } from "@/lib/staffNotify.server";
import { buildGuestMessageAlert } from "@/lib/adminNotify";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const MESSAGE_MAX = 2000;
/* "Refund" is its own kind so the owner can see at a glance which
   messages are about money. Refunds are only ever possible when the RESORT
   cancelled, and they are arranged by hand — no guest-facing button issues
   one (see /api/bookings/[id]/refund-request, retired). */
const VALID_TYPES = ["Inquiry", "Complaint", "Feedback", "Suggestion", "Refund", "Other"];

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "messages.handle");
  if (denied) return denied;
  try {
    // Every column but the proof files, which can be large: staff load
    // those when they open an emergency request (./emergency). A database
    // without the emergency columns yet falls back to the plain list.
    const db = getSupabaseAdmin();
    let { data, error } = await db.from("customer_messages")
      .select("id,name,email,type,message,date,archived_at,created_at,booking_id,attachment_count,resolution,resolution_note,resolved_at,resolved_by")
      .order("created_at", { ascending: false });
    if (error && /column/i.test(error.message)) {
      ({ data, error } = await db.from("customer_messages").select("*").order("created_at", { ascending: false }));
    }
    if (error) throw new Error(error.message);
    return NextResponse.json((data as CustomerMessageRow[]).map(rowToCustomerMessage));
  } catch (err) {
    console.error("[/api/customer-service GET]", err);
    return NextResponse.json({ success: false, error: "Could not load messages." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // The owner's contact details and hours go into the email.
  await ensureSettings();
  const limited = rateLimit(req, { name: "customer-service", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJson(req).catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const name = sanitizeName(String(body.name ?? ""));
  const email = String(body.email ?? "").trim().toLowerCase();
  const message = sanitizeNotes(String(body.message ?? "")).slice(0, MESSAGE_MAX);
  const type = VALID_TYPES.includes(String(body.type)) ? String(body.type) : "Other";

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return NextResponse.json({ success: false, error: "A valid name is required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ success: false, error: "A valid email address is required." }, { status: 400 });
  }
  if (message.trim().length < 10) {
    return NextResponse.json({ success: false, error: "A message of at least 10 characters is required." }, { status: 400 });
  }

  try {
    // Built from validated fields rather than spreading the body, so a caller
    // cannot smuggle in archived_at or a forged created_at.
    const { error } = await getSupabaseAdmin().from("customer_messages").insert({
      name, email, type, message,
      date: new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(error.message);
    await logActivity({ actor: "Guest", action: "message.received", entity: "customer_message", summary: `${name} sent a ${type.toLowerCase()} message from the website.` });
    void notifyStaff(["Owner", "FrontDesk"], buildGuestMessageAlert({ name, email, type, message }), "guest-message");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/customer-service POST]", err);
    return NextResponse.json({ success: false, error: "Could not send your message." }, { status: 500 });
  }
}

/** PATCH /api/customer-service?id=  → archive / unarchive   (admin only) */
export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "messages.handle");
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "A numeric message id is required." }, { status: 400 });
  }
  try {
    const body = await readJson(req).catch(() => ({}));
    const archived = !!body.archived;
    const { data, error } = await getSupabaseAdmin()
      .from("customer_messages")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Message not found." }, { status: 404 });
    const m = rowToCustomerMessage(data as CustomerMessageRow);
    await logActivity({
      actor: "Admin", action: archived ? "message.archived" : "message.restored", entity: "customer_message", entityId: id,
      summary: `${archived ? "Archived" : "Restored"} the message from ${m.name} (${m.type}).`,
    });
    return NextResponse.json({ success: true, message: m });
  } catch (err) {
    console.error("[/api/customer-service PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that message." }, { status: 500 });
  }
}

/** DELETE /api/customer-service?id=        → delete one archived message      (admin only)
 *  DELETE /api/customer-service?archived=all → delete every archived message  (admin only)
 *
 *  Only ever archived messages: a message still in the inbox has to be
 *  archived first, so nothing waiting for a reply can be deleted by a slip. */
export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "messages.handle");
  if (denied) return denied;

  const all = req.nextUrl.searchParams.get("archived") === "all";
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!all && !Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Say which message to delete." }, { status: 400 });
  }
  try {
    let q = getSupabaseAdmin().from("customer_messages").delete().not("archived_at", "is", null);
    if (!all) q = q.eq("id", id);
    const { data, error } = await q.select("id,name,type");
    if (error) throw new Error(error.message);
    const gone = (data ?? []) as { id: number; name: string; type: string }[];
    if (!all && gone.length === 0) {
      return NextResponse.json({ success: false, error: "That message is not in the archive." }, { status: 404 });
    }
    await logActivity({
      actor: "Admin", action: "message.deleted", entity: "customer_message", entityId: all ? "archive" : id,
      summary: all
        ? `Cleared the message archive: deleted ${gone.length} archived message${gone.length === 1 ? "" : "s"}.`
        : `Deleted the archived message from ${gone[0].name} (${gone[0].type}).`,
    });
    return NextResponse.json({ success: true, deleted: gone.map((g) => g.id) });
  } catch (err) {
    console.error("[/api/customer-service DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not delete. Nothing was removed." }, { status: 500 });
  }
}
