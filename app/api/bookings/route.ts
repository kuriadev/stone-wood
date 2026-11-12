// ── GET  /api/bookings  → list bookings          (admin only)
// ── POST /api/bookings  → a walk-in, encoded at the front desk   (bookings.edit)
//
// Online guests don't book here: they pay by GCash and upload the receipt
// (POST /api/payment-proofs), and staff confirm it. This route only takes
// a walk-in, with a valid admin session; email is optional.
//
// Reads and writes go through the service-role client, so RLS is bypassed on
// purpose: the guard is the admin session.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { requirePermission, isAdminRequest } from "@/lib/auth";
import { alertCaretakerIfSoon } from "@/lib/staffNotify.server";
import { remindGuestIfTomorrow } from "@/lib/guestReminder.server";
import { checkWalkIn, saveWalkIn } from "@/lib/walkIn.server";
import type { BookingRow } from "@/types/database";

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "bookings.view");
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
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  if (isAdminRequest(req)) {
    const denied = await requirePermission(req, "bookings.edit");
    if (denied) return denied;
    return createWalkIn(body);
  }
  return NextResponse.json(
    { success: false, error: "Online bookings are sent with a proof of payment from the booking page." },
    { status: 401 }
  );
}

// ── Admin: walk-in encoded at the front desk ────────────────────────
// The rules live in lib/walkIn.server.ts, shared with the import of
// bookings taken while offline (/api/bookings/import).
async function createWalkIn(body: Record<string, unknown>) {
  try {
    const checked = await checkWalkIn(body);
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: checked.status });
    const saved = await saveWalkIn(checked.plan);
    // A walk-in is usually for today: the caretaker gets it ready.
    void alertCaretakerIfSoon(saved);
    void remindGuestIfTomorrow(saved);
    return NextResponse.json({ success: true, booking: saved }, { status: 201 });
  } catch (err) {
    console.error("[/api/bookings POST walk-in]", err);
    return NextResponse.json({ success: false, error: "Could not save the booking." }, { status: 500 });
  }
}
