// ── GET    /api/bookings/[id]  → one booking
// ── PATCH  /api/bookings/[id]  → update status / fields   (admin only)
// ── DELETE /api/bookings/[id]  → delete                   (admin only)
//
// Replaces the Mongoose placeholder. GET is public but deliberately narrow:
// the cancellation page needs to look a booking up, and it can only do so
// with BOTH the reference and the matching email, so a reference alone
// cannot be used to enumerate other people's bookings.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeNotes } from "@/lib/validators";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

const STATUSES = ["Paid", "Confirmed", "Completed", "Cancelled"] as const;

/** Next 16 hands route params in as a promise. */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  // Admins may fetch any booking. Everyone else must prove they know the
  // email on it, which is what the Cancel Booking page asks for.
  const isAdmin = requireAdmin(req) === null;
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  if (!isAdmin) {
    const limited = rateLimit(req, { name: "booking-lookup", limit: 20, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) return tooManyRequests(limited.retryAfter);
    if (!email) {
      return NextResponse.json({ success: false, error: "An email address is required." }, { status: 400 });
    }
  }

  try {
    let q = getSupabaseAdmin().from("bookings").select("*").eq("id", id);
    if (!isAdmin) q = q.eq("email", email!);

    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      // Same response whether the reference is wrong or the email does not
      // match it — distinguishing the two would confirm that a reference is
      // real to someone guessing.
      return NextResponse.json({ success: false, error: "No booking found for those details." }, { status: 404 });
    }
    return NextResponse.json({ success: true, booking: rowToBooking(data as BookingRow) });
  } catch (err) {
    console.error("[/api/bookings/[id] GET]", err);
    return NextResponse.json({ success: false, error: "Could not load that booking." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    }

    // An allow-list, not a spread: a PATCH must never be able to rewrite the
    // id, the created_at, or the guest's own details.
    const patch: Partial<BookingRow> = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: "Unknown status." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.paymentProof !== undefined) patch.payment_proof = !!body.paymentProof;
    if (body.cancelReason !== undefined) patch.cancel_reason = sanitizeNotes(String(body.cancelReason)).slice(0, 500) || null;
    if (body.notes !== undefined) patch.notes = sanitizeNotes(String(body.notes));
    // Archiving used to live only in the browser and was lost on reload.
    if (body.archived !== undefined) {
      patch.archived = !!body.archived;
      patch.archived_at = body.archived ? (typeof body.archivedAt === "string" ? body.archivedAt : new Date().toISOString()) : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("bookings").update(patch).eq("id", id).select().maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Booking not found." }, { status: 404 });

    return NextResponse.json({ success: true, booking: rowToBooking(data as BookingRow) });
  } catch (err) {
    console.error("[/api/bookings/[id] PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that booking." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    const { error } = await getSupabaseAdmin().from("bookings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/bookings/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not delete that booking." }, { status: 500 });
  }
}
