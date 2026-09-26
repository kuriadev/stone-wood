"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import type { InventoryItem, InventoryCategory } from "@/types/inventory";
import { Icon } from "@/components/common/Icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
          <Label htmlFor="inventory-search" className="sr-only">Search inventory items</Label>
          <Input
            id="inventory-search"
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
          {/* Tinted to the panel's accent: Lucide uses currentColor and this
              banner sets none, so the icon would take the page's near-black
              text colour and vanish in dark mode. */}
          <Icon name="alert" size={14} style={{ color: "#e07070", flexShrink: 0 }} />
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
            <Table
              style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 520 : undefined }}
              aria-label="Inventory items"
            >
              <TableHeader>
                <TableRow style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Min", "Status", "Notes", "Actions"].map((h) => (
                    <TableHead key={h} scope="col" style={{ padding: "11px 14px", fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap", fontWeight: "600", color: C.textXS }}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, idx) => {
                  const low = item.qty <= item.minQty;
                  const cc  = catC[item.category] || "#888";
                  return (
                    <TableRow
                      key={item.id}
                      style={{ borderBottom: `1px solid ${cBr}`, background: rowBg(idx) }}
                    >
                      {/* Category */}
                      <TableCell style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <span
                          style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1, fontWeight: "700", whiteSpace: "nowrap", background: `${cc}18`, color: cc, border: `1px solid ${cc}44` }}
                        >
                          {item.category.toUpperCase()}
                        </span>
                      </TableCell>

                      {/* Name */}
                      <TableCell style={{ padding: "11px 14px", color: C.textH, fontSize: 13.5, fontWeight: 500 }}>
                        {item.name}
                      </TableCell>

                      {/* Qty controls */}
                      <TableCell style={{ padding: "11px 14px" }}>
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
                      </TableCell>

                      {/* Unit */}
                      <TableCell style={{ padding: "11px 14px", color: C.textS, fontSize: 12.5 }}>
                        {item.unit}
                      </TableCell>

                      {/* Min qty */}
                      <TableCell style={{ padding: "11px 14px", color: C.textS, fontSize: 12.5 }}>
                        {item.minQty}
                      </TableCell>

                      {/* Status */}
                      <TableCell style={{ padding: "11px 14px" }}>
                        {low
                          ? <Badge variant="outline" style={{ background: "rgba(229, 85, 85, 0.08)", color: "#e55", fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(229, 85, 85, 0.2)", letterSpacing: 1 }}>LOW STOCK</Badge>
                          : <Badge variant="outline" style={{ background: "rgba(76, 175, 80, 0.08)", color: "#4caf50", fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(76, 175, 80, 0.2)", letterSpacing: 1 }}>OK</Badge>
                        }
                      </TableCell>

                      {/* Notes */}
                      <TableCell style={{ padding: "11px 14px", color: C.textS, fontSize: 12.5, maxWidth: 150 }}>
                        {item.notes || "—"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell style={{ padding: "11px 14px" }}>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
            <Table
              style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}
              aria-label="Archived inventory items"
            >
              <TableHeader>
                <TableRow style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Deleted On", "Action"].map((h) => (
                    <TableHead key={h} scope="col" style={{ padding: "11px 14px", fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap", fontWeight: "600", color: C.textXS }}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {deleted.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    style={{ borderBottom: `1px solid ${cBr}`, background: rowBg(idx), opacity: 0.8 }}
                  >
                    <TableCell style={{ padding: "10px 14px", fontSize: 12.5, color: C.textS }}>{item.category}</TableCell>
                    <TableCell style={{ padding: "10px 14px", fontSize: 13.5, color: C.textS }}>{item.name}</TableCell>
                    <TableCell style={{ padding: "10px 14px", fontSize: 12.5, color: C.textS }}>{item.qty}</TableCell>
                    <TableCell style={{ padding: "10px 14px", fontSize: 12.5, color: C.textS }}>{item.unit}</TableCell>
                    <TableCell style={{ padding: "10px 14px", fontSize: 12.5, color: C.textXS }}>
                      {(item as InventoryItem & { deletedAt?: string }).deletedAt}
                    </TableCell>
                    <TableCell style={{ padding: "10px 14px", fontSize: 12.5 }}>
                      <button
                        style={{ background: "rgba(76, 175, 80, 0.08)", color: "#4caf50", border: "1px solid rgba(76, 175, 80, 0.25)", padding: "4px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
                        onClick={() => restoreItem(item)}
                        aria-label={`Restore ${item.name} from archive`}
                      >
                        RESTORE
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Confirm Archive ── an AlertDialog: archiving is a decision the
          admin has to make explicitly, so there is no close button and the
          backdrop does not dismiss it. */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(229, 85, 85, 0.1)", border: "1px solid rgba(229, 85, 85, 0.2)", color: "#e55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }} aria-hidden="true"><Icon name="trash" size={13} /></div>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, color: C.textH }}>
              Archive this item?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: 14.5, lineHeight: 1.7, color: C.textS }}>
              <strong style={{ color: C.textH }}>&quot;{confirmDelete?.name}&quot;</strong>{" "}
              will be moved to the Deleted archive. You can restore it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <AlertDialogFooter>
            <AlertDialogCancel style={{ padding: 11, height: "auto", fontSize: 12.5, borderRadius: 6, letterSpacing: 1, color: C.textS, borderColor: cBr }}>
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              style={{ background: "rgba(229, 85, 85, 0.08)", color: "#e55", border: "1px solid rgba(229, 85, 85, 0.25)", padding: 11, height: "auto", fontSize: 12.5, fontWeight: 700, borderRadius: 6, letterSpacing: 1 }}
              onClick={executeDelete}
            >
              YES, ARCHIVE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add / Edit ── landscape: category and name share the top row and
          the three number fields sit in one band beneath them, rather than six
          controls stacked in a 460px column. */}
      <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) setShowAddModal(false); }}>
        <DialogContent className="sm:max-w-[min(42rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, color: C.textH }}>
              {editItem ? "Edit Item" : "Add New Item"}
            </DialogTitle>
            <DialogDescription>
              {editItem ? "Update the stock record for this item." : "Add a new item to the inventory."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Category */}
            <div className="[&_[data-slot=native-select-wrapper]]:w-full">
              <Label htmlFor="item-category" className="mb-1.5 block text-[10.5px] tracking-[3px] text-muted-foreground">CATEGORY</Label>
              <NativeSelect
                id="item-category"
                value={form.category}
                onChange={(e) => setF("category", e.target.value)}
                aria-label="Item category"
                title="Select item category"
              >
                {catOpts.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>

            {/* Item name */}
            <div>
              <Label htmlFor="item-name" className="mb-1.5 block text-[10.5px] tracking-[3px] text-muted-foreground">ITEM NAME</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setF("name", e.target.value)}
                placeholder="e.g. Chlorine Tablets"
                aria-required="true"
              />
            </div>

            {/* Qty / Unit / MinQty */}
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              {([
                ["QUANTITY", "qty",    "number", "item-qty",    "0"],
                ["UNIT",     "unit",   "text",   "item-unit",   "pcs"],
                ["MIN QTY",  "minQty", "number", "item-minqty", "0"],
              ] as const).map(([l, k, t, id, ph]) => (
                <div key={k}>
                  <Label htmlFor={id} className="mb-1.5 block text-[10.5px] tracking-[3px] text-muted-foreground">{l}</Label>
                  <Input
                    id={id}
                    type={t}
                    value={form[k as keyof typeof form]}
                    onChange={(e) => setF(k, e.target.value)}
                    placeholder={ph}
                  />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <Label htmlFor="item-notes" className="mb-1.5 block text-[10.5px] tracking-[3px] text-muted-foreground">NOTES</Label>
              <Input
                id="item-notes"
                value={form.notes}
                onChange={(e) => setF("notes", e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              style={{ padding: 11, height: "auto", fontSize: 12.5, borderRadius: 4, letterSpacing: 1, color: C.textS, borderColor: cBr }}
              onClick={() => setShowAddModal(false)}
            >
              CANCEL
            </Button>
            <Button
              style={{ ...goldBtn, height: "auto" }}
              onClick={saveItem}
              disabled={!form.name || !form.qty || !form.unit}
            >
              SAVE ITEM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
