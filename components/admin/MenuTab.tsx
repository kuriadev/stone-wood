"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt, isMenuItemSellable } from "@/lib/utils";
import type { MenuItem, MenuCategory, MenuRecipeLine } from "@/types/menu";
import type { InventoryItem } from "@/types/inventory";
import { Icon } from "@/components/common/Icon";

interface MenuTabProps {
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  inventory: InventoryItem[];
  mob: boolean;
}

const CATEGORIES: MenuCategory[] = ["Combo", "Grilled & BBQ", "Rice Meals", "Snacks", "Drinks", "Desserts"];

export function MenuTab({ menuItems, setMenuItems, inventory, mob }: MenuTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();

  const [filterCat, setFilterCat] = useState<"All" | MenuCategory>("All");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({
    category: "Grilled & BBQ" as MenuCategory, name: "", desc: "", price: "", img: "", available: true,
    recipe: [] as MenuRecipeLine[],
  });

  const ingredientOpts = inventory.filter((i) => i.category === "Food Ingredients");

  const cBg = isDark ? "#0c0b09" : "#ffffff";
  const cBr = isDark ? "#1a1714" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const setF = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = filterCat === "All" ? menuItems : menuItems.filter((m) => m.category === filterCat);

  const openAdd = () => {
    setEditItem(null);
    setForm({ category: "Grilled & BBQ", name: "", desc: "", price: "", img: "", available: true, recipe: [] });
    setShowModal(true);
  };
  const openEdit = (m: MenuItem) => {
    setEditItem(m);
    setForm({ category: m.category, name: m.name, desc: m.desc, price: String(m.price), img: m.img, available: m.available, recipe: m.recipe ?? [] });
    setShowModal(true);
  };
  const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => setF("img", ev.target?.result as string);
    rd.readAsDataURL(f);
  };
  const toggleRecipeIngredient = (ingredientId: number) => {
    setForm((f) => {
      const has = f.recipe.some((r) => r.ingredientId === ingredientId);
      return {
        ...f,
        recipe: has
          ? f.recipe.filter((r) => r.ingredientId !== ingredientId)
          : [...f.recipe, { ingredientId, qtyPerOrder: 1 }],
      };
    });
  };
  const setRecipeQty = (ingredientId: number, qty: number) => {
    setForm((f) => ({
      ...f,
      recipe: f.recipe.map((r) => r.ingredientId === ingredientId ? { ...r, qtyPerOrder: Math.max(1, qty) } : r),
    }));
  };
  const saveItem = () => {
    const data = { ...form, price: Number(form.price) || 0, img: form.img || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80", recipe: form.recipe.length ? form.recipe : undefined };
    if (editItem) {
      setMenuItems((p) => p.map((m) => m.id === editItem.id ? { ...m, ...data } : m));
      toast("Menu item updated.", "success");
    } else {
      setMenuItems((p) => [...p, { id: Date.now(), ...data }]);
      toast("Menu item added.", "success");
    }
    setShowModal(false);
  };
  const executeDelete = () => {
    if (!confirmDelete) return;
    setMenuItems((p) => p.filter((m) => m.id !== confirmDelete.id));
    toast(`"${confirmDelete.name}" removed from the menu.`, "warning");
    setConfirmDelete(null);
  };
  const toggleAvailable = (m: MenuItem) => setMenuItems((p) => p.map((x) => x.id === m.id ? { ...x, available: !x.available } : x));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>FOOD & DRINKS</p>
          <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Menu</h2>
          <p style={{ color: C.textS, fontSize: 13.5, margin: "6px 0 0" }}>Shown on the public Menu page and offered as a pre-order during Book Now.</p>
        </div>
        <button onClick={openAdd} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD ITEM</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["All", ...CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} style={{ padding: "7px 14px", fontSize: 12.5, borderRadius: 20, cursor: "pointer", background: filterCat === c ? `${gold}18` : "transparent", color: filterCat === c ? gold : C.textS, border: `1px solid ${filterCat === c ? gold + "55" : cBr}` }}>{c}</button>
        ))}
      </div>

      {/* gridAutoRows 1fr makes every row as tall as the tallest card in the
          grid, so a two-line description in row 1 and a one-line one in row 3
          still produce cards of matching height. Not on mobile: there is one
          card per row there, so nothing sits side by side to align against and
          padding every card to the tallest only adds dead scroll. */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))", gridAutoRows: mob ? "auto" : "1fr", gap: 16 }}>
        {filtered.map((m) => {
          const sellable = isMenuItemSellable(m, inventory);
          const outOfStock = m.available && !sellable;
          return (
          <div key={m.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden", opacity: sellable ? 1 : 0.55, display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={m.img} alt={m.name} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: gold, fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>{m.category}</span>
              {!m.available && <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(200,60,60,0.85)", color: "#fff", fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>UNAVAILABLE</span>}
              {outOfStock && <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(245,197,24,0.9)", color: "#000", fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1, fontWeight: 700 }}>SOLD OUT — NO STOCK</span>}
            </div>
            <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <h4 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 16, fontWeight: 400, margin: 0 }}>{m.name}</h4>
                <span style={{ color: gold, fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap" }}>{fmt(m.price)}</span>
              </div>
              <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>{m.desc}</p>
              {m.recipe && m.recipe.length > 0 && (
                <p style={{ color: C.textXS, fontSize: 11.5, marginBottom: 12 }}>
                  <Icon name="link" size={12} style={{ marginRight: 5 }} />Linked to {m.recipe.length} ingredient{m.recipe.length > 1 ? "s" : ""} in Inventory
                </p>
              )}
              {/* marginTop:auto — the description and the inventory line vary
                  in height from card to card, which is what left these three
                  buttons sitting at three different heights across a row. */}
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                <button onClick={() => toggleAvailable(m)} style={{ ...outBtn, flex: 1, padding: "7px 10px", fontSize: 11.5, letterSpacing: 1 }}>{m.available ? "MARK OUT" : "MARK AVAILABLE"}</button>
                <button onClick={() => openEdit(m)} style={{ ...outBtn, flex: 1, padding: "7px 10px", fontSize: 11.5, letterSpacing: 1 }}>EDIT</button>
                <button onClick={() => setConfirmDelete(m)} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "7px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>DEL</button>
              </div>
            </div>
          </div>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ color: C.textXS, fontSize: 14.5, gridColumn: "1/-1", textAlign: "center", padding: "32px 0" }}>No items in this category yet.</p>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20, overflowY: "auto" }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: "28px 26px", width: "100%", maxWidth: 440, boxShadow: "0 40px 100px rgba(0,0,0,0.7)", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 18 }}>{editItem ? "Edit Menu Item" : "Add Menu Item"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>CATEGORY</label>
                <select value={form.category} onChange={(e) => setF("category", e.target.value as MenuCategory)} className="sw-input" style={inpS}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>NAME</label>
                <input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Pork BBQ Skewers" className="sw-input" style={inpS} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>DESCRIPTION</label>
                <textarea value={form.desc} onChange={(e) => setF("desc", e.target.value)} rows={2} className="sw-input" style={{ ...inpS, resize: "none" }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>PRICE (₱)</label>
                <input type="number" min={0} value={form.price} onChange={(e) => setF("price", e.target.value)} className="sw-input" style={inpS} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>PHOTO</label>
                <input type="file" accept="image/*" onChange={handleImg} className="sw-input" style={inpS} />
                {form.img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={form.img} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />
                )}
              </div>
              <div onClick={() => setF("available", !form.available)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${form.available ? "#4caf50" : cBr}`, background: form.available ? "#4caf50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.available && <Icon name="check" size={11} style={{ color: "#fff" }} strokeWidth={2.5} />}
                </div>
                <span style={{ color: C.textS, fontSize: 13.5 }}>Available for order</span>
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                  LINK TO INVENTORY (OPTIONAL)
                </label>
                <p style={{ color: C.textS, fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }}>
                  When linked, this item auto-sells-out once any of these ingredients hits zero in Inventory.
                </p>
                {ingredientOpts.length === 0 ? (
                  <p style={{ color: C.textXS, fontSize: 12.5 }}>No "Food Ingredients" items in Inventory yet — add some there first.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                    {ingredientOpts.map((ing) => {
                      const line = form.recipe.find((r) => r.ingredientId === ing.id);
                      return (
                        <div key={ing.id} style={{ display: "flex", alignItems: "center", gap: 8, background: line ? `${gold}14` : "transparent", border: `1px solid ${line ? gold + "55" : cBr}`, borderRadius: 6, padding: "6px 10px" }}>
                          <div onClick={() => toggleRecipeIngredient(ing.id)} style={{ flex: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${line ? gold : cBr}`, background: line ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {line && <Icon name="check" size={10} style={{ color: "#000" }} strokeWidth={2.5} />}
                            </div>
                            <span style={{ color: C.textH, fontSize: 13.5 }}>{ing.name}</span>
                            <span style={{ color: C.textXS, fontSize: 11.5 }}>({ing.qty} {ing.unit} in stock)</span>
                          </div>
                          {line && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                              <span style={{ color: C.textS, fontSize: 11.5 }}>uses</span>
                              <input
                                type="number" min={1} value={line.qtyPerOrder}
                                onChange={(e) => setRecipeQty(ing.id, Number(e.target.value) || 1)}
                                style={{ width: 44, ...inpS, padding: "3px 6px", fontSize: 12.5 }}
                              />
                              <span style={{ color: C.textS, fontSize: 11.5 }}>/order</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button disabled={!form.name.trim() || !form.price} onClick={saveItem} style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: !form.name.trim() || !form.price ? 0.4 : 1 }}>SAVE</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "#0d0d0d" : "#fff", border: "1px solid rgba(229,85,85,0.3)", borderRadius: 8, padding: "28px 26px", width: "100%", maxWidth: 380 }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, marginBottom: 10 }}>Remove "{confirmDelete.name}"?</h3>
            <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 20 }}>This item will no longer appear on the menu or be orderable.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6 }}>CANCEL</button>
              <button onClick={executeDelete} style={{ flex: 1, background: "rgba(229,85,85,0.1)", color: "#e55", border: "1px solid rgba(229,85,85,0.3)", padding: "10px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6, fontWeight: 700 }}>REMOVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
