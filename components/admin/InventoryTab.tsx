"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import type { InventoryItem, InventoryCategory } from "@/types/inventory";
import { Icon } from "@/components/common/Icon";

interface InventoryTabProps {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

export function InventoryTab({ inventory: items, setInventory: setItems }: InventoryTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;

  const [deleted, setDeleted] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    category: "Pool & Chemicals" as InventoryCategory,
    name: "", qty: "", unit: "pcs", minQty: "", notes: "",
  });
  const [showArchive, setShowArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null);

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const catOpts: InventoryCategory[] = ["Pool & Chemicals", "Furniture & Misc", "Cleaning Tools", "Food Ingredients"];
  const cats = ["All", ...catOpts];
  const catC: Record<string, string> = {
    "Pool & Chemicals": "#4a9fd4",
    "Furniture & Misc": "#c9a84c",
    "Cleaning Tools": "#9c6fde",
    "Food Ingredients": "#4caf50",
  };

  // Theme-driven values kept as inline only where CSS variables can't reach
  const cBg  = isDark ? "#0b0a08" : "#ffffff";
  const cBr  = isDark ? "#1e1a14" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 4 };

  const filtered = items.filter(
    (i) =>
      (filterCat === "All" || i.category === filterCat) &&
      (!search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase()))
  );
  const lowStock = items.filter((i) => i.qty <= i.minQty).length;

  const openAdd = () => {
    setEditItem(null);
    setForm({ category: "Pool & Chemicals", name: "", qty: "", unit: "pcs", minQty: "", notes: "" });
    setShowAddModal(true);
  };
  const openEdit = (i: InventoryItem) => {
    setEditItem(i);
    setForm({ category: i.category, name: i.name, qty: String(i.qty), unit: i.unit, minQty: String(i.minQty), notes: i.notes });
    setShowAddModal(true);
  };
  const saveItem = () => {
    const data = { ...form, qty: Number(form.qty), minQty: Number(form.minQty) };
    if (editItem) {
      setItems((p) => p.map((i) => i.id === editItem.id ? { ...i, ...data } : i));
      toast("Item updated.", "success");
    } else {
      setItems((p) => [...p, { id: Date.now(), ...data } as InventoryItem]);
      toast("Item added to inventory.", "success");
    }
    setShowAddModal(false);
  };
  const executeDelete = () => {
    if (!confirmDelete) return;
    setItems((p) => p.filter((i) => i.id !== confirmDelete.id));
    setDeleted((p) => [...p, { ...confirmDelete, deletedAt: new Date().toLocaleDateString("en-PH") }]);
    toast(`"${confirmDelete.name}" moved to archive.`, "warning");
    setConfirmDelete(null);
  };
  const restoreItem = (item: InventoryItem) => {
    setDeleted((p) => p.filter((i) => i.id !== item.id));
    const { deletedAt, ...rest } = item as InventoryItem & { deletedAt?: string };
    setItems((p) => [...p, rest]);
    toast(`"${item.name}" restored.`, "success");
  };
  const updateQty = (id: number, delta: number) =>
    setItems((p) => p.map((i) => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i));
  const rowBg = (idx: number) =>
    isDark
      ? idx % 2 === 0 ? "#090909" : "#080808"
      : idx % 2 === 0 ? "#ffffff" : "#faf7f2";

  return (
    <div >

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11.5, letterSpacing: 3, marginBottom: 8, color: C.textXS }}>STOCK MANAGEMENT</p>
        <h2
          style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: "400", margin: "0 0 6px", color: C.textH, fontSize: mob ? 22 : 26 }}
        >
          Inventory
        </h2>
        <p style={{ fontSize: 13.5, margin: "0", color: C.textS }}>
          Resort supplies, equipment, and consumables.
        </p>
      </div>

      {/* ── Stats ── */}
      <div
        style={{ display: "grid", marginBottom: 28, gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)", gap: mob ? 10 : 14 }}
      >
        {[
          ["Total Items",  items.length,      "#c9a84c"],
          ["Low Stock",    lowStock,           "#e55"],
          ["Categories",   cats.length - 1,   "#4a9fd4"],
          ["Archived",     deleted.length,    "#888"],
        ].map(([l, v, c]) => (
          <div
            key={l as string}
            style={{ borderRadius: 10, position: "relative", overflow: "hidden", padding: mob ? "14px 12px" : "20px 16px", background: cBg, border: `1px solid ${cBr}`, boxShadow: C.shadowCard }}
          >
            <div
              style={{ position: "absolute", top: "0", left: "0", right: "0", height: 3, background: `linear-gradient(to right,${c as string}22,${c as string})` }}
            />
            <div style={{ fontSize: 10.5, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase", color: C.textXS }}>
              {(l as string).toUpperCase()}
            </div>
            <div
              style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: "700", lineHeight: "1", fontSize: mob ? 24 : 30, color: c as string }}
            >
              {v as number}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search */}
        <div style={{ flex: "1", minWidth: 180, position: "relative" }}>
          <svg
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: "0.35", pointerEvents: "none" }}
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke={C.textH} strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {/* Accessible label for search input */}
          <label htmlFor="inventory-search" className="sr-only">Search inventory items</label>
          <input
            id="inventory-search"
            className="sw-input"
            // paddingLeft must come AFTER the inpS spread: inpS carries the
            // `padding` shorthand from C.inp, which would otherwise reset the
            // left inset and let the magnifying glass sit on top of the text.
            style={{ ...inpS, paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
          />
        </div>

        {/* Category filter buttons */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Filter by category">
          {cats.map((c) => (
            <button
              key={c}
              style={{ padding: "7px 12px", fontSize: 11.5, fontWeight: "700", borderRadius: 20, cursor: "pointer", letterSpacing: 1, background: filterCat === c
                  ? (c === "All" ? (isDark ? "#1a1a1a" : "#e8e8e8") : `${catC[c]}18`)
                  : "transparent", color: filterCat === c
                  ? (c === "All" ? gold : catC[c])
                  : C.textS, border: `1px solid ${filterCat === c
                  ? (c === "All" ? gold : catC[c] + "55")
                  : cBr}` }}
              onClick={() => setFilterCat(c)}
              aria-pressed={filterCat === c}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          style={{ flexShrink: "0", ...goldBtn }}
          onClick={openAdd}
          aria-label="Add new inventory item"
        >
          + ADD ITEM
        </button>

        {/* Archive toggle */}
        {deleted.length > 0 && (
          <button
            style={{ padding: "9px 14px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, background: "transparent", letterSpacing: 1, flexShrink: "0", color: C.textS, border: `1px solid ${cBr}` }}
            onClick={() => setShowArchive((s) => !s)}
            aria-expanded={showArchive}
            aria-label={`${showArchive ? "Hide" : "Show"} archived items (${deleted.length})`}
          >
            <Icon name="trash" size={12} /> ARCHIVE ({deleted.length})
          </button>
        )}
      </div>

      {/* ── Low-stock alert ── */}
      {lowStock > 0 && (
        <div style={{ background: "rgba(229, 85, 85, 0.05)", border: "1px solid rgba(229, 85, 85, 0.2)", borderRadius: 4, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }} role="alert">
          <Icon name="alert" size={14} />
          <span style={{ color: "#e07070", fontSize: 13.5 }}>
            <strong>{lowStock}</strong> item{lowStock > 1 ? "s are" : " is"} at or below minimum stock level.
          </span>
        </div>
      )}

      {/* ── Inventory table ── */}
      <div
        style={{ borderRadius: 10, overflow: "hidden", background: cBg, border: `1px solid ${cBr}`, marginBottom: showArchive && deleted.length ? 24 : 0, boxShadow: C.shadowCard }}
      >
        {filtered.length === 0 ? (
          <p style={{ padding: "40px 20px", textAlign: "center", fontSize: 14.5, color: C.textS }}>
            No items found{search ? ` for "${search}"` : ""}.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 520 : undefined }}
              aria-label="Inventory items"
            >
              <thead>
                <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Min", "Status", "Notes", "Actions"].map((h) => (
                    <th key={h} scope="col" style={{ padding: "11px 14px", fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap", fontWeight: "600", color: C.textXS }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const low = item.qty <= item.minQty;
                  const cc  = catC[item.category] || "#888";
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: `1px solid ${cBr}`, background: rowBg(idx) }}
                    >
                      {/* Category */}
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <span
                          style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1, fontWeight: "700", whiteSpace: "nowrap", background: `${cc}18`, color: cc, border: `1px solid ${cc}44` }}
                        >
                          {item.category.toUpperCase()}
                        </span>
                      </td>

                      {/* Name */}
                      <td style={{ padding: "11px 14px", color: C.textH, fontSize: 13.5, fontWeight: 500 }}>
                        {item.name}
                      </td>

                      {/* Qty controls */}
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            style={{ width: 22, height: 22, borderRadius: 3, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0", background: isDark ? "#161616" : "#eee", border: `1px solid ${cBr}`, color: C.textS }}
                            onClick={() => updateQty(item.id, -1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            −
                          </button>
                          <span
                            style={{ fontWeight: "700", fontSize: 14.5, minWidth: 24, textAlign: "center", color: low ? "#e55" : gold }}
                            aria-label={`Current quantity: ${item.qty}`}
                          >
                            {item.qty}
                          </span>
                          <button
                            style={{ width: 22, height: 22, borderRadius: 3, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0", background: isDark ? "#161616" : "#eee", border: `1px solid ${cBr}`, color: C.textS }}
                            onClick={() => updateQty(item.id, 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Unit */}
                      <td style={{ padding: "11px 14px", color: C.textS, fontSize: 12.5 }}>
                        {item.unit}
                      </td>

                      {/* Min qty */}
                      <td style={{ padding: "11px 14px", color: C.textS, fontSize: 12.5 }}>
                        {item.minQty}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "11px 14px" }}>
                        {low
                          ? <span style={{ background: "rgba(229, 85, 85, 0.08)", color: "#e55", fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(229, 85, 85, 0.2)", letterSpacing: 1 }}>LOW STOCK</span>
                          : <span style={{ background: "rgba(76, 175, 80, 0.08)", color: "#4caf50", fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(76, 175, 80, 0.2)", letterSpacing: 1 }}>OK</span>
                        }
                      </td>

                      {/* Notes */}
                      <td style={{ padding: "11px 14px", color: C.textS, fontSize: 12.5, maxWidth: 150 }}>
                        {item.notes || "—"}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            style={{ background: "transparent", padding: "4px 8px", fontSize: 11.5, cursor: "pointer", borderRadius: 3, letterSpacing: 1, color: C.textS, border: `1px solid ${cBr}` }}
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.name}`}
                          >
                            EDIT
                          </button>
                          <button
                            style={{ background: "transparent", color: "rgba(229, 85, 85, 0.7)", border: "1px solid rgba(229, 85, 85, 0.2)", padding: "4px 7px", fontSize: 12.5, cursor: "pointer", borderRadius: 3 }}
                            onClick={() => setConfirmDelete(item)}
                            aria-label={`Archive ${item.name}`}
                            title={`Archive ${item.name}`}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Archive section ── */}
      {showArchive && deleted.length > 0 && (
        <div
          style={{ borderRadius: 10, overflow: "hidden", background: cBg, border: `1px solid ${cBr}`, boxShadow: C.shadowCard }}
        >
          <div
            style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${cBr}`, background: isDark ? "#0a0806" : "#f5f0e8" }}
          >
            <Icon name="trash" size={16} />
            <span style={{ fontSize: 12.5, letterSpacing: 2, fontWeight: "700", color: C.textS }}>
              DELETED ITEMS — ARCHIVE
            </span>
            <span style={{ fontSize: 12.5, marginLeft: "auto", color: C.textXS }}>
              {deleted.length} item{deleted.length > 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}
              aria-label="Archived inventory items"
            >
              <thead>
                <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Deleted On", "Action"].map((h) => (
                    <th key={h} scope="col" style={{ padding: "11px 14px", fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap", fontWeight: "600", color: C.textXS }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deleted.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: `1px solid ${cBr}`, background: rowBg(idx), opacity: 0.8 }}
                  >
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: C.textS }}>{item.category}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13.5, color: C.textS }}>{item.name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: C.textS }}>{item.qty}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: C.textS }}>{item.unit}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: C.textXS }}>
                      {(item as InventoryItem & { deletedAt?: string }).deletedAt}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5 }}>
                      <button
                        style={{ background: "rgba(76, 175, 80, 0.08)", color: "#4caf50", border: "1px solid rgba(76, 175, 80, 0.25)", padding: "4px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
                        onClick={() => restoreItem(item)}
                        aria-label={`Restore ${item.name} from archive`}
                      >
                        RESTORE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirm Archive Modal ── */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: "0", background: "rgba(0, 0, 0, 0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "500", padding: 20 }} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div
            style={{ borderRadius: 12, width: "100%", boxShadow: "0 40px 100px rgba(0, 0, 0, 0.7)", maxWidth: 380, padding: "32px 28px", background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: "1px solid rgba(229,85,85,0.25)" }}
          >
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(229, 85, 85, 0.1)", border: "1px solid rgba(229, 85, 85, 0.2)", color: "#e55", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, fontSize: 20 }} aria-hidden="true"><Icon name="trash" size={13} /></div>
            <h3
              id="delete-modal-title"
              style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: "400", marginBottom: 8, color: C.textH }}
            >
              Archive this item?
            </h3>
            <p style={{ fontSize: 14.5, lineHeight: "1.7", marginBottom: 22, color: C.textS }}>
              <strong style={{ color: C.textH }}>"{confirmDelete.name}"</strong>{" "}
              will be moved to the Deleted archive. You can restore it anytime.
            </p>
            <hr style={{ marginBottom: 18, borderColor: cBr }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ flex: "1", background: "transparent", padding: 11, fontSize: 12.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1, color: C.textS, border: `1px solid ${cBr}` }}
                onClick={() => setConfirmDelete(null)}
              >
                CANCEL
              </button>
              <button
                style={{ flex: "2", background: "rgba(229, 85, 85, 0.08)", color: "#e55", border: "1px solid rgba(229, 85, 85, 0.25)", padding: 11, fontSize: 12.5, fontWeight: "700", cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}
                onClick={executeDelete}
              >
                YES, ARCHIVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: "0", background: "rgba(0, 0, 0, 0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "400", padding: 16, overflowY: "auto" }} role="dialog" aria-modal="true" aria-labelledby="form-modal-title">
          <div
            style={{ borderRadius: 12, width: "100%", boxShadow: "0 40px 100px rgba(0, 0, 0, 0.7)", maxWidth: 460, padding: mob ? "24px 20px" : 32, background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}` }}
          >
            <h3
              id="form-modal-title"
              style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: "400", color: C.textH, marginBottom: 20 }}
            >
              {editItem ? "Edit Item" : "Add New Item"}
            </h3>

            {/* Category */}
            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="item-category"
                style={{ fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 6, color: C.textS }}
              >
                CATEGORY
              </label>
              <select
                id="item-category"
                className="sw-input"
                value={form.category}
                onChange={(e) => setF("category", e.target.value)}
                style={inpS}
                aria-label="Item category"
                title="Select item category"
              >
                {catOpts.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Item name */}
            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="item-name"
                style={{ fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 6, color: C.textS }}
              >
                ITEM NAME
              </label>
              <input
                id="item-name"
                className="sw-input"
                value={form.name}
                onChange={(e) => setF("name", e.target.value)}
                placeholder="e.g. Chlorine Tablets"
                style={inpS}
                aria-required="true"
              />
            </div>

            {/* Qty / Unit / MinQty */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              {([
                ["QUANTITY", "qty",    "number", "item-qty",    "0"],
                ["UNIT",     "unit",   "text",   "item-unit",   "pcs"],
                ["MIN QTY",  "minQty", "number", "item-minqty", "0"],
              ] as const).map(([l, k, t, id, ph]) => (
                <div key={k}>
                  <label htmlFor={id} style={{ fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 6, color: C.textS }}>
                    {l}
                  </label>
                  <input
                    id={id}
                    type={t}
                    className="sw-input"
                    value={form[k as keyof typeof form]}
                    onChange={(e) => setF(k, e.target.value)}
                    placeholder={ph}
                    style={inpS}
                    // aria-required={k !== "notes"}
                  />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="item-notes"
                style={{ fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 6, color: C.textS }}
              >
                NOTES
              </label>
              <input
                id="item-notes"
                className="sw-input"
                value={form.notes}
                onChange={(e) => setF("notes", e.target.value)}
                placeholder="Optional notes"
                style={inpS}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ flex: "1", background: "transparent", padding: 11, fontSize: 12.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1, color: C.textS, border: `1px solid ${cBr}` }}
                onClick={() => setShowAddModal(false)}
              >
                CANCEL
              </button>
              <button
                style={{ flex: "2", ...goldBtn, opacity: !form.name || !form.qty || !form.unit ? 0.4 : 1 }}
                onClick={saveItem}
                disabled={!form.name || !form.qty || !form.unit}
                aria-disabled={!form.name || !form.qty || !form.unit}
              >
                SAVE ITEM
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
