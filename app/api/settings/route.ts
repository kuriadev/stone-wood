// ── GET   /api/settings → the resort's rates, limits, hours, contacts (public)
// ── PATCH /api/settings → the owner changes them                     (owner)
//
// GET is public on purpose: these are the published prices, hours and
// contact details every guest page shows anyway.
//
// PATCH validates the whole record (lib/settings.ts) — a slot shorter than
// four hours, no time to clean between groups, a 120% discount are refused
// with a sentence saying why — saves it, and applies it to this server at
// once. Bookings already made keep the total they were sold at; only new
// quotes use the new numbers.

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission, sessionOf } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { actingStaff } from "@/lib/staff.server";
import { loadSettings, forgetSettings, ensureSettings } from "@/lib/settings.server";
import { validateSettings, settingsChanges } from "@/lib/settings";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await loadSettings();
  // Who last changed them is for staff, not for the public.
  const staff = sessionOf(req) !== null;
  return NextResponse.json({ success: true, settings: s.settings, enabled: s.enabled, updatedAt: s.updatedAt, updatedBy: staff ? s.updatedBy : null });
}

export async function PATCH(req: NextRequest) {
  const denied = await requirePermission(req, "settings.manage");
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const v = validateSettings(body);
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });

  try {
    const before = (await loadSettings()).settings;
    const who = actingStaff();
    const { error } = await getSupabaseAdmin().from("business_settings").upsert({
      id: 1, data: v.settings, updated_at: new Date().toISOString(), updated_by_name: who?.name ?? null,
    }, { onConflict: "id" });
    if (error) {
      if (/business_settings/.test(error.message)) {
        return NextResponse.json({ success: false, error: "Settings switch on once the database update (20261012140000_business_settings.sql) is applied." }, { status: 409 });
      }
      throw new Error(error.message);
    }
    forgetSettings();
    await ensureSettings();
    // Every pre-built page shows prices or hours: rebuild them now rather
    // than within the minute.
    revalidatePath("/", "layout");
    const changed = settingsChanges(before, v.settings);
    if (changed.length) {
      await logActivity({
        actor: "Admin", action: "settings.updated", entity: "settings", entityId: 1,
        summary: `Changed the resort settings: ${changed.slice(0, 6).join("; ")}${changed.length > 6 ? `; and ${changed.length - 6} more` : ""}.`,
        details: { changes: changed },
      });
    }
    return NextResponse.json({ success: true, settings: v.settings });
  } catch (err) {
    console.error("[/api/settings PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not save the settings." }, { status: 500 });
  }
}
