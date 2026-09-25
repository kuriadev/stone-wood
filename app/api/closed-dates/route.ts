// ── GET    /api/closed-dates       → dates the resort is closed   (public)
// ── POST   /api/closed-dates       → close a date                 (admin only)
// ── DELETE /api/closed-dates?date= → reopen a date                (admin only)
//
// Public read: the booking calendar has to grey these out for guests.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { parseDateStr } from "@/lib/validators";
import { closeDateInput, parseInput } from "@/lib/schemas";
import type { ClosedDateRow } from "@/types/database";

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
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const parsed = parseInput(closeDateInput, await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { date, reason } = parsed.data;

    const { error } = await getSupabaseAdmin()
      .from("closed_dates")
      .upsert({ date, reason }, { onConflict: "date" });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/closed-dates POST]", err);
    return NextResponse.json({ success: false, error: "Could not close that date." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!isDateStr(date)) {
    return NextResponse.json({ success: false, error: "A valid YYYY-MM-DD date is required." }, { status: 400 });
  }
  try {
    const { error } = await getSupabaseAdmin().from("closed_dates").delete().eq("date", date);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/closed-dates DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not reopen that date." }, { status: 500 });
  }
}
