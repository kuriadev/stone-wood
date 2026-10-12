"use client";

/* Stock history, the upkeep schedule and cleaning supplies.
 *
 * The parts of self-updating stock that are not the stock list itself,
 * shown under Facilities & Inspections (the stock list is Supplies &
 * Equipment, kept as the simple + / − screen):
 *
 *   Stock history      every change to a count, who made it and why
 *   Upkeep schedule    the owner's repeating tasks ("Pool cleaning, every
 *                      7 days") and the supplies each one uses; they appear
 *                      on the caretakers' My Tasks on their days
 *   Cleaning supplies  what cleaning each facility uses after a group
 *
 * Each panel loads its own data, so it can sit in any screen.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/contexts/ToastContext";
import {
  ActionButton, ErrorNote, FullSelect, Label, Modal,
  StatusBadge, TableShell, Row, Cell, td, useAdminStyle, usePaged, Pager,
} from "@/components/admin/ui";
import { SupplyLines, SupplySummary, nonZero } from "@/components/admin/SupplyLines";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upkeepStatus } from "@/lib/tasks";
import { manilaDate, manilaTime } from "@/lib/finance";
import { fmt, fmtDate } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { StockMovement, SupplyLine, UpkeepData, UpkeepTask } from "@/types/tasks";

const REASON_LABEL: Record<StockMovement["reason"], string> = { Used: "Used", Broken: "Broken / lost", Bought: "Added", Counted: "Counted", Adjusted: "Adjusted" };
const REASON_COLOR: Record<StockMovement["reason"], string> = { Used: "#888", Broken: "#e55", Bought: "#2e9e4e", Counted: "#4a9fd4", Adjusted: "#c9a84c" };

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string; json?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.success === false) return { ok: false, error: typeof json.error === "string" ? json.error : "Something went wrong. Try again.", json };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "No connection to the server." };
  }
}

const EMPTY: UpkeepData = { tasks: [], runs: [], cleaningSupplies: {}, enabled: false };

function useUpkeep() {
  const [data, setData] = useState<UpkeepData>(EMPTY);
  const load = useCallback(async () => {
    const r = await send("/api/upkeep", "GET");
    if (r.ok && r.json) setData({ tasks: (r.json.tasks as UpkeepTask[]) ?? [], runs: (r.json.runs as UpkeepData["runs"]) ?? [], cleaningSupplies: (r.json.cleaningSupplies as UpkeepData["cleaningSupplies"]) ?? {}, enabled: !!r.json.enabled });
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { data, load };
}

/** Every change to a count, newest first. */
export function StockHistoryPanel({ mob }: { mob: boolean }) {
  const { inventory } = useApp();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    void (async () => {
      const r = await send("/api/inventory/movements?limit=300", "GET");
      if (r.ok && r.json) {
        setMovements((r.json.movements as StockMovement[]) ?? []);
        setEnabled(r.json.enabled !== false);
      }
    })();
  }, []);
  return <HistoryView movements={movements} items={inventory} enabled={enabled} mob={mob} />;
}

/** The owner's repeating upkeep tasks. */
export function UpkeepSchedulePanel({ mob }: { mob: boolean }) {
  const { inventory, facilities } = useApp();
  const { data, load } = useUpkeep();
  return <ScheduleView data={data} items={inventory} facilities={facilities} mob={mob} onChanged={load} />;
}

/** What cleaning each facility uses. */
export function CleaningSuppliesPanel({ mob }: { mob: boolean }) {
  const { inventory, facilities } = useApp();
  const { data, load } = useUpkeep();
  return <CleaningView data={data} items={inventory} facilities={facilities} mob={mob} onChanged={load} />;
}

