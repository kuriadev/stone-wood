"use client";

/* Auto-archive and data retention, behind the settings icon in All bookings
 * (owner only). Two steps: finished bookings move to the archive by
 * themselves N months after the stay (2 by default), and the archive can be
 * deleted for good on a date the owner sets -- a day of every month, or a
 * day of one month every year. Rules in lib/retention.ts; /api/retention.
 * Saved on its own (not with the rates form), since deletion removes data. */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useAdminStyle, ActionButton, ErrorNote, useConfirm, Label } from "@/components/admin/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { fmtDate } from "@/lib/utils";
import { manilaDate, manilaTime } from "@/lib/finance";
import {
  ARCHIVE_PRESETS, ARCHIVE_MIN_MONTHS, ARCHIVE_MAX_MONTHS, MONTH_NAMES, monthsLabel, scheduleLabel, nextScheduledOn,
  type DeleteSchedule,
} from "@/lib/retention";

type State = {
  ready: boolean;
  archiveEnabled: boolean; archiveMonths: number;
  enabled: boolean; schedule: DeleteSchedule; day: number; month: number;
  lastRunAt?: string | null; lastDeleted?: number | null; lastArchived?: number | null; lastPurgeOn?: string | null;
  wouldArchive: number; archiveCutoff: string; wouldDelete: number; nextDeleteOn: string;
};

