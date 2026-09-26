// ── POST /api/closings → close (liquidate) one day            (admin only)
//
// The admin enters the opening float and the cash actually counted. The
// server works out everything else from the ledger itself, so the expected
// figure cannot be typed in or nudged from the browser:
//
//   expected cash = opening float + cash received − cash spent − cash refunded
//   difference    = counted − expected   (negative = cash is short)
//
// It also stores the whole day's income minus expenses (all methods), the
// "income vs expenses" side of liquidation. Closing the same day again
// replaces the earlier closing — the figures are recomputed from scratch.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToClosing, rowToPayment, rowToExpense } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { cleanText, isDateStr } from "@/lib/money";
import { manilaDate, round2, signedAmount } from "@/lib/finance";
import type { DailyClosingRow, PaymentRow, ExpenseRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isDateStr(b.date)) return NextResponse.json({ success: false, error: "Choose the day to close." }, { status: 400 });
  if (b.date > manilaDate()) return NextResponse.json({ success: false, error: "A day can't be closed before it happens." }, { status: 400 });

  const openingFloat = Math.max(0, Math.round((Number(b.openingFloat) || 0) * 100) / 100);
  const counted = Math.round(Number(b.countedCash) * 100) / 100;
  if (!Number.isFinite(counted) || counted < 0) return NextResponse.json({ success: false, error: "Enter the cash you counted (0 or more)." }, { status: 400 });

  const date = b.date;
  // The Manila day, as an absolute time range.
  const start = new Date(`${date}T00:00:00+08:00`).toISOString();
  const end = new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86_400_000).toISOString();

  try {
    const db = getSupabaseAdmin();
    const [p, e] = await Promise.all([
      db.from("payments").select("*").eq("voided", false).gte("received_at", start).lt("received_at", end),
      db.from("expenses").select("*").eq("voided", false).eq("spent_on", date),
    ]);
    if (p.error) throw new Error(p.error.message);
    if (e.error) throw new Error(e.error.message);
    const payments = (p.data as PaymentRow[]).map(rowToPayment);
    const expenses = (e.data as ExpenseRow[]).map(rowToExpense);

    const cashIn = round2(payments.filter((x) => x.method === "Cash").reduce((s, x) => s + signedAmount(x), 0));
    const cashOut = round2(expenses.filter((x) => x.method === "Cash").reduce((s, x) => s + x.amount, 0));
    const expected = round2(openingFloat + cashIn - cashOut);
    const totalCollected = round2(payments.reduce((s, x) => s + signedAmount(x), 0));
    const totalExpenses = round2(expenses.reduce((s, x) => s + x.amount, 0));

    const { data, error } = await db.from("daily_closings").upsert({
      closing_date: date,
      opening_float: openingFloat,
      cash_in: cashIn,
      cash_out: cashOut,
      expected_cash: expected,
      counted_cash: counted,
      difference: round2(counted - expected),
      total_collected: totalCollected,
      total_expenses: totalExpenses,
      notes: cleanText(b.notes, 300),
      closed_at: new Date().toISOString(),
    }, { onConflict: "closing_date" }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, closing: rowToClosing(data as DailyClosingRow) });
  } catch (err) {
    console.error("[/api/closings POST]", err);
    return NextResponse.json({ success: false, error: "Could not close the day." }, { status: 500 });
  }
}
