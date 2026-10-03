// ── GET /api/guest-link?id= → the link that opens a guest's booking page
//                                                              (admin only)
//
// For "Text the guest": a text message carries this link so the guest lands
// on their own booking (status, payments, refund, date choice) without
// typing a reference or an email address. The link is signed with the
// server's secret, so it can't be guessed from the reference.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { guestLinkFor } from "@/lib/rebooking.server";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    const { data, error } = await getSupabaseAdmin().from("bookings").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    return NextResponse.json({ success: true, link: guestLinkFor(rowToBooking(data as BookingRow)) });
  } catch (err) {
    console.error("[/api/guest-link GET]", err);
    return NextResponse.json({ success: false, error: "Could not make the link." }, { status: 500 });
  }
}
