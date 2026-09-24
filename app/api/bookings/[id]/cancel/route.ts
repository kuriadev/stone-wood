// ── POST /api/bookings/[id]/cancel  → a guest cancels their own booking
//
// Public, so it proves ownership the same way the lookup does: the caller
// must know BOTH the reference and the email on it. A wrong pair gets the
// same "not found" as a missing booking, so a reference alone can't be
// used to cancel — or even confirm the existence of — someone else's stay.
//
// The Cancel Booking page used to flip the status in the browser only; the
// database never heard about it, so the admin kept seeing the booking as
// active and the date stayed blocked.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { sanitizeNotes, startOfToday, toDateStr } from "@/lib/validators";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = rateLimit(req, { name: "booking-cancel", limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { email?: unknown; reason?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const reason = sanitizeNotes(String(body?.reason ?? "")).slice(0, 200) || null;
  if (!email) {
    return NextResponse.json({ success: false, error: "An email address is required." }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("bookings").select("*").eq("id", id).eq("email", email).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ success: false, error: "No booking found for those details." }, { status: 404 });
    }

    const b = rowToBooking(data as BookingRow);
    if (b.status === "Cancelled") {
      return NextResponse.json({ success: false, error: "This booking is already cancelled." }, { status: 409 });
    }
    if (b.status === "Completed") {
      return NextResponse.json({ success: false, error: "A completed stay can't be cancelled." }, { status: 409 });
    }
    if (b.date < toDateStr(startOfToday())) {
      return NextResponse.json({ success: false, error: "This booking's date has already passed." }, { status: 409 });
    }

    // The status guard in the WHERE clause means two cancel clicks, or a
    // cancel racing an admin action, can't both "win".
    const { data: updated, error: upErr } = await db
      .from("bookings")
      .update({ status: "Cancelled", cancel_reason: reason })
      .eq("id", id)
      .eq("status", b.status)
      .select()
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!updated) {
      return NextResponse.json({ success: false, error: "This booking changed just now — please search again." }, { status: 409 });
    }

    return NextResponse.json({ success: true, booking: rowToBooking(updated as BookingRow) });
  } catch (err) {
    console.error("[/api/bookings/[id]/cancel POST]", err);
    return NextResponse.json({ success: false, error: "Could not cancel that booking. Please try again." }, { status: 500 });
  }
}
