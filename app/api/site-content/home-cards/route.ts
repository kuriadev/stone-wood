// ── GET    /api/site-content/home-cards → the Home price cards staff saved  (public)
// ── PUT    /api/site-content/home-cards → save them                       (catalog.manage)
// ── DELETE /api/site-content/home-cards → back to the automatic cards     (catalog.manage)
//
// `cards: null` means none are saved: Home shows the automatic cards built
// from Rates & Settings. `ready: false` means the site_content table does
// not exist yet (migration 20261028130000_site_content), so nothing can be
// saved and the editor says so.

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { actingStaff } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";
import { validateHomeCards } from "@/lib/homeCards";

export const dynamic = "force-dynamic";

const KEY = "home_rate_cards";
const NOT_READY = "Editing these cards switches on once the database update (20261028130000_site_content.sql) is applied.";
const missingTable = (msg: string | undefined) => /site_content/.test(msg ?? "");

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("site_content").select("data, updated_at, updated_by_name").eq("key", KEY).maybeSingle();
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: true, cards: null, ready: false });
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ success: true, cards: null, ready: true });
    const row = data as { data: unknown; updated_at: string };
    const v = validateHomeCards(row.data);
    // A stored list that no longer validates must not blank the section:
    // fall back to the automatic cards.
    if (!v.ok) {
      console.error("[home-cards] stored cards are invalid, using automatic:", v.error);
      return NextResponse.json({ success: true, cards: null, ready: true });
    }
    return NextResponse.json({ success: true, cards: v.cards, ready: true, updatedAt: row.updated_at });
  } catch (err) {
    console.error("[/api/site-content/home-cards GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the cards." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const v = validateHomeCards(body?.cards);
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  try {
    const who = actingStaff();
    const { error } = await getSupabaseAdmin().from("site_content").upsert(
      { key: KEY, data: v.cards, updated_at: new Date().toISOString(), updated_by_name: who?.name ?? null },
      { onConflict: "key" },
    );
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
      throw new Error(error.message);
    }
    revalidatePath("/");
    await logActivity({
      actor: "Admin", action: "site.home_cards", entity: "site_content", entityId: KEY,
      summary: `Updated the "Tours & Room Add-ons" cards on the home page (${v.cards.length} card${v.cards.length === 1 ? "" : "s"}: ${v.cards.map((c) => c.title).join(", ")}).`,
    });
    return NextResponse.json({ success: true, cards: v.cards });
  } catch (err) {
    console.error("[/api/site-content/home-cards PUT]", err);
    return NextResponse.json({ success: false, error: "Could not save the cards." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requirePermission(req, "catalog.manage");
  if (denied) return denied;
  try {
    const { error } = await getSupabaseAdmin().from("site_content").delete().eq("key", KEY);
    if (error) {
      if (missingTable(error.message)) return NextResponse.json({ success: false, error: NOT_READY }, { status: 409 });
      throw new Error(error.message);
    }
    revalidatePath("/");
    await logActivity({
      actor: "Admin", action: "site.home_cards", entity: "site_content", entityId: KEY,
      summary: `Reset the "Tours & Room Add-ons" cards on the home page to the automatic ones from Rates & Settings.`,
    });
    return NextResponse.json({ success: true, cards: null });
  } catch (err) {
    console.error("[/api/site-content/home-cards DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not reset the cards." }, { status: 500 });
  }
}
