export type InventoryCategory = "Pool & Chemicals" | "Furniture & Misc" | "Cleaning Tools";

/** Supply: used up (chlorine, trash bags). Equipment: only goes down when
 *  it breaks or goes missing (chairs, the pool vacuum). */
export type InventoryKind = "Supply" | "Equipment";

/** What an item most likely is, for records that don't say: furniture and
 *  the tools that are kept (mops, the pool vacuum, brooms) are Equipment,
 *  everything else is used up. The stock migration applies the same rule
 *  once; after that the owner's choice on each item is what counts. */
export function guessKind(i: { category: string; name: string }): InventoryKind {
  if (i.category === "Furniture & Misc") return "Equipment";
  return /\b(mop|vacuum|skimmer|broom|dustpan|bucket|brush|hose|ladder)\b/i.test(i.name) ? "Equipment" : "Supply";
}

export interface InventoryItem {
  id: number;
  category: InventoryCategory;
  name: string;
  /** Can be fractional (0.5 kg) and, briefly, negative: more was used than
   *  the books showed, and a count is due. */
  qty: number;
  unit: string;
  minQty: number;
  notes: string;
  deletedAt?: string;
  /** Absent before the stock migration; read as "Supply". */
  kind?: InventoryKind;
}
