// ── GET  /api/bookings  → list bookings          (admin only)
// ── POST /api/bookings  → create a booking       (public)
//
// Replaces the Mongoose placeholder that used to live here. Reads and writes
// go through the service-role client, so RLS is bypassed on purpose: the
// guard on this route is the admin session, not the database policy. The
// anon key never touches these rows from the browser.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, bookingToRow } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail, isValidPHNumber, sanitizeName, sanitizeNotes, NAME_MIN, NAME_MAX } from "@/lib/validators";
import type { BookingRow } from "@/types/database";
import type { Booking } from "@/types/booking";

export const dynamic = "force-dynamic";

const STATUSES = ["Paid", "Confirmed", "Completed", "Cancelled"] as const;

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, bookings: (data as BookingRow[]).map(rowToBooking) });
  } catch (err) {
    console.error("[/api/bookings GET]", err);
    return NextResponse.json({ success: false, error: "Could not load bookings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Public: a guest creates this at the end of Book Now.
  const limited = rateLimit(req, { name: "booking-create", limit: 12, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Partial<Booking> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    }

    // Re-validated server-side. The browser already checks these, but a
    // client-side check is a convenience, never a control.
    const name = sanitizeName(String(body.name ?? ""));
    const email = String(body.email ?? "").trim().toLowerCase();
    const contact = String(body.contact ?? "").trim();

    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return NextResponse.json({ success: false, error: "A valid name is required." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: "A valid email address is required." }, { status: 400 });
    }
    if (!isValidPHNumber(contact)) {
      return NextResponse.json({ success: false, error: "A valid PH contact number is required." }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ success: false, error: "A booking id is required." }, { status: 400 });
    }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) {
      return NextResponse.json({ success: false, error: "A valid date is required." }, { status: 400 });
    }

    const guests = Number(body.guests);
    if (!Number.isFinite(guests) || guests < 1) {
      return NextResponse.json({ success: false, error: "Guest count must be at least 1." }, { status: 400 });
    }

    // Totals are recomputed on the client and arrive over the wire; clamp them
    // to sane bounds so a tampered payload cannot store a negative or absurd
    // figure. Authoritative pricing belongs on the server and is tracked
    // separately — see the note in the handover.
    const total = Math.max(0, Math.min(Number(body.total) || 0, 1_000_000));
    const downpayment = Math.max(0, Math.min(Number(body.downpayment) || 0, total));

    const status = STATUSES.includes(body.status as typeof STATUSES[number]) ? body.status! : "Paid";

    const row = bookingToRow({
      ...(body as Booking),
      id: body.id.slice(0, 32),
      name,
      email,
      contact,
      guests: Math.round(guests),
      total,
      downpayment,
      status,
      rooms: Array.isArray(body.rooms) ? body.rooms.map(Number).filter(Number.isFinite) : [],
      overtime: Math.max(0, Math.round(Number(body.overtime) || 0)),
      notes: sanitizeNotes(String(body.notes ?? "")),
    });

    const { data, error } = await getSupabaseAdmin()
      .from("bookings")
      .insert(row)
      .select()
      .single();

    if (error) {
      // 23505 = unique violation, i.e. this booking id already exists.
      if (error.code === "23505") {
        return NextResponse.json({ success: false, error: "That booking reference already exists." }, { status: 409 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, booking: rowToBooking(data as BookingRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/bookings POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the booking." }, { status: 500 });
  }
}
