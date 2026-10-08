// ── POST /api/bookings/[id]/refund-request → the guest chose a refund  (admin)
//
// After the resort cancels, a guest who wants their money back instead of a
// new date says so to the owner by call or chat (the cancellation email and
// their booking page list the owner's contacts). The owner records it here:
// the booking is cancelled, what the guest paid becomes a refund OWED, and a
// new date they had picked is withdrawn (chooseRefund in
// lib/rebooking.server.ts). The owner then sends the money and records it
// with "Send refund", which tells the guest it was sent.
//
// This route used to be the guest's own "request a refund" button. That was
// retired so refunds are always arranged with a person; it is now admin-only.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { chooseRefund } from "@/lib/rebooking.server";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    const { data, error } = await getSupabaseAdmin().from("bookings").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });

    const r = await chooseRefund(rowToBooking(data as BookingRow));
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 409 });
    return NextResponse.json({ success: true, booking: r.booking, owed: r.owed });
  } catch (err) {
    console.error("[/api/bookings/[id]/refund-request POST]", err);
    return NextResponse.json({ success: false, error: "Could not record the refund." }, { status: 500 });
  }
}
