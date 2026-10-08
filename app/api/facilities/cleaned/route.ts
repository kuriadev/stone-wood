// ── POST /api/facilities/cleaned → mark facilities cleaned     (admin only)
//
// Body: { ids: number[] }
//
// Check-out flags what a group used "Needs Cleaning"; preparing the next
// reservation that uses a facility puts it back to "Available" on its own
// (/api/inspections). This is for everything else: a room nobody has rented
// since, the venue after a pool-only week, or a day the staff cleaned
// everything at once. The owner ticks the ones that are clean, or all of
// them, in Facility Management.
//
// Only "Needs Cleaning" moves. A facility "Under Maintenance" or "In Use"
// is left alone, even if its id is sent: cleaning doesn't repair it, and a
// group is still using it.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity.server";
import type { FacilityRow } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200)
    : [];
  if (ids.length === 0) return NextResponse.json({ success: false, error: "Choose at least one facility." }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin().from("facilities")
      .update({ status: "Available", last_checked_at: new Date().toISOString() })
      .in("id", ids).eq("status", "Needs Cleaning")
      .select("id, name");
    if (error) throw new Error(error.message);
    const cleaned = (data ?? []) as Pick<FacilityRow, "id" | "name">[];

    if (cleaned.length) {
      await logActivity({
        actor: "Admin", action: "facility.cleaned", entity: "facility", entityId: cleaned.length === 1 ? cleaned[0].id : null,
        summary: `Marked ${cleaned.length === 1 ? cleaned[0].name : `${cleaned.length} facilities`} as cleaned${cleaned.length > 1 ? `: ${cleaned.map((f) => f.name).join(", ")}` : ""}.`,
        details: { ids: cleaned.map((f) => f.id) },
      });
    }
    return NextResponse.json({ success: true, cleaned: cleaned.length });
  } catch (err) {
    console.error("[/api/facilities/cleaned POST]", err);
    return NextResponse.json({ success: false, error: "Could not mark those facilities as cleaned." }, { status: 500 });
  }
}
