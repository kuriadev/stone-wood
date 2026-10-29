"use client";

/* "Which supplies, and how much" — one editor for every place that asks.
 *
 * The caretaker sees it pre-filled with the standard amounts when finishing
 * a task, and only changes what was different today. The owner uses the
 * same control to set those standard amounts once. Equipment never appears
 * here: chairs aren't used up, they break (that comes from inspections).
 */

import { Input } from "@/components/ui/input";
import { FullSelect, useAdminStyle, useConfirm } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import type { InventoryItem } from "@/types/inventory";
import type { SupplyLine } from "@/types/tasks";

export function SupplyLines({ value, onChange, inventory, emptyText = "No supplies." }: {
  value: SupplyLine[];
  onChange: (v: SupplyLine[]) => void;
  inventory: InventoryItem[];
  emptyText?: string;
}) {
  const { C, cBr, inp } = useAdminStyle();
  const [confirmRemove, confirmDialog] = useConfirm();
  const supplies = inventory.filter((i) => !i.deletedAt && (i.kind ?? "Supply") === "Supply");
  const unused = supplies.filter((i) => !value.some((v) => v.itemId === i.id));
  const item = (id: number) => inventory.find((i) => i.id === id);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {confirmDialog}
      {value.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>{emptyText}</p>}
      {value.map((line) => {
        const it = item(line.itemId);
        const low = it && it.qty - line.qty < it.minQty;
        return (
          <div key={line.itemId} style={{ display: "flex", gap: 8, alignItems: "center", border: `1px solid ${cBr}`, borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.textH, fontSize: 14 }}>{it?.name ?? `Item #${line.itemId}`}</div>
              {it && (
                <div style={{ color: low ? "#d4a800" : C.textS, fontSize: 11.5 }}>
                  {it.qty} {it.unit} in stock{low ? " — low after this" : ""}
                </div>
              )}
            </div>
            <Input type="number" inputMode="decimal" min={0} step="any" aria-label={`How much ${it?.name ?? "of this"}`}
              value={line.qty}
              onChange={(e) => onChange(value.map((v) => v.itemId === line.itemId ? { ...v, qty: Math.max(0, Number(e.target.value) || 0) } : v))}
              style={{ ...inp, width: 90, textAlign: "right" }} />
            <span style={{ color: C.textS, fontSize: 12.5, width: 44 }}>{it?.unit ?? ""}</span>
            <button type="button" aria-label={`Remove ${it?.name ?? "item"}`} onClick={() => confirmRemove({ title: `Remove ${it?.name ?? "this item"}?`, action: "Remove", onConfirm: () => onChange(value.filter((v) => v.itemId !== line.itemId)) })}
              className="sw-hit" style={{ background: "none", border: "none", color: C.textS, cursor: "pointer" }}>
              <Icon name="x" size={15} />
            </button>
          </div>
        );
      })}
      {unused.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <FullSelect aria-label="Add a supply" value="" style={{ ...inp, padding: "8px 36px 8px 12px" }}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) onChange([...value, { itemId: id, qty: 1 }]);
              }}>
              <option value="">Add a supply…</option>
              {unused.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit} left)</option>)}
            </FullSelect>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lines with a zero quantity dropped, ready to send. */
export const nonZero = (lines: SupplyLine[]) => lines.filter((l) => l.qty > 0);

export function SupplySummary({ lines, inventory }: { lines: SupplyLine[]; inventory: InventoryItem[] }) {
  const { C } = useAdminStyle();
  if (lines.length === 0) return <span style={{ color: C.textS }}>No supplies set</span>;
  return (
    <span style={{ color: C.textS }}>
      {lines.map((l) => {
        const it = inventory.find((i) => i.id === l.itemId);
        return `${l.qty} ${it?.unit ?? ""} ${it?.name ?? `#${l.itemId}`}`.replace(/\s+/g, " ").trim();
      }).join(" · ")}
    </span>
  );
}

