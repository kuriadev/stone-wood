// ── POST /api/bookings/[id]/charge → add a charge on the day      (admin only)
//
// Body: { kind: "overtime" | "guests" | "room", hours?, guests?, roomId? }
//
// Overtime, extra guests or a room the group took at the resort (see
// lib/charges.ts for the rules and prices). The price is worked out here from
// the database, whatever the screen showed, and the booking must still fit
// the day with the change (checkFits: no overtime into a booked Night slot, no
// overbooking the shared pool, no room someone else has). The booking's
// total goes up by the charge; the money is collected like any balance, so it
// reaches Sales and the day's cash count by the usual route.
//
// Allowed until the booking is settled (Completed): overtime is usually
// noticed as the group checks out. Every charge is in the activity log.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToBooking, rowToRoom } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { checkFits } from "@/lib/rebooking.server";
import { priceCharge, type ChargeRequest } from "@/lib/charges";
import { logActivity } from "@/lib/activity.server";
import { fmt } from "@/lib/utils";
import type { BookingRow, RoomRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const request: ChargeRequest = {
    kind: body.kind as ChargeRequest["kind"],
    hours: Number(body.hours) || undefined,
    guests: Number(body.guests) || undefined,
    roomId: Number(body.roomId) || undefined,
  };
  const no = (error: string, status = 409) => NextResponse.json({ success: false, error }, { status });

  try {
    const db = getSupabaseAdmin();
    const [bk, rm] = await Promise.all([
      db.from("bookings").select("*").eq("id", id).maybeSingle(),
      db.from("rooms").select("*"),
    ]);
    if (bk.error) throw new Error(bk.error.message);
    if (rm.error) throw new Error(rm.error.message);
    if (!bk.data) return no("That booking no longer exists.", 404);
    const b = rowToBooking(bk.data as BookingRow);
    if (b.status !== "Pending" && b.status !== "Confirmed") {
      return no(b.status === "Completed"
        ? "This booking is already settled. Charges are added before the group settles."
        : "This booking is cancelled, so nothing can be charged on it.");
    }

    const priced = priceCharge(b, request, (rm.data as RoomRow[]).map(rowToRoom));
    if (!priced.ok) return no(priced.error, 400);

    const fits = await checkFits({ ...b, ...priced.next });
    if (!fits.ok) return no(fits.error);

    const total = b.total + priced.amount;
    // Only if nothing changed the booking since it was read, so a double
    // click can't add the same charge twice.
    const { data, error } = await db.from("bookings")
      .update({ overtime: priced.next.overtime, guests: priced.next.guests, rooms: priced.next.rooms, total })
      .eq("id", b.id).eq("total", b.total).in("status", ["Pending", "Confirmed"])
      .select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return no("This booking just changed. Refresh and try again.");
    const saved = rowToBooking(data as BookingRow);

    // A room added while the group is on site is in use from now on.
    if (request.kind === "room" && saved.checkedInAt && !saved.checkedOutAt) {
      await db.from("facilities").update({ status: "In Use", last_used_booking_id: saved.id, last_used_guest_name: saved.name })
        .eq("category", "Room").eq("room_id", Number(request.roomId)).neq("status", "Under Maintenance");
    }

    await logActivity({
      actor: "Admin", action: "booking.charge_added", bookingId: saved.id, entity: "booking", entityId: saved.id,
      summary: `Added ${priced.label} to ${saved.id} (${saved.name}): +${fmt(priced.amount)}. The total is now ${fmt(total)}.`,
      details: { kind: request.kind, amount: priced.amount, before: { total: b.total, overtime: b.overtime ?? 0, guests: b.guests, rooms: b.rooms ?? [] }, after: priced.next },
    });
    return NextResponse.json({ success: true, booking: saved, amount: priced.amount });
  } catch (err) {
    console.error("[/api/bookings/[id]/charge POST]", err);
    return NextResponse.json({ success: false, error: "Could not add the charge." }, { status: 500 });
  }
}