// ── History ───────────────────────────────────────────────────────────
function HistoryView({ movements, items, enabled, mob }: { movements: StockMovement[]; items: InventoryItem[]; enabled: boolean; mob: boolean }) {
  const { C, cBr, rowBg, inp } = useAdminStyle();
  const [itemId, setItemId] = useState("");
  const rows = movements.filter((m) => !itemId || m.itemId === Number(itemId));
  const paged = usePaged(rows, 20);
  const item = (id: number) => items.find((i) => i.id === id);
  if (!enabled) return <p style={{ color: C.textS, fontSize: 13.5 }}>The stock history starts once the database update is applied.</p>;
  return (
    <div>
      <div style={{ maxWidth: 300, marginBottom: 12 }}>
        <FullSelect value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item" style={{ ...inp, padding: "8px 36px 8px 12px" }}>
          <option value="">Every item</option>
          {items.filter((i) => !i.deletedAt).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </FullSelect>
      </div>
      <TableShell label="Stock history" head={["When", "Item", "Change", "Why", "Who"]} minWidth={mob ? 640 : 820}
        empty={rows.length === 0 ? "Nothing recorded yet." : undefined}>
        {paged.rows.map((m, idx) => {
          const it = item(m.itemId);
          return (
            <Row key={m.id} style={{ background: rowBg(idx), borderBottom: `1px solid ${cBr}` }}>
              <Cell style={{ ...td, color: C.textS, whiteSpace: "nowrap" }}>{fmtDate(manilaDate(m.at))}, {manilaTime(m.at)}</Cell>
              <Cell style={{ ...td, color: C.textH }}>{it?.name ?? `#${m.itemId}`}</Cell>
              <Cell style={{ ...td, whiteSpace: "nowrap", fontWeight: 600, color: m.delta > 0 ? "#2e9e4e" : m.delta < 0 ? "#d44" : C.textS }}>
                {m.delta > 0 ? "+" : ""}{m.delta} {it?.unit ?? ""}
              </Cell>
              <Cell style={td}>
                <StatusBadge color={REASON_COLOR[m.reason]}>{REASON_LABEL[m.reason]}</StatusBadge>
                {m.note && <div style={{ color: C.textS, fontSize: 12, marginTop: 4 }}>{m.note}{m.bookingId ? ` · ${m.bookingId}` : ""}</div>}
                {m.unitCost !== null && <div style={{ color: C.textS, fontSize: 12 }}>{fmt(m.unitCost)} each</div>}
              </Cell>
              <Cell style={{ ...td, color: C.textS }}>{m.staffName ?? "—"}</Cell>
            </Row>
          );
        })}
      </TableShell>
      <Pager {...paged} noun="changes" />
    </div>
  );
}

// ── Upkeep schedule (owner) ───────────────────────────────────────────
function ScheduleView({ data, items, facilities, mob, onChanged }: {
  data: UpkeepData; items: InventoryItem[]; facilities: import("@/types/facility").Facility[]; mob: boolean; onChanged: () => Promise<void>;
}) {
  const { C, cBr, rowBg } = useAdminStyle();
  const { toast } = useToast();
  const [editing, setEditing] = useState<UpkeepTask | "new" | null>(null);
  const today = manilaDate();
  if (!data.enabled) return <p style={{ color: C.textS, fontSize: 13.5 }}>The upkeep schedule starts once the database update is applied.</p>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <p style={{ color: C.textS, fontSize: 13, margin: 0, maxWidth: 620 }}>
          Repeating work the caretakers do. Each one shows up on their My Tasks on its day; ticking it done takes its supplies off the stock.
        </p>
        <ActionButton kind="primary" icon="plus" onClick={() => setEditing("new")}>Add a task</ActionButton>
      </div>
      <TableShell label="Upkeep schedule" head={["Task", "How often", "Uses", "Next", ""]} minWidth={mob ? 640 : 860}
        empty={data.tasks.length === 0 ? "Nothing scheduled yet — e.g. Pool cleaning, every 7 days." : undefined}>
        {data.tasks.map((t, idx) => {
          const s = upkeepStatus(t, data.runs, today);
          const next = s.state === "done" ? s.nextDate : s.dueDate;
          const f = facilities.find((x) => x.id === t.facilityId);
          return (
            <Row key={t.id} style={{ background: rowBg(idx), borderBottom: `1px solid ${cBr}`, opacity: t.active ? 1 : 0.55 }}>
              <Cell style={td}><div style={{ color: C.textH, fontWeight: 600 }}>{t.title}</div>{f && <div style={{ color: C.textS, fontSize: 12 }}>{f.name}</div>}</Cell>
              <Cell style={{ ...td, color: C.textB }}>Every {t.everyDays === 1 ? "day" : `${t.everyDays} days`}</Cell>
              <Cell style={{ ...td, fontSize: 12.5 }}><SupplySummary lines={t.supplies} inventory={items} /></Cell>
              <Cell style={{ ...td, whiteSpace: "nowrap", color: s.state === "overdue" ? "#e55" : C.textB }}>
                {!t.active ? "Paused" : s.state === "overdue" ? `Late — was ${fmtDate(s.dueDate)}` : s.state === "due" ? "Today" : fmtDate(next)}
              </Cell>
              <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                <ActionButton size="sm" icon="edit" onClick={() => setEditing(t)}>Edit</ActionButton>{" "}
                <ActionButton size="sm" onClick={async () => {
                  const r = await send(`/api/upkeep?id=${t.id}`, "PATCH", { active: !t.active });
                  if (!r.ok) return toast(r.error ?? "Could not save.", "error");
                  toast(t.active ? `"${t.title}" paused.` : `"${t.title}" resumed.`, "info"); await onChanged();
                }}>{t.active ? "Pause" : "Resume"}</ActionButton>
              </Cell>
            </Row>
          );
        })}
      </TableShell>
      {editing && (
        <UpkeepModal task={editing === "new" ? null : editing} items={items} facilities={facilities} onClose={() => setEditing(null)}
          onDone={async (msg) => { setEditing(null); toast(msg, "success"); await onChanged(); }} />
      )}
    </div>
  );
}

