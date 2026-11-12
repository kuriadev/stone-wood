// ── GET    /api/closed-dates       → dates the resort is closed   (public)
// ── POST   /api/closed-dates       → close a date                 (admin only)
// ── DELETE /api/closed-dates?date= → reopen a date                (admin only)
//
// Public read: the booking calendar has to grey these out for guests.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { getSupabaseAdmin, rowToBooking } from "@/lib/supabase";
import { bookingCoversDate } from "@/lib/utils";
import type { BookingRow } from "@/types/database";
import { requirePermission } from "@/lib/auth";
import { parseDateStr, isInStaffWindow, staffDateWindow } from "@/lib/validators";
import { closeDateInput, parseInput } from "@/lib/schemas";
import type { ClosedDateRow } from "@/types/database";

import { readJson } from "@/lib/readJson";
export const dynamic = "force-dynamic";

const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseDateStr(s) !== null;

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("closed_dates").select("*").order("date");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, closedDates: (data as ClosedDateRow[]).map((r) => r.date) });
  } catch (err) {
    console.error("[/api/closed-dates GET]", err);
    return NextResponse.json({ success: false, error: "Could not load closed dates." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "calendar.manage");
  if (denied) return denied;
  try {
    const parsed = parseInput(closeDateInput, await readJson(req).catch(() => ({})));
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { date, reason } = parsed.data;
    if (!isInStaffWindow(date)) {
      return NextResponse.json({ success: false, error: `Only dates up to ${staffDateWindow().last} can be closed — as far ahead as guests can book.` }, { status: 400 });
    }

    // Guests still coming that date: the resort cancels their bookings first
    // (Cancel, resort can't host), so each one is told and can pick a new
    // date or a refund. Closing the date alone would leave them coming to a
    // closed resort with no word.
    const active = await getSupabaseAdmin().from("bookings").select("*").in("status", ["Pending", "Confirmed"]).lte("date", date);
    if (active.error) throw new Error(active.error.message);
    const coming = ((active.data ?? []) as BookingRow[]).map(rowToBooking).filter((b) => bookingCoversDate(b, date));
    if (coming.length) {
      return NextResponse.json({
        success: false,
        error: `${coming.length === 1 ? `${coming[0].name} (${coming[0].id}) is` : `${coming.length} bookings are`} booked that date. Cancel ${coming.length === 1 ? "it" : "them"} first with Cancel (resort can't host), so the guest${coming.length === 1 ? " is" : "s are"} told and can pick a new date or a refund. Then close the date.`,
        bookings: coming.map((b) => b.id),
      }, { status: 409 });
    }

    const { error } = await getSupabaseAdmin()
      .from("closed_dates")
      .upsert({ date, reason }, { onConflict: "date" });

    if (error) throw new Error(error.message);
    await logActivity({ actor: "Admin", action: "calendar.closed_date", entity: "closed_date", entityId: date, summary: `Closed the resort on ${date}${reason ? `: ${reason}` : ""}.` });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/closed-dates POST]", err);
    return NextResponse.json({ success: false, error: "Could not close that date." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "calendar.manage");
  if (denied) return denied;

  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!isDateStr(date)) {
    return NextResponse.json({ success: false, error: "A valid YYYY-MM-DD date is required." }, { status: 400 });
  }
  try {
    const { error } = await getSupabaseAdmin().from("closed_dates").delete().eq("date", date);
    if (error) throw new Error(error.message);
    await logActivity({ actor: "Admin", action: "calendar.opened_date", entity: "closed_date", entityId: date, summary: `Opened ${date} for bookings again.` });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/closed-dates DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not reopen that date." }, { status: 500 });
  }
}
