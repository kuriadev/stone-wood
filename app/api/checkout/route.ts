// ── POST /api/checkout → inspect, charge and check a group out   (admin only)
//
// The resort's rule: facilities are inspected BEFORE the group leaves, and
// any damage penalty is paid on the spot together with the stay balance.
// So one request does the whole check-out:
//
//   1. records the after-use inspection of every facility the booking used;
//   2. records each damaged item, with its penalty computed HERE as
//        quantity × the rate on the owner's rate list (+ an adjustment,
//        which needs a reason);
//   3. records the balance and penalty payments handed over;
//   4. marks the booking Completed;
//   5. flags the facilities "Needs Cleaning" (or "Under Maintenance" where
//      the owner says the damage takes it out of service).
//
// Settlement must be complete — balance and penalties both paid — unless
// the owner explicitly leaves it unpaid and says why. That exception keeps
// a guest who genuinely cannot pay from blocking the check-out, while
// leaving the amount visible as a receivable in Sales.
//
// Everything is validated before anything is written. Supabase's client has
// no multi-statement transaction, so if a write fails part-way the rows
// already written for THIS check-out are removed again before answering.
// The booking is then exactly as it was, and the check-out can be retried
// without duplicating a payment or a penalty.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToFacility, rowToDamageRate } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { cleanItems } from "@/lib/inspection.server";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { cleanText } from "@/lib/money";
import { round2 } from "@/lib/finance";
import { fmt } from "@/lib/utils";
import { MANUAL_METHODS } from "@/types/finance";
import type { FacilityRow, DamageRateRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Method = (typeof MANUAL_METHODS)[number];

interface PayIn { amount: number; method: Method; reference: string }

function readPay(v: unknown): PayIn | null | "bad" {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, unknown>;
  const amount = Math.round(Number(x.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!MANUAL_METHODS.includes(x.method as Method)) return "bad";
  const reference = cleanText(x.reference, 80);
  if (x.method !== "Cash" && !reference) return "bad";
  return { amount, method: x.method as Method, reference };
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bookingId = cleanText(b?.bookingId, 40);
  if (!b || !bookingId) return NextResponse.json({ success: false, error: "Choose a booking." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const ledger = await loadBookingLedger(bookingId);
    if (!ledger) return NextResponse.json({ success: false, error: "That booking no longer exists." }, { status: 404 });
    const { booking, money } = ledger;
    if (booking.status === "Completed" || booking.status === "Cancelled") {
      return NextResponse.json({ success: false, error: `This booking is already ${booking.status.toLowerCase()}.` }, { status: 409 });
    }

    const [fs, rs] = await Promise.all([
      db.from("facilities").select("*"),
      db.from("damage_rates").select("*"),
    ]);
    if (fs.error) throw new Error(fs.error.message);
    if (rs.error) throw new Error(rs.error.message);
    const used = facilitiesForBooking(booking, (fs.data as FacilityRow[]).map(rowToFacility));
    const usedIds = new Set(used.map((f) => f.id));
    const rates = new Map((rs.data as DamageRateRow[]).map(rowToDamageRate).map((r) => [r.id, r]));

    const items = cleanItems(b.items, usedIds);

    // ── Damages, priced on the server ────────────────────────────────
    const rawDamages = Array.isArray(b.damages) ? b.damages.slice(0, 50) : [];
    const damages: {
      facility_name: string; rate_id: number | null; item_name: string; quantity: number;
      unit_rate: number; adjustment: number; adjustment_reason: string; amount: number; description: string;
    }[] = [];
    for (const r of rawDamages) {
      const x = r as Record<string, unknown>;
      const quantity = Math.round(Number(x.quantity));
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 500) {
        return NextResponse.json({ success: false, error: "Each damaged item needs a quantity of at least 1." }, { status: 400 });
      }
      const rateId = x.rateId === null || x.rateId === undefined || x.rateId === "" ? null : Number(x.rateId);
      let itemName: string;
      let unitRate: number;
      if (rateId !== null) {
        const rate = rates.get(rateId);
        if (!rate) return NextResponse.json({ success: false, error: "A damaged item is no longer on the rate list. Refresh and try again." }, { status: 409 });
        itemName = rate.name;
        unitRate = rate.rate; // the rate list is the price, not the browser
      } else {
        itemName = cleanText(x.itemName, 80);
        unitRate = Math.round(Number(x.unitRate) * 100) / 100;
        if (itemName.length < 2 || !Number.isFinite(unitRate) || unitRate < 0) {
          return NextResponse.json({ success: false, error: "An item not on the rate list needs a name and a price." }, { status: 400 });
        }
      }
      const adjustment = Math.round((Number(x.adjustment) || 0) * 100) / 100;
      const adjustmentReason = cleanText(x.adjustmentReason, 200);
      if (adjustment !== 0 && adjustmentReason.length < 3) {
        return NextResponse.json({ success: false, error: `Say why the penalty for "${itemName}" was adjusted.` }, { status: 400 });
      }
      const amount = round2(Math.max(0, quantity * unitRate + adjustment));
      damages.push({
        facility_name: cleanText(x.facilityName, 80),
        rate_id: rateId,
        item_name: itemName,
        quantity,
        unit_rate: unitRate,
        adjustment,
        adjustment_reason: adjustmentReason,
        amount,
        description: cleanText(x.description, 200),
      });
    }
    const newPenalty = round2(damages.reduce((s, d) => s + d.amount, 0));

    // ── Settlement ───────────────────────────────────────────────────
    const balanceDue = money.balance;
    const penaltyDue = round2(money.penaltyDue + newPenalty);
    const payBalance = readPay(b.balancePayment);
    const payPenalty = readPay(b.penaltyPayment);
    if (payBalance === "bad" || payPenalty === "bad") {
      return NextResponse.json({ success: false, error: "Choose a payment method, and enter the reference number for GCash or bank transfer." }, { status: 400 });
    }
    if (payBalance && payBalance.amount > balanceDue) {
      return NextResponse.json({ success: false, error: `The balance is only ${fmt(balanceDue)}.` }, { status: 409 });
    }
    if (payPenalty && payPenalty.amount > penaltyDue) {
      return NextResponse.json({ success: false, error: `The penalty is only ${fmt(penaltyDue)}.` }, { status: 409 });
    }
    const paidNow = (payBalance?.amount ?? 0) + (payPenalty?.amount ?? 0);
    const leftOwing = round2(balanceDue + penaltyDue - paidNow);
    const leaveUnpaid = !!b.leaveUnpaid;
    const notes = cleanText(b.notes, 300);
    if (leftOwing > 0 && !leaveUnpaid) {
      return NextResponse.json({ success: false, error: `${fmt(leftOwing)} is still owed. Collect it, or mark it as left unpaid with a reason.` }, { status: 409 });
    }
    if (leftOwing > 0 && leaveUnpaid && notes.length < 3) {
      return NextResponse.json({ success: false, error: "Say why the guest is leaving without paying in full." }, { status: 400 });
    }

    // ── Writes (undone again if any step fails) ──────────────────────
    const now = new Date().toISOString();
    let inspectionId: number | null = null;
    let paymentIds: number[] = [];
    let completed = false;
    try {
      const insp = await db.from("facility_inspections").insert({
        booking_id: booking.id, stage: "Checkout", items, notes,
      }).select("id").single();
      if (insp.error) throw new Error(insp.error.message);
      inspectionId = (insp.data as { id: number }).id;

      if (damages.length) {
        const d = await db.from("damage_records").insert(damages.map((x) => ({ ...x, booking_id: booking.id, inspection_id: inspectionId })));
        if (d.error) throw new Error(d.error.message);
      }

      const pays = [];
      if (payBalance) {
        pays.push({
          booking_id: booking.id, guest_name: booking.name,
          type: money.paid <= 0 && payBalance.amount >= balanceDue ? "Full" : "Balance",
          method: payBalance.method, amount: payBalance.amount, reference: payBalance.reference,
          notes: "Collected at check-out.", received_at: now,
        });
      }
      if (payPenalty) {
        pays.push({
          booking_id: booking.id, guest_name: booking.name, type: "Penalty",
          method: payPenalty.method, amount: payPenalty.amount, reference: payPenalty.reference,
          notes: "Damage penalty collected at check-out.", received_at: now,
        });
      }
      if (pays.length) {
        const p = await db.from("payments").insert(pays).select("id");
        if (p.error) throw new Error(p.error.message);
        paymentIds = (p.data as { id: number }[]).map((x) => x.id);
      }

      const done = await db.from("bookings").update({ status: "Completed", payment_proof: true })
        .eq("id", booking.id).in("status", ["Pending", "Confirmed"]).select("id").maybeSingle();
      if (done.error) throw new Error(done.error.message);
      if (!done.data) throw new Error("booking changed while checking out");
      completed = true;
    } catch (writeErr) {
      // Roll back this check-out's own rows. The booking update is the last
      // write, so if we are here it did not happen.
      if (!completed) {
        if (paymentIds.length) await db.from("payments").delete().in("id", paymentIds);
        if (inspectionId !== null) {
          await db.from("damage_records").delete().eq("inspection_id", inspectionId);
          await db.from("facility_inspections").delete().eq("id", inspectionId);
        }
      }
      throw writeErr;
    }

    // Facility flags come after the booking is safely completed: a failure
    // here only leaves a status to fix by hand, never a half check-out.
    const outOfService = new Set(
      (Array.isArray(b.maintenanceFacilityIds) ? b.maintenanceFacilityIds : [])
        .map(Number).filter((id) => usedIds.has(id)),
    );
    for (const f of used) {
      await db.from("facilities").update({
        status: outOfService.has(f.id) ? "Under Maintenance" : "Needs Cleaning",
        last_used_booking_id: booking.id,
        last_used_guest_name: booking.name,
        last_checked_at: null,
      }).eq("id", f.id);
    }

    return NextResponse.json({
      success: true,
      penalty: newPenalty,
      collected: round2(paidNow),
      leftOwing,
    });
  } catch (err) {
    console.error("[/api/checkout POST]", err);
    return NextResponse.json({ success: false, error: "Could not complete the check-out. Nothing was marked complete — try again." }, { status: 500 });
  }
}
