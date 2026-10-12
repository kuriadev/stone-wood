// ── PUT /api/facilities/supplies → what cleaning a facility uses   (owner)
//
// Body: { facilityId, supplies: [{ itemId, qty }] }
//
// Set once per facility ("cleaning a room uses 1 toiletry set, 2 trash
// bags"). When a caretaker marks that facility cleaned, these amounts are
// pre-filled for them to confirm, and come off the stock.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseSupplies, missingStockTable } from "@/lib/stock.server";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "inventory.manage");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const facilityId = Number(b.facilityId);
  if (!Number.isInteger(facilityId) || facilityId <= 0) return NextResponse.json({ success: false, error: "Which facility?" }, { status: 400 });
  const supplies = parseSupplies(b.supplies);
  try {
    const db = getSupabaseAdmin();
    const f = await db.from("facilities").select("name").eq("id", facilityId).maybeSingle();
    if (!f.data) return NextResponse.json({ success: false, error: "That facility no longer exists." }, { status: 404 });
    const del = await db.from("facility_cleaning_supplies").delete().eq("facility_id", facilityId);
    if (del.error) {
      if (missingStockTable(del.error)) return NextResponse.json({ success: false, error: "Cleaning supplies switch on once the database update is applied." }, { status: 409 });
      throw new Error(del.error.message);
    }
    if (supplies.length) {
      const ins = await db.from("facility_cleaning_supplies").insert(supplies.map((s) => ({ facility_id: facilityId, item_id: s.itemId, qty: s.qty })));
      if (ins.error) throw new Error(ins.error.message);
    }
    await logActivity({
      actor: "Admin", action: "facility.supplies", entity: "facility", entityId: facilityId,
      summary: `Set the cleaning supplies for ${(f.data as { name: string }).name} (${supplies.length} item${supplies.length === 1 ? "" : "s"}).`,
      details: { supplies },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/facilities/supplies PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the cleaning supplies." }, { status: 500 });
  }
}
