// ── GET   /api/maintenance → is the site closed, and why   (public)
// ── PATCH /api/maintenance → open or close the site        (admin only)
//
// Public read by design: every visitor's browser has to be able to learn
// that the site is closed, and the payload is the same banner they are
// about to be shown. Nothing here is sensitive.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { maintenanceInput, parseInput } from "@/lib/schemas";
import {
  MAINTENANCE_DEFAULT,
  isMaintenanceReason,
  type MaintenanceState,
} from "@/types/maintenance";

export const dynamic = "force-dynamic";

interface SiteSettingsRow {
  maintenance_active: boolean;
  maintenance_reason: string;
  maintenance_message: string;
}

const toState = (row: SiteSettingsRow | null): MaintenanceState => ({
  active: Boolean(row?.maintenance_active),
  reason: isMaintenanceReason(row?.maintenance_reason)
    ? row.maintenance_reason
    : MAINTENANCE_DEFAULT.reason,
  message: row?.maintenance_message ?? "",
});

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("site_settings")
      .select("maintenance_active, maintenance_reason, maintenance_message")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, maintenance: toState(data as SiteSettingsRow | null) });
  } catch (err) {
    console.error("[/api/maintenance GET]", err);
    // Deliberately a 200 with the site OPEN rather than a 500.
    //
    // This endpoint decides whether every visitor sees the site at all. If
    // the database is unreachable, the safe failure is to serve the resort
    // normally, not to black it out for everyone — a broken read must not
    // become an outage. The client defaults the same way.
    return NextResponse.json({ success: true, maintenance: MAINTENANCE_DEFAULT });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    // One schema covers the shape, the enum and the length cap. The database
    // column keeps its own CHECK on `maintenance_reason`, so a bad value is
    // still refused twice.
    const parsed = parseInput(maintenanceInput, await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const b = parsed.data;

    const { data, error } = await getSupabaseAdmin()
      .from("site_settings")
      .update({
        maintenance_active: b.active,
        maintenance_reason: b.reason,
        // Admin-authored, but it renders on a public page, so the schema
        // sanitises it the same way guest notes are.
        maintenance_message: b.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("maintenance_active, maintenance_reason, maintenance_message")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { success: false, error: "Settings row is missing — run the site_settings migration." },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, maintenance: toState(data as SiteSettingsRow) });
  } catch (err) {
    console.error("[/api/maintenance PATCH]", err);
    // Name the one failure an operator can actually act on. Postgres says
    // 'relation "public.site_settings" does not exist' when the migration
    // has not been run, which is otherwise indistinguishable from any other
    // database error and sends people hunting in the wrong place.
    const msg = err instanceof Error ? err.message : "";
    if (/site_settings/.test(msg) && /does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The site_settings table is missing. Run supabase/migrations/20260925120000_site_settings.sql in the Supabase SQL editor, then try again.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: "Could not update maintenance mode." }, { status: 500 });
  }
}
