// ── POST /api/bookings/import → bookings taken while offline        (admin)
//
// Body: { rows: WalkIn[], save?: boolean }
//
// When the internet is down the front desk keeps taking bookings on the
// printed offline sheet or in the import template (All Bookings → Import),
// and brings them in once it is back. Every row goes through the walk-in
// rules (lib/walkIn.server.ts): priced from the database, checked against
// the calendar, its payment recorded. Only bookings from today on are
// taken; a stay already over would skip preparation and inspection.
//
// Without `save` nothing is written. Each row is checked as if the rows
// above it were already booked, so the preview catches two offline
// bookings for the same slot. With `save`, the rows that pass are saved one
// by one, each checked again against what is in the database by then.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { checkWalkIn, saveWalkIn } from "@/lib/walkIn.server";
import { packageAvailed } from "@/lib/pricing";
import type { Booking } from "@/types/booking";

export const dynamic = "force-dynamic";

/** A day's offline bookings, with room to spare. */
const MAX_ROWS = 200;

interface RowResult {
  /** Index in the rows sent. */
  row: number;
  ok: boolean;
  error?: string;
  /** The booking's reference, once saved. */
  id?: string;
  total?: number;
  label?: string;
  status?: string;
}

export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "bookings.edit");
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { rows?: unknown; save?: unknown } | null;
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows || rows.length === 0) return NextResponse.json({ success: false, error: "There are no bookings to import." }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ success: false, error: `Import at most ${MAX_ROWS} bookings at a time.` }, { status: 400 });
  const save = body?.save === true;

  const results: RowResult[] = [];
  const held: Booking[] = [];
  try {
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] && typeof rows[i] === "object" ? (rows[i] as Record<string, unknown>) : {};
      // Always a front-desk booking, whatever the sheet says.
      const row = { ...raw, source: "Walk-In", walkInPackageCode: undefined };
      const checked = await checkWalkIn(row, { fromToday: true, alsoHeld: save ? [] : held });
      if (!checked.ok) {
        results.push({ row: i, ok: false, error: checked.error });
        continue;
      }
      if (save) {
        const saved = await saveWalkIn(checked.plan, { imported: true });
        results.push({ row: i, ok: true, id: saved.id, total: saved.total, label: packageAvailed(saved), status: saved.status });
      } else {
        held.push(checked.plan.booking);
        results.push({ row: i, ok: true, total: checked.plan.total, label: packageAvailed(checked.plan.booking), status: checked.plan.booking.status });
      }
    }
    return NextResponse.json({ success: true, saved: save ? results.filter((r) => r.ok).length : 0, results });
  } catch (err) {
    console.error("[/api/bookings/import POST]", err);
    // Rows saved before the failure stay saved; say which.
    return NextResponse.json(
      { success: false, error: "The import stopped part-way. The bookings marked saved are in; try the rest again.", saved: save ? results.filter((r) => r.ok).length : 0, results },
      { status: 500 },
    );
  }
}
