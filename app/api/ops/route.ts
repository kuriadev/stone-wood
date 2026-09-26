// ── GET /api/ops → the sales ledger and facility records   (admin only)
//
// One request for everything the Sales and Facilities modules read:
// payments, expenses, daily closings, damage rates, inspections and damage
// records. A one-admin resort has hundreds of rows here, not millions, so
// loading it whole keeps every screen's totals in step with each other.
//
// Needs migration 20260926120000_sales_and_facility_ops.sql.

import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseAdmin, rowToPayment, rowToExpense, rowToClosing,
  rowToDamageRate, rowToInspection, rowToDamage,
} from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import type {
  PaymentRow, ExpenseRow, DailyClosingRow, DamageRateRow, InspectionRow, DamageRecordRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const db = getSupabaseAdmin();
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
    });
  } catch (err) {
    console.error("[/api/ops GET]", err);
    return NextResponse.json({ success: false, error: "Could not load sales and facility records." }, { status: 500 });
  }
}
