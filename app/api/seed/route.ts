// ── POST /api/seed  → copy the hardcoded starter content into Supabase
//
// The tables ship empty. This pushes the INIT_* constants — the same content
// the app has been showing from localStorage — into the database once, so
// there is real data to move the UI over to.
//
// Idempotent: a table that already has rows is left alone, so running this
// twice cannot duplicate the menu. Admin-only, because it writes.
//
// GET reports what is in each table without changing anything.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, roomToRow, menuItemToRow, facilityToRow, packageToRow } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import {
  INIT_ROOMS, INIT_MENU, INIT_FACILITIES, INIT_INVENTORY, INIT_PACKAGES, INIT_GALLERY,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type Report = Record<string, string>;

async function countOf(table: string): Promise<number | null> {
  const { count, error } = await getSupabaseAdmin()
    .from(table).select("*", { count: "exact", head: true });
  // A missing table is not a crash here: migration 2 may not be applied yet,
  // and the caller should be told which tables are absent rather than get a 500.
  if (error) return null;
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const tables = ["rooms", "bookings", "inventory", "customer_messages", "closed_dates", "gallery", "menu_items", "facilities", "packages"];
  const report: Report = {};
  for (const t of tables) {
    const c = await countOf(t);
    report[t] = c === null ? "TABLE MISSING — run migration 2" : `${c} rows`;
  }
  return NextResponse.json({ success: true, tables: report });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const db = getSupabaseAdmin();
  const report: Report = {};

  const seed = async (table: string, rows: Record<string, unknown>[]) => {
    const existing = await countOf(table);
    if (existing === null) { report[table] = "skipped — table missing (run migration 2)"; return; }
    if (existing > 0) { report[table] = `skipped — already has ${existing} rows`; return; }
    if (rows.length === 0) { report[table] = "nothing to seed"; return; }

    const { error } = await db.from(table).insert(rows);
    report[table] = error ? `FAILED — ${error.message}` : `seeded ${rows.length} rows`;
  };

  await seed("rooms", INIT_ROOMS.map(roomToRow));
  await seed("inventory", INIT_INVENTORY.map((i) => ({
    category: i.category, name: i.name, qty: i.qty,
    unit: i.unit, min_qty: i.minQty, notes: i.notes ?? "",
  })));
  await seed("gallery", INIT_GALLERY.map((url, i) => ({ url, sort_order: i })));
  await seed("menu_items", INIT_MENU.map(menuItemToRow));
  await seed("packages", INIT_PACKAGES.map(packageToRow));

  // Facilities reference rooms.id, and the seeded rooms get fresh identity
  // ids rather than the constants' ids — so the link has to be rebuilt from
  // the names after rooms land, not copied from the hardcoded roomId.
  const existingFacilities = await countOf("facilities");
  if (existingFacilities === null) {
    report.facilities = "skipped — table missing (run migration 2)";
  } else if (existingFacilities > 0) {
    report.facilities = `skipped — already has ${existingFacilities} rows`;
  } else {
    const { data: roomRows } = await db.from("rooms").select("id,name");
    const byName = new Map((roomRows ?? []).map((r: { id: number; name: string }) => [r.name, r.id]));
    const rows = INIT_FACILITIES.map((f) => {
      const row = facilityToRow(f);
      // Match the facility back to its room by name; drop the link if the
      // room is not there rather than pointing at an id that means something
      // else now.
      return { ...row, room_id: f.category === "Room" ? byName.get(f.name) ?? null : null };
    });
    const { error } = await db.from("facilities").insert(rows);
    report.facilities = error ? `FAILED — ${error.message}` : `seeded ${rows.length} rows`;
  }

  return NextResponse.json({ success: true, report });
}
