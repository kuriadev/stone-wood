// ── POST /api/checkout → inspect the facilities as a group leaves   (admin only)
//
// Step 1 of the end of a stay. The resort's rule: facilities are inspected
// BEFORE the group leaves. One request:
//
//   1. records the after-use inspection of every facility the booking used;
//   2. records each damaged item, with its penalty computed HERE as
//        quantity × the rate on the owner's rate list (+ an adjustment,
//        which needs a reason);
//   3. stamps the booking checked_out_at;
//   4. flags the facilities "Needs Cleaning" (or "Under Maintenance" where
//      the owner says the damage takes it out of service) — except any a
//      group still on site is using.
//
// Money is step 2, /api/settle: it shows the per-booking liquidation
// (stay balance + these penalties), takes the final payment and completes
// the booking. Splitting them lets the owner inspect first and settle the
// tally with the guest after, which is how it happens at the gate.
//
// Everything is validated before anything is written. Supabase's client has
// no multi-statement transaction, so if a write fails part-way the rows
// already written for THIS check-out are removed again before answering.

import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity.server";
import { fmt } from "@/lib/utils";
import { getSupabaseAdmin, rowToFacility, rowToDamageRate } from "@/lib/supabase";
import { facilitiesInUseByOthers, stayLongOver } from "@/lib/ops.server";
import { requireAdmin } from "@/lib/auth";
import { loadBookingLedger } from "@/lib/ledger.server";
import { cleanItems } from "@/lib/inspection.server";
import { facilitiesForBooking } from "@/lib/facilityUsage";
import { cleanText } from "@/lib/money";
import { round2 } from "@/lib/finance";
import type { FacilityRow, DamageRateRow } from "@/types/database";

export const dynamic = "force-dynamic";

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
    if (booking.status !== "Confirmed") {
      return NextResponse.json({ success: false, error: booking.status === "Pending" ? "Accept this booking first." : `This booking is already ${booking.status.toLowerCase()}.` }, { status: 409 });
    }
    if (!booking.checkedInAt) return NextResponse.json({ success: false, error: "Check the group in before checking them out." }, { status: 409 });
    if (booking.checkedOutAt) return NextResponse.json({ success: false, error: "This group is already checked out. Settle the booking next." }, { status: 409 });

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

    const notes = cleanText(b.notes, 300);

    // ── Writes (undone again if any step fails) ──────────────────────
    const now = new Date().toISOString();
    let inspectionId: number | null = null;
    let stamped = false;
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

      const done = await db.from("bookings").update({ checked_out_at: now })
        .eq("id", booking.id).eq("status", "Confirmed").is("checked_out_at", null).select("id").maybeSingle();
      if (done.error) throw new Error(done.error.message);
      if (!done.data) throw new Error("booking changed while checking out");
      stamped = true;
    } catch (writeErr) {
      // Roll back this check-out's own rows. The booking update is the last
      // write, so if we are here it did not happen.
      if (!stamped && inspectionId !== null) {
        await db.from("damage_records").delete().eq("inspection_id", inspectionId);
        await db.from("facility_inspections").delete().eq("id", inspectionId);
      }
      throw writeErr;
    }

    // Facility flags come after the booking is safely stamped: a failure
    // here only leaves a status to fix by hand, never a half check-out.
    const outOfService = new Set(
      (Array.isArray(b.maintenanceFacilityIds) ? b.maintenanceFacilityIds : [])
        .map(Number).filter((id) => usedIds.has(id)),
    );
    const stillInUse = await facilitiesInUseByOthers(booking.id, (fs.data as FacilityRow[]).map(rowToFacility));
    // A stay recorded after the fact doesn't make today's facilities need
    // cleaning; only damage that takes one out of service still applies.
    const longOver = stayLongOver(booking);
    for (const f of used) {
      if (stillInUse.has(f.id) && !outOfService.has(f.id)) continue;
      if (longOver && !outOfService.has(f.id)) continue;
      await db.from("facilities").update({
        status: outOfService.has(f.id) ? "Under Maintenance" : "Needs Cleaning",
        last_used_booking_id: booking.id,
        last_used_guest_name: booking.name,
        last_checked_at: null,
      }).eq("id", f.id);
    }

    await logActivity({
      actor: "Admin", action: "stay.checked_out", bookingId: booking.id, entity: "booking", entityId: booking.id,
      summary: `Checked out ${booking.name} (${booking.id}) after inspecting ${used.length} facilit${used.length === 1 ? "y" : "ies"}.${damages.length ? ` ${damages.length} damaged item${damages.length === 1 ? "" : "s"}, ${fmt(newPenalty)} in penalties.` : " No damage."}`,
      details: { damages: damages.map((d) => ({ item: d.item_name, qty: d.quantity, amount: d.amount, facility: d.facility_name })), outOfService: [...outOfService] },
    });
    return NextResponse.json({
      success: true,
      penalty: newPenalty,
      toSettle: round2(money.balance + money.penaltyDue + newPenalty),
    });
  } catch (err) {
    console.error("[/api/checkout POST]", err);
    return NextResponse.json({ success: false, error: "Could not save the check-out. Nothing was recorded — try again." }, { status: 500 });
  }
}