export function RetentionPanel({ mob, bare = false, onChanged }: {
  mob: boolean;
  /** Inside a pop-up: no card or heading of its own. */
  bare?: boolean;
  /** Bookings were archived or deleted: the list should reload. */
  onChanged?: () => void;
}) {
  const { C, cBg, cBr, inp } = useAdminStyle();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [s, setS] = useState<State | null>(null);
  const [archiveEnabled, setArchiveEnabled] = useState(true);
  const [archiveMonths, setArchiveMonths] = useState("2");
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState<DeleteSchedule>("monthly");
  const [day, setDay] = useState("1");
  const [month, setMonth] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const take = (j: State) => {
    setS(j);
    setArchiveEnabled(j.archiveEnabled); setArchiveMonths(String(j.archiveMonths));
    setEnabled(j.enabled); setSchedule(j.schedule); setDay(String(j.day)); setMonth(String(j.month));
  };
  const load = useCallback(async () => {
    const j = await fetch("/api/retention", { cache: "no-store" }).then((r) => r.json()).catch(() => null) as (State & { success?: boolean; error?: string }) | null;
    if (!j?.success) { setError(j?.error ?? "Could not load the archive settings."); return; }
    take(j);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on open
  useEffect(() => { void load(); }, [load]);

  const am = Number(archiveMonths), dd = Number(day), mm = Number(month);
  const validMonths = Number.isInteger(am) && am >= ARCHIVE_MIN_MONTHS && am <= ARCHIVE_MAX_MONTHS;
  const validDay = Number.isInteger(dd) && dd >= 1 && dd <= 31;
  const plan = { schedule, day: validDay ? dd : 1, month: mm };
  const dirty = !!s && (archiveEnabled !== s.archiveEnabled || am !== s.archiveMonths || enabled !== s.enabled
    || schedule !== s.schedule || dd !== s.day || mm !== s.month);

  const doSave = async () => {
    setBusy(true); setError("");
    const j = await fetch("/api/retention", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveEnabled, archiveMonths: am, enabled, schedule, day: dd, month: mm }),
    }).then((r) => r.json()).catch(() => null) as (State & { success?: boolean; error?: string }) | null;
    setBusy(false);
    if (!j?.success) return setError(j?.error ?? "Could not save.");
    toast("Archive settings saved.", "success");
    await load();
  };
  const save = () => {
    if (!validMonths) return setError(`Archive after ${ARCHIVE_MIN_MONTHS} to ${ARCHIVE_MAX_MONTHS} months.`);
    if (!validDay) return setError("Choose a day from 1 to 31.");
    if (enabled && (!s?.enabled || schedule !== s.schedule || dd !== s.day || mm !== s.month)) {
      confirm({
        title: "Delete the archive automatically?",
        body: `${scheduleLabel(plan).replace(/^./, (c) => c.toUpperCase())}, everything in the Archived list will be deleted for good — the guest's name, email, phone and notes. Payments stay in Sales without the guest's name. The first clean-up is on ${fmtDate(nextScheduledOn(manilaDate(), plan))}. This can't be undone.`,
        action: "Turn on",
        onConfirm: () => void doSave(),
      });
    } else void doSave();
  };

  const post = async (action: "archive" | "purge") => {
    setBusy(true); setError("");
    const j = await fetch("/api/retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      .then((r) => r.json()).catch(() => null) as { success?: boolean; error?: string; deleted?: number; archived?: number } | null;
    setBusy(false);
    if (!j?.success) return setError(j?.error ?? "Could not finish.");
    toast(action === "archive"
      ? `Archived ${j.archived ?? 0} booking${j.archived === 1 ? "" : "s"}.`
      : `Deleted ${j.deleted ?? 0} archived booking${j.deleted === 1 ? "" : "s"}.`, "success");
    onChanged?.();
    await load();
  };
  const archiveNow = () => {
    if (!s) return;
    if (s.wouldArchive === 0) return toast(`No finished bookings are older than ${monthsLabel(s.archiveMonths)}.`, "info");
    confirm({
      title: `Archive ${s.wouldArchive} booking${s.wouldArchive === 1 ? "" : "s"} now?`,
      body: `Finished bookings whose stay ended before ${fmtDate(s.archiveCutoff)} move to the Archived list. Nothing is deleted, and any of them can be restored.`,
      action: "Archive now",
      onConfirm: () => void post("archive"),
    });
  };
  const deleteNow = () => {
    if (!s) return;
    if (s.wouldDelete === 0) return toast("The archive has nothing that can be deleted.", "info");
    confirm({
      title: `Delete ${s.wouldDelete} archived booking${s.wouldDelete === 1 ? "" : "s"} now?`,
      body: "Everything in the Archived list is deleted for good. Payments stay in Sales without the guest's name. This can't be undone.",
      action: "Delete now",
      onConfirm: () => void post("purge"),
    });
  };

  const chip = (on: boolean) => ({
    padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    background: on ? "rgba(201,168,76,0.12)" : "transparent", color: on ? C.goldInk : C.textB,
    border: `1px solid ${on ? "rgba(201,168,76,0.55)" : cBr}`,
  });
  const block = { border: `1px solid ${cBr}`, borderRadius: 12, padding: mob ? "14px" : "16px 18px" };
  const note = { marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(150,130,100,0.08)", color: C.textB, fontSize: 13, lineHeight: 1.55 };
  const heading = (icon: "folder" | "trash", text: string) => (
    <h3 style={{ color: C.textH, fontSize: 14.5, fontWeight: 700, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={15} style={{ color: C.goldInk }} /> {text}
    </h3>
  );

  return (
    <section style={bare ? {} : { border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, padding: mob ? "16px" : "20px 24px", marginBottom: 20 }}>
      {!bare && <h2 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: "0 0 12px", display: "flex", gap: 8, alignItems: "center" }}><Icon name="settings" size={16} /> Archive & data retention</h2>}
      {!s ? <p style={{ color: C.textS, fontSize: 13 }}>{error || "Loading…"}</p> : !s.ready ? (
        <p style={{ color: C.textS, fontSize: 13 }}>This switches on once the database update (20261028130000_site_content.sql) is applied.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {/* 1. Auto-archive */}
          <div style={block}>
            {heading("folder", "Auto-archive")}
            <label style={{ display: "flex", gap: 10, alignItems: "center", color: C.textH, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              <Checkbox checked={archiveEnabled} onCheckedChange={(v) => setArchiveEnabled(v === true)} />
              Move finished bookings to the archive automatically
            </label>
            <div style={{ marginTop: 12, opacity: archiveEnabled ? 1 : 0.55 }}>
              <Label htmlFor="ret-archive">After the stay ended</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {ARCHIVE_PRESETS.map((p) => (
                  <button key={p} type="button" className="sw-choice" onClick={() => setArchiveMonths(String(p))} aria-pressed={am === p} style={chip(am === p)}>
                    {monthsLabel(p)}
                  </button>
                ))}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.textS, fontSize: 13 }}>
                  or <Input id="ret-archive" type="number" min={ARCHIVE_MIN_MONTHS} max={ARCHIVE_MAX_MONTHS} value={archiveMonths} onChange={(e) => setArchiveMonths(e.target.value)} style={{ ...inp, width: 76 }} /> months
                </span>
              </div>
            </div>
            <div style={note}>
              Only completed or cancelled bookings, never one with a refund still owed. Archiving deletes nothing — restore any of them from the Archived list.
              {s.wouldArchive > 0 && <div style={{ marginTop: 4 }}><strong>{s.wouldArchive}</strong> finished booking{s.wouldArchive === 1 ? "" : "s"} ended before {fmtDate(s.archiveCutoff)} and {s.archiveEnabled ? "will be archived at the next daily run" : "could be archived"}.</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <ActionButton icon="folder" disabled={busy} onClick={archiveNow}>Archive old bookings now</ActionButton>
            </div>
          </div>

          {/* 2. Delete the archive on a schedule */}
          <div style={block}>
            {heading("trash", "Delete the archive")}
            <label style={{ display: "flex", gap: 10, alignItems: "center", color: C.textH, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
              Delete everything in the archive on a set date
            </label>
            <div style={{ marginTop: 12, opacity: enabled ? 1 : 0.55, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["monthly", "yearly"] as const).map((k) => (
                  <button key={k} type="button" className="sw-choice" onClick={() => setSchedule(k)} aria-pressed={schedule === k} style={chip(schedule === k)}>
                    {k === "monthly" ? "Every month" : "Every year"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: C.textS, fontSize: 13 }}>
                On
                {schedule === "yearly" && (
                  <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inp, width: "auto", height: 38, padding: "0 10px" }}>
                    {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                  </select>
                )}
                <span>{schedule === "monthly" ? "day" : ""}</span>
                <Input aria-label="Day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} style={{ ...inp, width: 76 }} />
                {schedule === "monthly" && <span>of every month</span>}
              </div>
            </div>
            <div style={note}>
              {enabled && validDay
                ? <>The archive is deleted {scheduleLabel(plan)} (a short month uses its last day). Next: <strong>{fmtDate(nextScheduledOn(manilaDate(), plan))}</strong>.</>
                : <>The archive is kept until you delete it.</>}
              {" "}Payments always stay in Sales, without the guest&apos;s name.
              <div style={{ marginTop: 4 }}>{s.wouldDelete > 0 ? <><strong>{s.wouldDelete}</strong> archived booking{s.wouldDelete === 1 ? "" : "s"} can be deleted.</> : "Nothing in the archive to delete right now."}</div>
              {s.lastRunAt && <div style={{ color: C.textS, fontSize: 12, marginTop: 4 }}>Last run {fmtDate(manilaDate(s.lastRunAt))}, {manilaTime(s.lastRunAt)}: {s.lastArchived ?? 0} archived, {s.lastDeleted ?? 0} deleted.</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <ActionButton kind="red" icon="trash" disabled={busy} onClick={deleteNow}>Delete the archive now</ActionButton>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <ActionButton kind="primary" icon="check" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save settings" : "Saved"}</ActionButton>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
