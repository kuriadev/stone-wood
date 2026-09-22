// ── GET  /api/customer-service  → list submitted messages   (admin only)
// ── POST /api/customer-service  → submit a message          (public)
//
// Two problems here before: GET handed every visitor's name, email address and
// message text to anyone who typed the URL, and POST appended to an unbounded
// module-level array with no validation, so a loop could fill the instance's
// memory with whatever it liked.
//
// The store is still in memory and still resets on redeploy — that is the
// pre-existing behaviour and moving it to Supabase is a separate change. What
// is fixed is who can read it and what can go into it.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeName, sanitizeNotes, isValidEmail, NAME_MIN, NAME_MAX } from "@/lib/validators";
import type { CustomerMessage } from "@/types/admin";

export const dynamic = "force-dynamic";

/** Oldest entries are dropped past this. A bounded buffer is the difference
 *  between a full inbox and an out-of-memory crash. */
const MAX_STORED = 500;
const MESSAGE_MAX = 2000;
const VALID_TYPES = ["Inquiry", "Complaint", "Feedback", "Suggestion", "Other"];

let customerMessages: CustomerMessage[] = [];

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(customerMessages);
}

export async function POST(req: NextRequest) {
  // Public endpoint, so this is the only thing standing between the form and
  // a script: ten submissions an hour per IP.
  const limited = rateLimit(req, { name: "customer-service", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  // Client-side validation is a convenience for honest users; it is not a
  // control. Everything is re-checked here against the same rules.
  const name = sanitizeName(String(body.name ?? ""));
  const email = String(body.email ?? "").trim().toLowerCase();
  const message = sanitizeNotes(String(body.message ?? "")).slice(0, MESSAGE_MAX);
  const type = VALID_TYPES.includes(String(body.type)) ? String(body.type) : "Other";

  // Same bounds the form enforces, so the server is not the looser of the two.
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return NextResponse.json({ success: false, error: "A valid name is required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ success: false, error: "A valid email address is required." }, { status: 400 });
  }
  if (message.trim().length < 10) {
    return NextResponse.json({ success: false, error: "A message of at least 10 characters is required." }, { status: 400 });
  }

  // The record is rebuilt from validated fields rather than spreading the
  // request body, so a caller cannot smuggle in extra properties.
  const entry = {
    id: Date.now(),
    name,
    email,
    type,
    message,
    date: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }),
    createdAt: new Date().toISOString(),
  } as CustomerMessage;

  customerMessages.unshift(entry);
  if (customerMessages.length > MAX_STORED) customerMessages.length = MAX_STORED;

  return NextResponse.json({ success: true });
}