function UpkeepModal({ task, items, facilities, onClose, onDone }: {
  task: UpkeepTask | null; items: InventoryItem[]; facilities: import("@/types/facility").Facility[];
  onClose: () => void; onDone: (msg: string) => void | Promise<void>;
}) {
  const { inp } = useAdminStyle();
  const [title, setTitle] = useState(task?.title ?? "");
  const [every, setEvery] = useState(String(task?.everyDays ?? 7));
  const [start, setStart] = useState(task?.startDate ?? manilaDate());
  const [facilityId, setFacilityId] = useState(task?.facilityId ? String(task.facilityId) : "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [supplies, setSupplies] = useState<SupplyLine[]>(task?.supplies ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = { ...inp, width: "100%" };
  const save = async () => {
    setError(""); setBusy(true);
    const body = { title: title.trim(), everyDays: Number(every), startDate: start, facilityId: facilityId ? Number(facilityId) : null, notes, supplies: nonZero(supplies) };
    const r = task ? await send(`/api/upkeep?id=${task.id}`, "PATCH", body) : await send("/api/upkeep", "POST", body);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not save it.");
    await onDone(task ? `"${body.title}" saved.` : `"${body.title}" scheduled. It shows on My Tasks on its days.`);
  };
  return (
    <Modal title={task ? `Edit ${task.title}` : "Schedule an upkeep task"} onClose={onClose} width={620}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</ActionButton>
        </div>
      }>
      <div style={{ display: "grid", gap: 14 }}>
        <div><Label htmlFor="up-title">WHAT</Label><Input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Pool cleaning" style={field} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><Label htmlFor="up-every">EVERY HOW MANY DAYS</Label><Input id="up-every" type="number" min={1} max={365} value={every} onChange={(e) => setEvery(e.target.value)} style={field} /></div>
          <div><Label htmlFor="up-start">FIRST DAY</Label><Input id="up-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} style={field} /></div>
        </div>
        <div>
          <Label htmlFor="up-fac">WHERE (optional)</Label>
          <FullSelect id="up-fac" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} style={{ ...inp, padding: "8px 36px 8px 12px" }}>
            <option value="">— anywhere —</option>
            {facilities.filter((f) => f.active !== false).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </FullSelect>
        </div>
        <div>
          <Label>USES EACH TIME</Label>
          <SupplyLines value={supplies} onChange={setSupplies} inventory={items} emptyText="No supplies — add the chemicals or cleaning items it uses." />
        </div>
        <div><Label htmlFor="up-notes">Instructions (optional)</Label><Textarea id="up-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} style={{ ...field, resize: "none" }} placeholder="e.g. Test the pH first; add reducer only if above 7.6" /></div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

// ── Cleaning supplies per facility (owner) ────────────────────────────
function CleaningView({ data, items, facilities, mob, onChanged }: {
  data: UpkeepData; items: InventoryItem[]; facilities: import("@/types/facility").Facility[]; mob: boolean; onChanged: () => Promise<void>;
}) {
  const { C, cBr, rowBg } = useAdminStyle();
  const { toast } = useToast();
  const [editing, setEditing] = useState<import("@/types/facility").Facility | null>(null);
  const [lines, setLines] = useState<SupplyLine[]>([]);
  const [busy, setBusy] = useState(false);
  if (!data.enabled) return <p style={{ color: C.textS, fontSize: 13.5 }}>Cleaning supplies start once the database update is applied.</p>;
  const list = facilities.filter((f) => f.active !== false);
  return (
    <div>
      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 12px", maxWidth: 640 }}>
        What cleaning each facility after a group usually takes. The caretaker confirms or changes it when they mark it cleaned, and it comes off the stock.
      </p>
      <TableShell label="Cleaning supplies" head={["Facility", "Cleaning uses", ""]} minWidth={mob ? 520 : 720}>
        {list.map((f, idx) => (
          <Row key={f.id} style={{ background: rowBg(idx), borderBottom: `1px solid ${cBr}` }}>
            <Cell style={{ ...td, color: C.textH }}>{f.name}</Cell>
            <Cell style={{ ...td, fontSize: 12.5 }}><SupplySummary lines={data.cleaningSupplies[f.id] ?? []} inventory={items} /></Cell>
            <Cell style={{ ...td, textAlign: "right" }}>
              <ActionButton size="sm" icon="edit" onClick={() => { setEditing(f); setLines(data.cleaningSupplies[f.id] ?? []); }}>Set</ActionButton>
            </Cell>
          </Row>
        ))}
      </TableShell>
      {editing && (
        <Modal title={`Cleaning ${editing.name}`} subtitle="The usual amounts, each time it is cleaned." onClose={() => setEditing(null)} width={560}
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <ActionButton onClick={() => setEditing(null)}>Cancel</ActionButton>
              <ActionButton kind="primary" icon="check" disabled={busy} onClick={async () => {
                setBusy(true);
                const r = await send("/api/facilities/supplies", "PUT", { facilityId: editing.id, supplies: nonZero(lines) });
                setBusy(false);
                if (!r.ok) return toast(r.error ?? "Could not save.", "error");
                toast(`Saved the cleaning supplies for ${editing.name}.`, "success"); setEditing(null); await onChanged();
              }}>Save</ActionButton>
            </div>
          }>
          <SupplyLines value={lines} onChange={setLines} inventory={items} emptyText="Nothing yet — add what cleaning it uses." />
        </Modal>
      )}
    </div>
  );
}
