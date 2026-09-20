export type MenuCategory = "Combo" | "Grilled & BBQ" | "Rice Meals" | "Snacks" | "Drinks" | "Desserts";

/** One ingredient this menu item consumes per order, linking it to an
 *  Inventory item (category "Food Ingredients") so stock can auto-deplete
 *  and the item can auto-sell-out. */
export interface MenuRecipeLine {
  ingredientId: number;
  /** Units of that ingredient consumed per single order of this item. */
  qtyPerOrder: number;
}

export interface MenuItem {
  id: number;
  category: MenuCategory;
  name: string;
  desc: string;
  price: number;
  img: string;
  /** Manual on/off switch, set by staff regardless of stock. */
  available: boolean;
  /** Ingredients this item is made from. When set, the item also goes
   *  unavailable automatically once any listed ingredient runs out. */
  recipe?: MenuRecipeLine[];
}
