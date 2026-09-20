export type InventoryCategory = "Pool & Chemicals" | "Furniture & Misc" | "Cleaning Tools" | "Food Ingredients";

export interface InventoryItem {
  id: number;
  category: InventoryCategory;
  name: string;
  qty: number;
  unit: string;
  minQty: number;
  notes: string;
  deletedAt?: string;
}
