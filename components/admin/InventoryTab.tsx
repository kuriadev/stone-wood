"use client";

import { adminTabLabel } from "@/lib/labels";
import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useStaff } from "@/contexts/StaffContext";
import { useApp } from "@/contexts/AppContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { goldBtn } from "@/lib/styles";
import type { InventoryItem, InventoryCategory } from "@/types/inventory";
import { Icon, type IconName } from "@/components/common/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import "./InventoryShop.css";
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
import { Separator } from "@/components/ui/separator";
import { FullSelect, FilterSelect } from "@/components/admin/ui";
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

export function InventoryTab({ inventory: all, setInventory: setItems }: InventoryTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  // + / − is for everyone (each change is logged with their name); adding
  // and editing items is the owner's; anyone else's delete asks the owner.
  const staff = useStaff();
  const isOwner = staff.can("inventory.manage");
  const w = useWidth();
  // The same width the dropdowns switch to full width at (admin ui.tsx).
  const mob = w <= 640;
  const { reloadInventory } = useApp();

  // An archived item is still in the server's list, marked with deletedAt,
  // so the archive is the same after a reload as before it.
  const items = all.filter((i) => !i.deletedAt);
  const deleted = all.filter((i) => i.deletedAt);
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
  /** An archived item to delete for good (after the confirmation). */
  const [purging, setPurging] = useState<InventoryItem | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const purge = async () => {
    if (!purging) return;
    const item = purging;
    setPurgeBusy(true);
    try {
      const res = await fetch(`/api/inventory?id=${item.id}&permanent=1`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (json?.requested) { toast(`Deleting "${item.name}" was sent to the super admin for approval.`, "info"); setPurging(null); return; }
      if (!res.ok || json?.success === false) { toast(json?.error ?? "Could not delete that item.", "error"); return; }
      await reloadInventory();
      toast(`"${item.name}" was deleted for good.`, "success");
      setPurging(null);
    } catch {
      toast("No connection to the server.", "error");
    } finally {
      setPurgeBusy(false);
    }
  };

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const catOpts: InventoryCategory[] = ["Pool & Chemicals", "Furniture & Misc", "Cleaning Tools"];
  const cats = ["All", ...catOpts];
  const catC: Record<string, string> = {
    "Pool & Chemicals": "#3e8ed0",
    "Furniture & Misc": "#c9a84c",
    "Cleaning Tools": "#9c6fde",
  };

  // Theme-driven values kept as inline only where CSS variables can't reach
  const cBg  = isDark ? "var(--sw-bg)" : "#ffffff";
  const cBr  = isDark ? "var(--sw-border)" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 4 };

  const filtered = items.filter(
    (i) =>
      (filterCat === "All" || i.category === filterCat) &&
      (!search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase()))
  );
  const lowStock = items.filter((i) => i.qty <= i.minQty).length;
  /* The shop layout's own controls: a status filter and a sort order. */
  const [statusPick, setStatusPick] = useState<("low" | "ok")[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "low" | "high" | "cat">("name");
  const countIn = (c: string) => items.filter((i) => c === "All" || i.category === c).length;
  const shown = filtered
    .filter((i) => statusPick.length === 0 || statusPick.includes(i.qty <= i.minQty ? "low" : "ok"))
    .slice()
    .sort((a, b) =>
      sortBy === "low" ? (a.qty - a.minQty) - (b.qty - b.minQty) || a.name.localeCompare(b.name)
        : sortBy === "high" ? b.qty - a.qty || a.name.localeCompare(b.name)
          : sortBy === "cat" ? a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name));
  const CAT_ICON: Record<string, IconName> = { "Pool & Chemicals": "pool", "Furniture & Misc": "package", "Cleaning Tools": "toolbox" };

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
  /** Archive or restore on the server, then re-read the list. */
  const archiveCall = async (item: InventoryItem, restore: boolean) => {
    try {
      const res = await fetch(`/api/inventory?id=${item.id}`, restore
        ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }) }
        : { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      // Not the owner: removing a stock item is sent to the owner to
      // approve, and stays on the list until they do.
      if (json?.requested) return toast(`Removing "${item.name}" was sent to the super admin for approval.`, "info");
      if (!res.ok || json?.success === false) return toast(json?.error ?? "Could not save that. Try again.", "error");
      await reloadInventory();
      toast(restore ? `"${item.name}" restored.` : `"${item.name}" moved to archive.`, restore ? "success" : "warning");
    } catch {
      toast("No connection to the server.", "error");
    }
  };
  const executeDelete = async () => {
    if (!confirmDelete) return;
    const item = confirmDelete;
    setConfirmDelete(null);
    await archiveCall(item, false);
  };
  const restoreItem = (item: InventoryItem) => void archiveCall(item, true);
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
          style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontWeight: "400", margin: "0 0 8px", color: C.textH, fontSize: mob ? 22 : 26 }}
        >
          {adminTabLabel("Inventory")}
        </h2>
        <p style={{ fontSize: 13.5, margin: "0", color: C.textS }}>
          Resort supplies, equipment, and consumables.
        </p>
      </div>

      {/* ── Stats ── */}
      <div
        style={{ display: "grid", marginBottom: 28, gridTemplateColumns: mob ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))", gap: mob ? 12 : 16 }}
      >
        {[
          ["Total Items",  items.length,      "#c9a84c"],
          ["Low Stock",    lowStock,           "#e5484d"],
          ["Categories",   cats.length - 1,   "#3e8ed0"],
          ["Archived",     deleted.length,    "#888"],
        ].map(([l, v, c]) => (
          <div
            key={l as string}
            style={{ borderRadius: 10, position: "relative", overflow: "hidden", padding: mob ? "16px 12px" : "20px 16px", background: cBg, border: `1px solid ${cBr}`, boxShadow: C.shadowCard }}
          >
            <div
              style={{ position: "absolute", top: "0", left: "0", right: "0", height: 3, background: `linear-gradient(to right,${c as string}22,${c as string})` }}
            />
            <div style={{ fontSize: 10.5, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase", color: C.textXS }}>
              {(l as string).toUpperCase()}
            </div>
            <div
              style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontWeight: "700", lineHeight: "1", fontSize: mob ? 24 : 30, color: c as string }}
            >
              {v as number}
            </div>
          </div>
        ))}
      </div>

      {/* ── The shop-style layout ──
          Categories and filters down the left, a sort bar on top, and each
          item as a card (InventoryShop.css) -- the way people already browse
          a shop app. Every field of the old table is on the card: category,
          name, quantity with − / +, unit, minimum, status, notes, actions. */}
      <div className="sw-shop" style={{ gridTemplateColumns: mob ? "minmax(0, 1fr)" : "220px minmax(0, 1fr)" }}>

        {/* ── Left: categories and filters ── */}
        <aside className="sw-shop__side" aria-label="Categories and filters">
          {mob ? (
            <div style={{ display: "grid", gridTemplateColumns: showArchive ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
              {!showArchive && (
                <FilterSelect<string>
                  label="Category"
                  hideLabel
                  value={filterCat}
                  onChange={setFilterCat}
                  options={cats.map((c) => ({ value: c, label: c === "All" ? "All categories" : c, count: countIn(c) }))}
                />
              )}
              <FilterSelect<"active" | "archived">
                label="Showing"
                hideLabel
                value={showArchive ? "archived" : "active"}
                onChange={(v) => setShowArchive(v === "archived")}
                options={[
                  { value: "active", label: "Active", count: items.length },
                  { value: "archived", label: "Archived", count: deleted.length },
                ]}
              />
            </div>
          ) : (
            <>
              <div className="sw-shop__head"><Icon name="menu" size={15} /> All Categories</div>
              <ul className="sw-shop__cats">
                {cats.map((c) => {
                  const on = !showArchive && filterCat === c;
                  return (
                    <li key={c}>
                      <button type="button" className={on ? "is-on" : undefined} aria-pressed={on}
                        onClick={() => { setShowArchive(false); setFilterCat(c); }}>
                        <span className="sw-shop__caret" aria-hidden="true">▸</span>
                        {c !== "All" && <span className="sw-shop__dot" style={{ background: catC[c] }} />}
                        <span style={{ flex: 1 }}>{c === "All" ? "All items" : c}</span>
                        <span className="sw-shop__count">{countIn(c)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="sw-shop__head" style={{ marginTop: 22 }}><Icon name="filter" size={14} /> Stock filter</div>
              <div className="sw-shop__group">
                <div className="sw-shop__label">Status</div>
                {([["low", "Low stock", lowStock], ["ok", "OK", items.length - lowStock]] as const).map(([k, label, n]) => (
                  <label key={k} className="sw-shop__check">
                    <Checkbox checked={statusPick.includes(k)} onCheckedChange={(v) => setStatusPick((p) => v === true ? [...p, k] : p.filter((x) => x !== k))} />
                    <span style={{ flex: 1 }}>{label}</span><span className="sw-shop__count">{n}</span>
                  </label>
                ))}
              </div>
              <div className="sw-shop__group">
                <div className="sw-shop__label">Showing</div>
                {([[false, "Active items", items.length], [true, "Archived items", deleted.length]] as const).map(([arch, label, n]) => (
                  <label key={label} className="sw-shop__check">
                    <input type="radio" name="inv-showing" checked={showArchive === arch} onChange={() => setShowArchive(arch)} />
                    <span style={{ flex: 1 }}>{label}</span><span className="sw-shop__count">{n}</span>
                  </label>
                ))}
              </div>
              {(statusPick.length > 0 || filterCat !== "All" || search) && !showArchive && (
                <button type="button" className="sw-shop__clear" onClick={() => { setStatusPick([]); setFilterCat("All"); setSearch(""); }}>Clear all</button>
              )}
            </>
          )}
        </aside>

        {/* ── Right: search, sort, the cards ── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: mob ? 8 : 12, marginBottom: 12, alignItems: "stretch" }}>
            <div style={{ flex: "1", minWidth: 0, position: "relative", display: showArchive ? "none" : "block" }}>
              <Icon name="search" size={14}
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.textH, opacity: 0.35, pointerEvents: "none" }} />
              <Label htmlFor="inventory-search" className="sr-only">Search inventory items</Label>
              <Input
                id="inventory-search"
                // paddingLeft after the inpS spread, or its `padding` resets the inset.
                style={{ ...inpS, paddingLeft: 36, height: 44 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items..."
              />
            </div>
            {/* What the resort stocks is the owner's to set up. */}
            {isOwner && (
              <button className="sw-btn" style={{ flexShrink: "0", ...goldBtn, height: 44, boxSizing: "border-box", padding: mob ? "0 16px" : "0 22px", marginLeft: showArchive ? "auto" : undefined, whiteSpace: "nowrap" }} onClick={openAdd} aria-label="Add new inventory item">
                {mob ? "+ ADD" : "+ ADD ITEM"}
              </button>
            )}
          </div>

          {!showArchive && (
            <div className="sw-shop__sortbar">
              <span className="sw-shop__sortlabel">Sort by</span>
              {([["name", "Name"], ["low", "Lowest stock"], ["high", "Most stock"], ["cat", "Category"]] as const).map(([k, label]) => (
                <button key={k} type="button" className={`sw-shop__sort${sortBy === k ? " is-on" : ""}`} aria-pressed={sortBy === k} onClick={() => setSortBy(k)}>
                  {label}
                </button>
              ))}
              <span className="sw-shop__total">{shown.length} item{shown.length === 1 ? "" : "s"}</span>
            </div>
          )}

          {/* ── Low-stock alert ── active view only. */}
          {!showArchive && lowStock > 0 && (
            <div style={{ background: "rgba(229, 85, 85, 0.05)", border: "1px solid rgba(229, 85, 85, 0.2)", borderRadius: 10, padding: "10px 12px 10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} role="alert">
              <Icon name="alert" size={14} style={{ color: "#e07070", flexShrink: 0 }} />
              <span style={{ color: "#e07070", fontSize: 13.5, flex: "1 1 180px", minWidth: 0 }}>
                <strong>{lowStock}</strong> item{lowStock > 1 ? "s are" : " is"} at or below minimum stock level.
              </span>
              {!statusPick.includes("low") && (
                <button type="button" className="sw-shop__clear" style={{ margin: 0, width: "auto", flexShrink: 0, padding: "0 14px", minHeight: 32 }} onClick={() => setStatusPick(["low"])}>Show them</button>
              )}
            </div>
          )}

          {/* ── The cards ── */}
          {!showArchive && (shown.length === 0 ? (
            <p style={{ padding: "40px 20px", textAlign: "center", fontSize: 14.5, color: C.textS, borderRadius: 12, border: `1px dashed ${cBr}` }}>
              No items found{search ? ` for "${search}"` : ""}.
            </p>
          ) : (
            <ul className="sw-shop__grid" aria-label="Inventory items" style={{ gridTemplateColumns: mob ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(auto-fill, minmax(190px, 1fr))" }}>
              {shown.map((item) => {
                const low = item.qty <= item.minQty;
                const cc = catC[item.category] || "#888";
                return (
                  <li key={item.id} className={`sw-shop__card${low ? " is-low" : ""}`} style={{ background: cBg, borderColor: low ? "rgba(229,72,77,0.45)" : cBr }}>
                    <div className="sw-shop__tile" style={{ background: `linear-gradient(140deg, ${cc}33, ${cc}0d 70%)` }}>
                      <Icon name={CAT_ICON[item.category] ?? "package"} size={mob ? 34 : 44} strokeWidth={1.3} style={{ color: cc }} />
                      <span className="sw-shop__chip" style={{ color: cc, borderColor: `${cc}66`, background: isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.75)" }}>{item.category}</span>
                      {/* The corner tag, like a shop's discount tag. */}
                      <span className={`sw-shop__tag${low ? " is-low" : ""}`}>{low ? "LOW STOCK" : "OK"}</span>
                    </div>
                    <div className="sw-shop__body">
                      <div className="sw-shop__name" style={{ color: C.textH }} title={item.name}>{item.name}</div>
                      <div className="sw-shop__notes" style={{ color: C.textS }}>{item.notes || "—"}</div>
                      <div className="sw-shop__qtyrow">
                        <span className="sw-shop__qty" style={{ color: low ? "#e5484d" : "var(--sw-gold-ink)" }} aria-label={`Current quantity: ${item.qty} ${item.unit}`}>
                          {item.qty}<small style={{ color: C.textS }}> {item.unit}</small>
                        </span>
                        <span style={{ color: C.textS, fontSize: 11.5 }}>Min {item.minQty}</span>
                      </div>
                      <div className="sw-shop__stepper">
                        <button type="button" onClick={() => updateQty(item.id, -1)} aria-label={`Decrease quantity of ${item.name}`} style={{ borderColor: cBr, color: C.textB }}>−</button>
                        <span style={{ color: C.textS }}>Count</span>
                        <button type="button" onClick={() => updateQty(item.id, 1)} aria-label={`Increase quantity of ${item.name}`} style={{ borderColor: cBr, color: C.textB }}>+</button>
                      </div>
                    </div>
                    {/* Slides up on hover (always shown on a phone), like a
                        shop's "Find Similar" bar. */}
                    <div className="sw-shop__actions">
                      {isOwner && <button type="button" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}><Icon name="edit" size={13} /> Edit</button>}
                      <button type="button" className="is-danger" onClick={() => setConfirmDelete(item)} aria-label={`Archive ${item.name}`}><Icon name="trash" size={13} /> Archive</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}

      {/* ── Archive view ── */}
      {showArchive && deleted.length === 0 && (
        <div style={{ borderRadius: 10, background: cBg, border: `1px solid ${cBr}`, padding: "40px 24px", textAlign: "center", boxShadow: C.shadowCard }}>
          <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>
            Nothing archived. Items you remove from the list appear here and can be restored.
          </p>
        </div>
      )}

      {showArchive && deleted.length > 0 && (
        <div
          style={{ borderRadius: 10, overflow: "hidden", background: cBg, border: `1px solid ${cBr}`, boxShadow: C.shadowCard }}
        >
          <div
            style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${cBr}`, background: isDark ? "var(--sw-bg)" : "#f5f0e8" }}
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
                <TableRow style={{ background: isDark ? "var(--sw-bg)" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                  {["Category", "Item Name", "Qty", "Unit", "Deleted On", "Action"].map((h) => (
                    <TableHead key={h} scope="col" style={{ padding: "12px 16px", fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap", fontWeight: "600", color: C.textXS }}>
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
                    <TableCell style={{ padding: "12px 16px", fontSize: 12.5, color: C.textS }}>{item.category}</TableCell>
                    <TableCell style={{ padding: "12px 16px", fontSize: 13.5, color: C.textS }}>{item.name}</TableCell>
                    <TableCell style={{ padding: "12px 16px", fontSize: 12.5, color: C.textS }}>{item.qty}</TableCell>
                    <TableCell style={{ padding: "12px 16px", fontSize: 12.5, color: C.textS }}>{item.unit}</TableCell>
                    <TableCell style={{ padding: "12px 16px", fontSize: 12.5, color: C.textXS }}>
                      {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }) : ""}
                    </TableCell>
                    <TableCell style={{ padding: "12px 16px", fontSize: 12.5 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {isOwner && (
                          <button
                            style={{ background: "rgba(76, 175, 80, 0.08)", color: "#4caf50", border: "1px solid rgba(76, 175, 80, 0.25)", padding: "4px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
                            onClick={() => restoreItem(item)}
                            aria-label={`Restore ${item.name} from archive`}
                          >
                            RESTORE
                          </button>
                        )}
                        {/* For good, after a confirmation. Others' requests go to the super admin. */}
                        <button
                          style={{ background: "rgba(229, 72, 77, 0.08)", color: "#e5484d", border: "1px solid rgba(229, 72, 77, 0.3)", padding: "4px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1, display: "inline-flex", alignItems: "center", gap: 5 }}
                          onClick={() => setPurging(item)}
                          aria-label={`Delete ${item.name} for good`}
                        >
                          <Icon name="trash" size={12} /> DELETE
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

        </div>
      </div>

      {/* ── Delete for good ── from the archive, with the consequences spelled out. */}
      <AlertDialog open={!!purging} onOpenChange={(open) => { if (!open && !purgeBusy) setPurging(null); }}>
        <AlertDialogContent>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(229, 72, 77, 0.12)", border: "1px solid rgba(229, 72, 77, 0.3)", color: "#e5484d", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true"><Icon name="trash" size={18} /></div>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, fontWeight: 400, color: C.textH }}>
              Delete &quot;{purging?.name}&quot; for good?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: 14, lineHeight: 1.7, color: C.textS }}>
              It leaves the archive and can&apos;t be restored. Its stock history (use, counts, purchases) is deleted with it; the money in Sales stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={purgeBusy} onClick={(e) => { e.preventDefault(); void purge(); }}
              style={{ background: "#e5484d", color: "#fff", border: "none" }}>
              {purgeBusy ? "Deleting…" : "Delete for good"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Archive ── an AlertDialog: archiving is a decision the
          admin has to make explicitly, so there is no close button and the
          backdrop does not dismiss it. */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(229, 85, 85, 0.1)", border: "1px solid rgba(229, 85, 85, 0.2)", color: C.dangerInk, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }} aria-hidden="true"><Icon name="trash" size={13} /></div>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, fontWeight: 400, color: C.textH }}>
              Archive this item?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: 14.5, lineHeight: 1.7, color: C.textS }}>
              <strong style={{ color: C.textH }}>&quot;{confirmDelete?.name}&quot;</strong>{" "}
              will be moved to the Deleted archive. You can restore it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <AlertDialogFooter>
            <AlertDialogCancel style={{ padding: 12, height: "auto", fontSize: 12.5, borderRadius: 6, letterSpacing: 1, color: C.textS, borderColor: cBr }}>
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              style={{ background: "rgba(229, 85, 85, 0.08)", color: C.dangerInk, border: "1px solid rgba(229, 85, 85, 0.25)", padding: 12, height: "auto", fontSize: 12.5, fontWeight: 700, borderRadius: 6, letterSpacing: 1 }}
              onClick={() => void executeDelete()}
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
            <DialogTitle style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, fontWeight: 400, color: C.textH }}>
              {editItem ? "Edit Item" : "Add New Item"}
            </DialogTitle>
            <DialogDescription>
              {editItem ? "Update the stock record for this item." : "Add a new item to the inventory."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Category */}
            <div>
              <Label htmlFor="item-category" className="mb-2 block text-[10.5px] tracking-[3px] text-muted-foreground">CATEGORY</Label>
              <FullSelect
                id="item-category"
                value={form.category}
                onChange={(e) => setF("category", e.target.value)}
                aria-label="Item category"
                title="Select item category"
              >
                {catOpts.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </FullSelect>
            </div>

            {/* Item name */}
            <div>
              <Label htmlFor="item-name" className="mb-2 block text-[10.5px] tracking-[3px] text-muted-foreground">ITEM NAME</Label>
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
                  <Label htmlFor={id} className="mb-2 block text-[10.5px] tracking-[3px] text-muted-foreground">{l}</Label>
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
              <Label htmlFor="item-notes" className="mb-2 block text-[10.5px] tracking-[3px] text-muted-foreground">NOTES</Label>
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
              style={{ padding: 12, height: "auto", fontSize: 12.5, borderRadius: 4, letterSpacing: 1, color: C.textS, borderColor: cBr }}
              onClick={() => setShowAddModal(false)}
            >
              CANCEL
            </Button>
            <Button className="sw-btn"
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
