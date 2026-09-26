// Server-side cleaning of an inspection checklist sent from the browser.

import type { InspectionItem } from "@/types/finance";
import { cleanText } from "@/lib/money";

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
