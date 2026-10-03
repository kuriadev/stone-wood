// ── GET /api/ops → the sales ledger and facility records   (admin only)
//
// One request for everything the Sales and Facilities modules read:
// payments, expenses, daily closings, damage rates, inspections and damage
// records. A one-admin resort has hundreds of rows here, not millions, so
// loading it whole keeps every screen's totals in step with each other.
//
// Needs migration 20260926120000_sales_and_facility_ops.sql. Date-change
// requests (20261003120000) are optional here: before that migration runs
// they come back empty instead of failing the whole panel.

import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseAdmin, rowToPayment, rowToExpense, rowToClosing,
  rowToDamageRate, rowToInspection, rowToDamage, rowToDateChange,
} from "@/lib/supabase";
import { sweepExpired } from "@/lib/rebooking.server";
import { requireAdmin } from "@/lib/auth";
import type {
  PaymentRow, ExpenseRow, DailyClosingRow, DamageRateRow, InspectionRow, DamageRecordRow, DateChangeRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    await sweepExpired();
    const db = getSupabaseAdmin();
    // Pending requests, and the last 60 days of decided ones for history.
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const dateChanges = await db.from("date_change_requests").select("*")
      .or(`status.eq.Pending,created_at.gte.${since}`).order("created_at", { ascending: false });
    if (dateChanges.error) console.error("[/api/ops GET] date changes:", dateChanges.error.message);
    const [payments, expenses, closings, rates, inspections, damages] = await Promise.all([
      db.from("payments").select("*").order("received_at", { ascending: false }),
      db.from("expenses").select("*").order("spent_on", { ascending: false }),
      db.from("daily_closings").select("*").order("closing_date", { ascending: false }),
      db.from("damage_rates").select("*").order("category").order("name"),
      db.from("facility_inspections").select("*").order("inspected_at", { ascending: false }),
      db.from("damage_records").select("*").order("created_at", { ascending: false }),
    ]);
    for (const r of [payments, expenses, closings, rates, inspections, damages]) {
      if (r.error) throw new Error(r.error.message);
    }
    return NextResponse.json({
      success: true,
      payments: (payments.data as PaymentRow[]).map(rowToPayment),
      expenses: (expenses.data as ExpenseRow[]).map(rowToExpense),
      closings: (closings.data as DailyClosingRow[]).map(rowToClosing),
      damageRates: (rates.data as DamageRateRow[]).map(rowToDamageRate),
      inspections: (inspections.data as InspectionRow[]).map(rowToInspection),
      damages: (damages.data as DamageRecordRow[]).map(rowToDamage),
      dateChanges: dateChanges.error ? [] : (dateChanges.data as DateChangeRow[]).map(rowToDateChange),
    });
  } catch (err) {
    console.error("[/api/ops GET]", err);
    return NextResponse.json({ success: false, error: "Could not load sales and facility records." }, { status: 500 });
  }
}
