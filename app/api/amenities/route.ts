// ── GET /api/amenities → the amenities the public website lists   (public)
//
// The owner adds and edits amenities in Facility Management; this is the
// read-only slice a guest may see: name, icon and description of every
// active amenity marked "show on website", and whether it is Under
// Maintenance (the Home page says so on it). The rest of the status, notes,
// checklists and who last used it stay admin-only (see /api/facilities).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { PublicAmenity } from "@/types/facility";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("facilities")
      .select("id,name,icon,description,status")
      .eq("category", "Amenity").eq("active", true).eq("show_on_site", true)
      .order("id");
    if (error) throw new Error(error.message);
    const amenities: PublicAmenity[] = (data ?? []).map((r) => ({
      id: Number(r.id), name: String(r.name), icon: String(r.icon ?? ""), description: String(r.description ?? ""),
      underMaintenance: r.status === "Under Maintenance",
    }));
    return NextResponse.json({ success: true, amenities });
  } catch (err) {
    console.error("[/api/amenities GET]", err);
    return NextResponse.json({ success: false, error: "Could not load amenities." }, { status: 500 });
  }
}
