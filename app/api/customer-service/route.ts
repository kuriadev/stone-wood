// ── GET  /api/customer-service  → list messages   (admin only)
// ── POST /api/customer-service  → submit one      (public)
//
// Backed by Supabase. This used to be a module-level array, which meant every
// enquiry a guest sent was lost on the next deploy, and each serverless
// instance held its own copy — so two admins could see two different inboxes.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToCustomerMessage } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeName, sanitizeNotes, isValidEmail, NAME_MIN, NAME_MAX } from "@/lib/validators";
import type { CustomerMessageRow } from "@/types/database";

export const dynamic = "force-dynamic";

const MESSAGE_MAX = 2000;
const VALID_TYPES = ["Inquiry", "Complaint", "Feedback", "Suggestion", "Other"];

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("customer_messages").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json((data as CustomerMessageRow[]).map(rowToCustomerMessage));
  } catch (err) {
    console.error("[/api/customer-service GET]", err);
    return NextResponse.json({ success: false, error: "Could not load messages." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { name: "customer-service", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await req.json().catch(() => null);
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
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/customer-service POST]", err);
    return NextResponse.json({ success: false, error: "Could not send your message." }, { status: 500 });
  }
}

/** PATCH /api/customer-service?id=  → archive / unarchive   (admin only) */
export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "A numeric message id is required." }, { status: 400 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const archived = !!body.archived;
    const { data, error } = await getSupabaseAdmin()
      .from("customer_messages")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Message not found." }, { status: 404 });
    return NextResponse.json({ success: true, message: rowToCustomerMessage(data as CustomerMessageRow) });
  } catch (err) {
    console.error("[/api/customer-service PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that message." }, { status: 500 });
  }
}
