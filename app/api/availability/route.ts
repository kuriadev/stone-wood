// ── GET /api/availability  → which dates, rooms and capacity are taken
//
// Public. Feeds the calendars and the capacity checks on the guest pages.
//
// Before this, guests had no real booking data at all: the full list is
// admin-only (it holds names, emails and phone numbers), so the public
// pages fell back to sample bookings and showed dates as free that were
// actually full. This returns only what availability needs — no id, name,
// email, contact, notes or amounts.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { startOfToday, toDateStr } from "@/lib/validators";
import type { BookingResource, BookingSlot, BookingStatus, BookingTier } from "@/types/booking";

export const dynamic = "force-dynamic";

export interface AvailabilitySlot {
  date: string;
  guests: number;
  status: BookingStatus;
  rooms: number[];
  resource: BookingResource | null;
  tier: BookingTier | null;
  slot: BookingSlot | null;
  /** Day overtime hours — a Day group with overtime also holds the Night. */
  overtime: number;
  /** Only used to tell a legacy night booking (no slot) from a day one. */
  package: string;
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { name: "availability", limit: 300, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  // One day of slack behind "today": the server may run in UTC while the
  // resort is in UTC+8, and dropping a day the guest still sees as today
  // would show it as free.
  const from = startOfToday();
  from.setDate(from.getDate() - 1);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("bookings")
      .select("date, guests, status, rooms, resource, tier, slot, overtime, package")
      .neq("status", "Cancelled")
      .gte("date", toDateStr(from))
      .order("date");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, slots: (data ?? []) as AvailabilitySlot[] });
  } catch (err) {
    console.error("[/api/availability GET]", err);
    return NextResponse.json({ success: false, error: "Could not load availability." }, { status: 500 });
  }
}
