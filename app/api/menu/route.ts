// ── GET    /api/menu      → menu items   (public — the Menu page lists all)
// ── POST   /api/menu      → add item     (admin only)
// ── PATCH  /api/menu?id=  → update item  (admin only)
// ── DELETE /api/menu?id=  → remove item  (admin only)
//
// Needs migration 20260923090000. Every item is returned, available or not:
// the public page shows an "Unavailable" badge rather than hiding the dish.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, rowToMenuItem } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { sanitizeLabel, sanitizeNotes } from "@/lib/validators";
import type { MenuItemRow } from "@/types/database";
import type { MenuCategory, MenuRecipeLine } from "@/types/menu";

export const dynamic = "force-dynamic";

const CATEGORIES: MenuCategory[] = ["Combo", "Grilled & BBQ", "Rice Meals", "Snacks", "Drinks", "Desserts"];

/** Recipe arrives as JSON from the browser; keep only well-formed lines. */
function cleanRecipe(v: unknown): MenuRecipeLine[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out = v
    .map((r) => ({ ingredientId: Number((r as MenuRecipeLine)?.ingredientId), qtyPerOrder: Number((r as MenuRecipeLine)?.qtyPerOrder) }))
    .filter((r) => Number.isFinite(r.ingredientId) && Number.isFinite(r.qtyPerOrder) && r.qtyPerOrder > 0);
  return out.length ? out : null;
}

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().from("menu_items").select("*").order("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, menuItems: (data as MenuItemRow[]).map(rowToMenuItem) });
  } catch (err) {
    console.error("[/api/menu GET]", err);
    return NextResponse.json({ success: false, error: "Could not load the menu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const b = await req.json().catch(() => ({}));
    if (!CATEGORIES.includes(b.category)) return NextResponse.json({ success: false, error: "Unknown menu category." }, { status: 400 });
    const name = sanitizeLabel(String(b.name ?? ""));
    if (!name) return NextResponse.json({ success: false, error: "An item name is required." }, { status: 400 });
    const price = Number(b.price);
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ success: false, error: "Price must be zero or more." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().from("menu_items").insert({
      category: b.category, name,
      description: sanitizeNotes(String(b.desc ?? "")),
      price, img: String(b.img ?? "").slice(0, 2_000_000),
      available: b.available !== false,
      recipe: cleanRecipe(b.recipe),
    }).select().single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, item: rowToMenuItem(data as MenuItemRow) }, { status: 201 });
  } catch (err) {
    console.error("[/api/menu POST]", err);
    return NextResponse.json({ success: false, error: "Could not add that item." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric item id is required." }, { status: 400 });
  try {
    const b = await req.json().catch(() => ({}));
    const patch: Partial<MenuItemRow> = {};
    if (b.category !== undefined) {
      if (!CATEGORIES.includes(b.category)) return NextResponse.json({ success: false, error: "Unknown menu category." }, { status: 400 });
      patch.category = b.category;
    }
    if (b.name !== undefined) patch.name = sanitizeLabel(String(b.name));
    if (b.desc !== undefined) patch.description = sanitizeNotes(String(b.desc));
    if (b.price !== undefined) {
      const p = Number(b.price);
      if (!Number.isFinite(p) || p < 0) return NextResponse.json({ success: false, error: "Price must be zero or more." }, { status: 400 });
      patch.price = p;
    }
    if (b.img !== undefined) patch.img = String(b.img).slice(0, 2_000_000);
    if (b.available !== undefined) patch.available = !!b.available;
    if (b.recipe !== undefined) patch.recipe = cleanRecipe(b.recipe);

    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().from("menu_items").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: "Item not found." }, { status: 404 });
    return NextResponse.json({ success: true, item: rowToMenuItem(data as MenuItemRow) });
  } catch (err) {
    console.error("[/api/menu PATCH]", err);
    return NextResponse.json({ success: false, error: "Could not update that item." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: "A numeric item id is required." }, { status: 400 });
  try {
    const { error } = await getSupabaseAdmin().from("menu_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/menu DELETE]", err);
    return NextResponse.json({ success: false, error: "Could not remove that item." }, { status: 500 });
  }
}
