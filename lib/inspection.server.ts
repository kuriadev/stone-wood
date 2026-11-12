// Server-side cleaning of an inspection checklist sent from the browser.

import type { InspectionItem } from "@/types/finance";
import { cleanText } from "@/lib/money";
import { getSupabaseAdmin, rowToBooking, rowToInspection } from "@/lib/supabase";
import { stillToPrepare } from "@/lib/facilityUsage";
import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import type { BookingRow, InspectionRow } from "@/types/database";

export function cleanItems(raw: unknown, allowedIds: Set<number>): InspectionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).flatMap((r) => {
    const x = r as Record<string, unknown>;
    const facilityId = Number(x.facilityId);
    if (!allowedIds.has(facilityId)) return [];
    const checklist = Array.isArray(x.checklist)
      ? x.checklist.slice(0, 30).map((c) => {
          const cc = c as Record<string, unknown>;
          return { label: cleanText(cc.label, 120), done: !!cc.done };
        }).filter((c) => c.label)
      : [];
    return [{
      facilityId,
      facilityName: cleanText(x.facilityName, 80),
      checklist,
      condition: x.condition === "Damaged" ? "Damaged" as const : "OK" as const,
    }];
  });
}

/** What this booking still has to have prepared, read from the database:
 *  facilities another group on the same stay already had prepared count as
 *  done (lib/facilityUsage stillToPrepare). [] means it is ready. */
export async function remainingToPrepare(booking: Booking, facilities: Facility[]): Promise<Facility[]> {
  const db = getSupabaseAdmin();
  const sameDay = await db.from("bookings").select("*").eq("date", booking.date);
  if (sameDay.error) throw new Error(sameDay.error.message);
  const stay = (sameDay.data as BookingRow[]).map(rowToBooking);
  const ids = Array.from(new Set([booking.id, ...stay.map((t) => t.id)]));
  const preps = await db.from("facility_inspections").select("*").eq("stage", "Preparation").in("booking_id", ids);
  if (preps.error) throw new Error(preps.error.message);
  const inspections = (preps.data as InspectionRow[]).map(rowToInspection);
  return stillToPrepare(booking, stay, inspections, facilities);
}
