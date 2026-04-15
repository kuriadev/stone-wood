"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { INIT_INVENTORY } from "@/lib/constants";
import type { InventoryItem, InventoryCategory } from "@/types/inventory";
import styles from "./InventoryTab.module.css";

export function InventoryTab() {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;

  const [items, setItems] = useState<InventoryItem[]>(INIT_INVENTORY);
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

  const catOpts: InventoryCategory[] = ["Pool & Chemicals", "Furniture & Misc", "Cleaning Tools"];
  const cats = ["All", ...catOpts];
  const catC: Record<string, string> = {
    "Pool & Chemicals": "#4a9fd4",
    "Furniture & Misc": "#c9a84c",
    "Cleaning Tools": "#9c6fde",
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
    <div className={styles.wrapper}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <p className={styles.headerLabel} style={{ color: C.textXS }}>STOCK MANAGEMENT</p>
        <h2
          className={`${styles.headerTitle} ${mob ? styles.statValueMob : ""}`}
          style={{ color: C.textH, fontSize: mob ? 22 : 26 }}
        >
          Inventory
        </h2>
        <p className={styles.headerSub} style={{ color: C.textS }}>
          Resort supplies, equipment, and consumables.
        </p>
      </div>

      {/* ── Stats ── */}
      <div
        className={`${styles.statsGrid} ${mob ? styles.statsGridMob : styles.statsGridDesk}`}
      >
        {[
          ["Total Items",  items.length,      "#c9a84c"],
          ["Low Stock",    lowStock,           "#e55"],
          ["Categories",   cats.length - 1,   "#4a9fd4"],
          ["Archived",     deleted.length,    "#888"],
        ].map(([l, v, c]) => (
          <div
            key={l as string}
            className={`${styles.statCard} ${mob ? styles.statCardMob : styles.statCardDesk}`}
            style={{ background: cBg, border: `1px solid ${cBr}`, boxShadow: C.shadowCard }}
          >
            <div
              className={styles.statBar}
              style={{ background: `linear-gradient(to right,${c as string}22,${c as string})` }}
            />
            <div className={styles.statLabel} style={{ color: C.textXS }}>
              {(l as string).toUpperCase()}
            </div>
            <div
              className={`${styles.statValue} ${mob ? styles.statValueMob : styles.statValueDesk}`}
              style={{ color: c as string }}
            >
              {v as number}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className={styles.filtersRow}>
        {/* Search */}
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
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
            className={`sw-input ${styles.searchInput}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            style={inpS}
          />
        </div>

        {/* Category filter buttons */}
        <div className={styles.catButtons} role="group" aria-label="Filter by category">
          {cats.map((c) => (
            <button
              key={c}
              className={styles.catBtn}
              onClick={() => setFilterCat(c)}
              aria-pressed={filterCat === c}
              style={{
                background: filterCat === c
                  ? (c === "All" ? (isDark ? "#1a1a1a" : "#e8e8e8") : `${catC[c]}18`)
                  : "transparent",
                color: filterCat === c
                  ? (c === "All" ? gold : catC[c])
                  : C.textS,
                border: `1px solid ${filterCat === c
                  ? (c === "All" ? gold : catC[c] + "55")
                  : cBr}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          className={styles.addBtn}
          onClick={openAdd}
          style={goldBtn}
          aria-label="Add new inventory item"
        >
          + ADD ITEM
        </button>

        {/* Archive toggle */}
        {deleted.length > 0 && (
          <button
            className={styles.archiveBtn}
            onClick={() => setShowArchive((s) => !s)}
            aria-expanded={showArchive}
            aria-label={`${showArchive ? "Hide" : "Show"} archived items (${deleted.length})`}
            style={{ color: C.textS, border: `1px solid ${cBr}` }}
          >
            🗑 ARCHIVE ({deleted.length})
          </button>
        )}
      </div>

      {/* ── Low-stock alert ── */}
      {lowStock > 0 && (
        <div className={styles.lowStockAlert} role="alert">
          <span aria-hidden="true">⚠️</span>
          <span className={styles.lowStockText}>
            <strong>{lowStock}</strong> item{lowStock > 1 ? "s are" : " is"} at or below minimum stock level.
          </span>
        </div>
      )}

      {/* ── Inventory table ── */}
      <div
        className={styles.tableContainer}
        style={{
          background: cBg,
          border: `1px solid ${cBr}`,
          marginBottom: showArchive && deleted.length ? 24 : 0,
          boxShadow: C.shadowCard,
        }}
      >
        {filtered.length === 0 ? (
          <p className={styles.emptyState} style={{ color: C.textS }}>
            No items found{search ? ` for "${search}"` : ""}.
          </p>
        ) : (
          <div className={styles.tableScroll}>
            <table
              className={`${styles.table} ${mob ? styles.tableMob : ""}`}
              aria-label="Inventory items"
            >
              <thead>
                <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Min", "Status", "Notes", "Actions"].map((h) => (
                    <th key={h} scope="col" className={styles.th} style={{ color: C.textXS }}>
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
                      <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                        <span
                          className={styles.catBadge}
                          style={{
                            background: `${cc}18`,
                            color: cc,
                            border: `1px solid ${cc}44`,
                          }}
                        >
                          {item.category.toUpperCase()}
                        </span>
                      </td>

                      {/* Name */}
                      <td className={styles.td} style={{ color: C.textH, fontSize: 12, fontWeight: 500 }}>
                        {item.name}
                      </td>

                      {/* Qty controls */}
                      <td className={styles.td}>
                        <div className={styles.qtyControls}>
                          <button
                            className={styles.qtyBtn}
                            onClick={() => updateQty(item.id, -1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            style={{
                              background: isDark ? "#161616" : "#eee",
                              border: `1px solid ${cBr}`,
                              color: C.textS,
                            }}
                          >
                            −
                          </button>
                          <span
                            className={styles.qtyValue}
                            aria-label={`Current quantity: ${item.qty}`}
                            style={{ color: low ? "#e55" : gold }}
                          >
                            {item.qty}
                          </span>
                          <button
                            className={styles.qtyBtn}
                            onClick={() => updateQty(item.id, 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                            style={{
                              background: isDark ? "#161616" : "#eee",
                              border: `1px solid ${cBr}`,
                              color: C.textS,
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Unit */}
                      <td className={styles.td} style={{ color: C.textS, fontSize: 11 }}>
                        {item.unit}
                      </td>

                      {/* Min qty */}
                      <td className={styles.td} style={{ color: C.textS, fontSize: 11 }}>
                        {item.minQty}
                      </td>

                      {/* Status */}
                      <td className={styles.td}>
                        {low
                          ? <span className={styles.badgeLowStock}>LOW STOCK</span>
                          : <span className={styles.badgeOk}>OK</span>
                        }
                      </td>

                      {/* Notes */}
                      <td className={styles.td} style={{ color: C.textS, fontSize: 11, maxWidth: 150 }}>
                        {item.notes || "—"}
                      </td>

                      {/* Actions */}
                      <td className={styles.td}>
                        <div className={styles.actionButtons}>
                          <button
                            className={styles.editBtn}
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.name}`}
                            style={{
                              color: C.textS,
                              border: `1px solid ${cBr}`,
                            }}
                          >
                            EDIT
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => setConfirmDelete(item)}
                            aria-label={`Archive ${item.name}`}
                            title={`Archive ${item.name}`}
                          >
                            🗑
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
          className={styles.archiveContainer}
          style={{ background: cBg, border: `1px solid ${cBr}`, boxShadow: C.shadowCard }}
        >
          <div
            className={styles.archiveHeader}
            style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? "#0a0806" : "#f5f0e8" }}
          >
            <span aria-hidden="true">🗑</span>
            <span className={styles.archiveHeaderLabel} style={{ color: C.textS }}>
              DELETED ITEMS — ARCHIVE
            </span>
            <span className={styles.archiveCount} style={{ color: C.textXS }}>
              {deleted.length} item{deleted.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className={styles.tableScroll}>
            <table
              className={styles.table}
              style={{ minWidth: 420 }}
              aria-label="Archived inventory items"
            >
              <thead>
                <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Deleted On", "Action"].map((h) => (
                    <th key={h} scope="col" className={styles.th} style={{ color: C.textXS }}>
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
                    <td className={styles.archiveTd} style={{ color: C.textS }}>{item.category}</td>
                    <td className={styles.archiveTdName} style={{ color: C.textS }}>{item.name}</td>
                    <td className={styles.archiveTd} style={{ color: C.textS }}>{item.qty}</td>
                    <td className={styles.archiveTd} style={{ color: C.textS }}>{item.unit}</td>
                    <td className={styles.archiveTd} style={{ color: C.textXS }}>
                      {(item as InventoryItem & { deletedAt?: string }).deletedAt}
                    </td>
                    <td className={styles.archiveTd}>
                      <button
                        className={styles.restoreBtn}
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
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div
            className={`${styles.modalBox} ${styles.deleteModalBox}`}
            style={{
              background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
              border: "1px solid rgba(229,85,85,0.25)",
            }}
          >
            <div className={styles.deleteIcon} aria-hidden="true">🗑</div>
            <h3
              id="delete-modal-title"
              className={styles.modalTitle}
              style={{ color: C.textH }}
            >
              Archive this item?
            </h3>
            <p className={styles.modalBody} style={{ color: C.textS }}>
              <strong style={{ color: C.textH }}>"{confirmDelete.name}"</strong>{" "}
              will be moved to the Deleted archive. You can restore it anytime.
            </p>
            <hr className={styles.modalDivider} style={{ borderColor: cBr }} />
            <div className={styles.modalActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setConfirmDelete(null)}
                style={{ color: C.textS, border: `1px solid ${cBr}` }}
              >
                CANCEL
              </button>
              <button
                className={styles.archiveConfirmBtn}
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
        <div className={styles.modalBackdropForm} role="dialog" aria-modal="true" aria-labelledby="form-modal-title">
          <div
            className={`${styles.modalBox} ${styles.formModalBox} ${mob ? styles.formModalBoxMob : styles.formModalBoxDesk}`}
            style={{
              background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
              border: `1px solid ${cBr}`,
            }}
          >
            <h3
              id="form-modal-title"
              className={styles.modalTitle}
              style={{ color: C.textH, marginBottom: 20 }}
            >
              {editItem ? "Edit Item" : "Add New Item"}
            </h3>

            {/* Category */}
            <div className={styles.formField}>
              <label
                htmlFor="item-category"
                className={styles.formLabel}
                style={{ color: C.textS }}
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
            <div className={styles.formField}>
              <label
                htmlFor="item-name"
                className={styles.formLabel}
                style={{ color: C.textS }}
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
            <div className={styles.formGrid}>
              {([
                ["QUANTITY", "qty",    "number", "item-qty",    "0"],
                ["UNIT",     "unit",   "text",   "item-unit",   "pcs"],
                ["MIN QTY",  "minQty", "number", "item-minqty", "0"],
              ] as const).map(([l, k, t, id, ph]) => (
                <div key={k}>
                  <label htmlFor={id} className={styles.formLabel} style={{ color: C.textS }}>
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
            <div className={styles.formFieldLast}>
              <label
                htmlFor="item-notes"
                className={styles.formLabel}
                style={{ color: C.textS }}
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
            <div className={styles.modalActions}>
              <button
                className={styles.formCancelBtn}
                onClick={() => setShowAddModal(false)}
                style={{ color: C.textS, border: `1px solid ${cBr}` }}
              >
                CANCEL
              </button>
              <button
                className={styles.formSaveBtn}
                onClick={saveItem}
                disabled={!form.name || !form.qty || !form.unit}
                style={{ ...goldBtn, opacity: !form.name || !form.qty || !form.unit ? 0.4 : 1 }}
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
