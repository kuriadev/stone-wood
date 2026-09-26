// ── POST  /api/expenses      → record money spent            (admin only)
// ── PATCH /api/expenses?id=  → void an expense, with a reason (admin only)
//
// The "money out" half of liquidation. Like payments, an expense is voided
// rather than deleted so the day's figures can always be traced.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToExpense } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { parseAmount, cleanText, isDateStr } from "@/lib/money";
import { EXPENSE_CATEGORIES, MANUAL_METHODS } from "@/types/finance";
import type { ExpenseRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });

  const amount = parseAmount(b.amount);
  const description = cleanText(b.description, 200);
  if (!EXPENSE_CATEGORIES.includes(b.category as never)) return NextResponse.json({ success: false, error: "Choose a category." }, { status: 400 });
  if (!MANUAL_METHODS.includes(b.method as never)) return NextResponse.json({ success: false, error: "Choose how it was paid." }, { status: 400 });
  if (description.length < 2) return NextResponse.json({ success: false, error: "Describe what the money was spent on." }, { status: 400 });
  if (amount === null) return NextResponse.json({ success: false, error: "Enter an amount greater than zero." }, { status: 400 });
  if (!isDateStr(b.spentOn)) return NextResponse.json({ success: false, error: "Enter the date it was spent." }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin().from("expenses").insert({
      category: b.category, description, amount, method: b.method, spent_on: b.spentOn,
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, expense: rowToExpense(data as ExpenseRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/expenses POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the expense." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "An expense id is required." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = cleanText(b.reason, 300);
  if (reason.length < 3) return NextResponse.json({ success: false, error: "Say why this expense is being voided." }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin().from("expenses")
      .update({ voided: true, void_reason: reason, voided_at: new Date().toISOString() })
      .eq("id", id).eq("voided", false).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "That expense is already voided or does not exist." }, { status: 409 });
    return NextResponse.json({ success: true, expense: rowToExpense(data as ExpenseRow) });
  } catch (err) {
    console.error("[/api/expenses PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not void the expense." }, { status: 500 });
  }
}
