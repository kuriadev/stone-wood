"use client";

/* Import bookings taken while the internet was down.
 *
 * 1. Download the template (dropdowns for every choice) or type up the
 *    printed offline sheet into it.
 * 2. Choose the filled-in file. It is read here, and every line is checked
 *    on the server by the walk-in rules WITHOUT saving: price, the calendar
 *    (each line as if the lines above it were booked), the money taken.
 * 3. The list says, line by line, what will happen. Import saves the lines
 *    that passed; the rest stay in the file to fix and import again.
 */

import { useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { Modal, ActionButton, ErrorNote, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import { readImportSheet, type ImportLine } from "@/lib/importBookings";
import { downloadImportTemplate, readWorkbookGrid } from "@/components/admin/importTemplate";
import { fmt } from "@/lib/utils";

interface Checked extends ImportLine {
  ok: boolean;
  /** From the server: the reason, the price, the reference once saved. */
  note?: string;
  total?: number;
  status?: string;
  id?: string;
}

type ServerRow = { row: number; ok: boolean; error?: string; total?: number; label?: string; status?: string; id?: string };

export function ImportBookingsModal({ onClose, onPrintOffline }: { onClose: () => void; onPrintOffline?: () => void }) {
  const { C, cBr, soft } = useAdminStyle();
  const { rooms, reloadBookings } = useApp();
  const ops = useOps();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [lines, setLines] = useState<Checked[] | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "saving" | "template">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const send = async (bodies: ImportLine[], save: boolean): Promise<ServerRow[] | null> => {
    const res = await fetch("/api/bookings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: bodies.map((l) => l.body), save }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (!json?.results) {
      setError(json?.error ?? "No connection to the server. Check the internet and try again.");
      return null;
    }
    if (!json.success) setError(json.error ?? "The import stopped part-way.");
    return json.results as ServerRow[];
  };

  /** Merge the server's answer back onto the lines it was asked about. */
  const merge = (all: Checked[], asked: ImportLine[], answers: ServerRow[]): Checked[] =>
    all.map((l) => {
      const i = asked.findIndex((a) => a.line === l.line);
      const a = i < 0 ? undefined : answers.find((x) => x.row === i);
      if (!a) return l;
      return { ...l, ok: a.ok, note: a.error, total: a.total, status: a.status, id: a.id };
    });

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(""); setDone(false); setLines(null); setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Choose an Excel file (.xlsx). In Google Sheets: File → Download → Microsoft Excel.");
      return;
    }
    setBusy("reading");
    try {
      const grid = await readWorkbookGrid(file);
      const { lines: read, missing } = readImportSheet(grid, rooms);
      if (missing.length) { setError(`This file has no ${missing.join(", ")} column. Start from the template.`); return; }
      if (read.length === 0) { setError("There are no bookings in this file."); return; }
      const first: Checked[] = read.map((l) => ({ ...l, ok: !l.error, note: l.error }));
      const readable = read.filter((l) => l.body);
      if (readable.length === 0) { setLines(first); return; }
      const answers = await send(readable, false);
      setLines(answers ? merge(first, readable, answers) : first);
    } catch {
      setError("That file couldn't be read. Save it as an Excel workbook (.xlsx) and try again.");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const ready = (lines ?? []).filter((l) => l.ok && l.body);
  const save = async () => {
    if (!lines || ready.length === 0) return;
    setBusy("saving"); setError("");
    const answers = await send(ready, true);
    setBusy("");
    if (!answers) return;
    const next = merge(lines, ready, answers);
    setLines(next);
    setDone(true);
    const saved = next.filter((l) => l.id).length;
    await Promise.all([reloadBookings(), ops.refresh()]);
    toast(`Imported ${saved} booking${saved === 1 ? "" : "s"}.`, saved ? "success" : "warning");
  };

  const template = async () => {
    setBusy("template");
    try { await downloadImportTemplate(rooms); } catch { setError("The template couldn't be made. Try again."); }
    setBusy("");
  };

  const savedCount = (lines ?? []).filter((l) => l.id).length;
  const failed = (lines ?? []).filter((l) => !l.ok || (done && !l.id));

  return (
    <Modal title="Import bookings" onClose={onClose} width={760}
      subtitle="Bookings taken while the internet was down, for today or later. Nothing is saved until you press Import."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ActionButton onClick={onClose}>{done ? "Close" : "Cancel"}</ActionButton>
          {!done && (
            <ActionButton kind="primary" icon="check" disabled={busy !== "" || ready.length === 0} onClick={() => void save()}>
              {busy === "saving" ? "Importing…" : lines ? `Import ${ready.length} booking${ready.length === 1 ? "" : "s"}` : "Import"}
            </ActionButton>
          )}
        </div>
      }>
      {/* 1 and 2: the template, and the file. */}
      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.textB, lineHeight: 1.6 }}>
          <strong style={{ color: C.textH }}>1.</strong> Fill in the template, one booking per row. Tour, Booking, Pool, Rooms and Paid by are dropdowns.
          {onPrintOffline && <> Printed the offline sheet? Type its bookings into the template.</>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <ActionButton size="sm" icon="download" disabled={busy !== ""} onClick={() => void template()}>{busy === "template" ? "Making…" : "Download template"}</ActionButton>
            {onPrintOffline && <ActionButton size="sm" icon="printer" onClick={onPrintOffline}>Print offline sheet</ActionButton>}
          </div>
        </div>
        <div style={{ background: soft, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.textB }}>
          <strong style={{ color: C.textH }}>2.</strong> Choose the filled-in file (.xlsx).
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <ActionButton size="sm" icon="upload" disabled={busy !== ""} onClick={() => fileRef.current?.click()}>{busy === "reading" ? "Checking…" : lines ? "Choose another file" : "Choose file"}</ActionButton>
            {fileName && <span style={{ color: C.textS, fontSize: 12.5, overflowWrap: "anywhere" }}>{fileName}</span>}
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }}
              onChange={(e) => void choose(e.target.files?.[0])} />
          </div>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {/* 3: what will happen to each line. */}
      {lines && (
        <section aria-label="What will be imported">
          <p style={{ color: C.textH, fontSize: 14, fontWeight: 600, margin: "4px 0 8px" }}>
            {done
              ? `${savedCount} imported${failed.length ? `, ${failed.length} not imported` : ""}.`
              : `${ready.length} ready${lines.length - ready.length ? `, ${lines.length - ready.length} to fix in the file` : ""}.`}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${cBr}`, borderRadius: 10 }}>
            {lines.map((l, i) => {
              const good = done ? !!l.id : l.ok;
              return (
                <li key={l.line} style={{ padding: "10px 14px", borderTop: i ? `1px solid ${cBr}` : "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Icon name={good ? "check-circle" : "alert"} size={16} style={{ color: good ? "#2e9e4e" : "#d44", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.textH, fontSize: 13.5, overflowWrap: "anywhere" }}>
                      <span style={{ color: C.textS, fontSize: 12 }}>Row {l.line} · </span>{l.summary}
                    </div>
                    <div style={{ color: good ? C.textS : "#d44", fontSize: 12.5, marginTop: 2 }}>
                      {good
                        ? <>{l.id ? <><strong style={{ fontFamily: "monospace" }}>{l.id}</strong> · </> : null}{l.total !== undefined ? fmt(l.total) : ""}
                            {l.body?.initialPayment ? ` · ${fmt(l.body.initialPayment.amount)} paid by ${l.body.initialPayment.method}` : " · nothing paid yet"}</>
                        : l.note ?? "Not imported."}
                    </div>
                  </div>
                  {good && l.status && <StatusBadge color={l.status === "Confirmed" ? "#2e9e4e" : "#d4a800"}>{l.status === "Confirmed" ? "Confirmed" : "Awaiting payment"}</StatusBadge>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Modal>
  );
}
