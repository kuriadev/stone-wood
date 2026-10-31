"use client";

/* Data retention, in Rates & Settings (owner only): keep finished bookings
 * for N months after the stay, then delete them by themselves -- or delete
 * them now, by hand. Rules in lib/retention.ts; /api/retention. Saved on
 * its own (not with the rates form), since turning it on deletes data. */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useAdminStyle, ActionButton, ErrorNote, useConfirm, Label } from "@/components/admin/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { fmtDate } from "@/lib/utils";
import { manilaDate, manilaTime } from "@/lib/finance";
import { RETENTION_PRESETS, RETENTION_MIN_MONTHS, RETENTION_MAX_MONTHS, monthsLabel } from "@/lib/retention";

type State = { ready: boolean; enabled: boolean; months: number; lastRunAt?: string | null; lastDeleted?: number | null; wouldDelete: number; cutoff: string };

export function RetentionPanel({ mob, bare = false }: { mob: boolean; /** Inside a pop-up: no card or heading of its own. */ bare?: boolean }) {
  const { C, cBg, cBr, inp } = useAdminStyle();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [s, setS] = useState<State | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [months, setMonths] = useState("12");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await fetch("/api/retention", { cache: "no-store" }).then((r) => r.json()).catch(() => null) as (State & { success?: boolean; error?: string }) | null;
    if (!j?.success) { setError(j?.error ?? "Could not load data retention."); return; }
    setS(j);
    setEnabled(j.enabled);
    setMonths(String(j.months));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on open
  useEffect(() => { void load(); }, [load]);

  const n = Number(months);
  const validMonths = Number.isInteger(n) && n >= RETENTION_MIN_MONTHS && n <= RETENTION_MAX_MONTHS;
  const dirty = !!s && (enabled !== s.enabled || n !== s.months);

  const doSave = async () => {
    setBusy(true); setError("");
    const j = await fetch("/api/retention", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, months: n }) })
      .then((r) => r.json()).catch(() => null) as { success?: boolean; error?: string } | null;
    setBusy(false);
    if (!j?.success) return setError(j?.error ?? "Could not save.");
    toast(enabled ? `Saved. Finished bookings will be deleted ${monthsLabel(n)} after the stay.` : "Saved. Bookings are kept until you delete them.", "success");
    await load();
  };
  const save = () => {
    if (!validMonths) return setError(`Choose ${RETENTION_MIN_MONTHS} to ${RETENTION_MAX_MONTHS} months.`);
    if (enabled && (!s?.enabled || n < s.months)) {
      confirm({
        title: "Turn on automatic deletion?",
        body: `Once a day, finished bookings whose stay ended more than ${monthsLabel(n)} ago will be deleted for good — the guest's name, email, phone and notes. Payments stay in Sales without the guest's name. This can't be undone.`,
        action: "Turn on",
        onConfirm: () => void doSave(),
      });
    } else void doSave();
  };

  const runNow = () => {
    if (!s) return;
    confirm({
      title: s.wouldDelete > 0 ? `Delete ${s.wouldDelete} old booking${s.wouldDelete === 1 ? "" : "s"} now?` : "Nothing to delete",
      body: s.wouldDelete > 0
        ? `Finished bookings whose stay ended before ${fmtDate(s.cutoff)} will be deleted for good. Payments stay in Sales without the guest's name. This can't be undone.`
        : `No finished bookings are older than ${monthsLabel(s.months)}.`,
      action: s.wouldDelete > 0 ? "Delete now" : "OK",
      onConfirm: () => void (async () => {
        if (s.wouldDelete === 0) return;
        setBusy(true); setError("");
        const j = await fetch("/api/retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) })
          .then((r) => r.json()).catch(() => null) as { success?: boolean; error?: string; deleted?: number } | null;
        setBusy(false);
        if (!j?.success) return setError(j?.error ?? "Could not delete.");
        toast(`Deleted ${j.deleted ?? 0} old booking${j.deleted === 1 ? "" : "s"}.`, "success");
        await load();
      })(),
    });
  };

  return (
    <section style={bare ? {} : { border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, padding: mob ? "16px" : "20px 24px", marginBottom: 20 }}>
      {!bare && <h2 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0, display: "flex", gap: 8, alignItems: "center" }}><Icon name="history" size={16} /> Data retention</h2>}
      <p style={{ color: C.textS, fontSize: 13, margin: bare ? "0 0 16px" : "6px 0 16px", lineHeight: 1.55 }}>
        How long guests&apos; finished bookings are kept. Only completed or cancelled bookings are ever deleted — never one that is
        coming up, waiting on the guest, or owed a refund. Payments always stay in Sales, without the guest&apos;s name.
      </p>
      {!s ? <p style={{ color: C.textS, fontSize: 13 }}>{error || "Loading…"}</p> : !s.ready ? (
        <p style={{ color: C.textS, fontSize: 13 }}>This switches on once the database update (20261028130000_site_content.sql) is applied.</p>
      ) : (
        <>
          <label style={{ display: "flex", gap: 10, alignItems: "center", color: C.textH, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
            Delete old bookings automatically
          </label>
          <div style={{ marginTop: 14, opacity: enabled ? 1 : 0.6 }}>
            <Label htmlFor="ret-months">Keep finished bookings for</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {RETENTION_PRESETS.map((p) => (
                <button key={p} type="button" className="sw-choice" onClick={() => setMonths(String(p))} aria-pressed={n === p}
                  style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, background: n === p ? "rgba(201,168,76,0.12)" : "transparent", color: n === p ? C.goldInk : C.textB, border: `1px solid ${n === p ? "rgba(201,168,76,0.55)" : cBr}` }}>
                  {monthsLabel(p)}
                </button>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.textS, fontSize: 13 }}>
                or <Input id="ret-months" type="number" min={RETENTION_MIN_MONTHS} max={RETENTION_MAX_MONTHS} value={months} onChange={(e) => setMonths(e.target.value)} style={{ ...inp, width: 80 }} /> months
              </span>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(150,130,100,0.08)", color: C.textB, fontSize: 13, lineHeight: 1.55 }}>
            {s.wouldDelete > 0
              ? <>With the saved setting, <strong>{s.wouldDelete} booking{s.wouldDelete === 1 ? "" : "s"}</strong> ended before {fmtDate(s.cutoff)} and {s.enabled ? "will be deleted at the next daily run" : "would be deleted"}.</>
              : <>No finished bookings are older than {monthsLabel(s.months)} right now.</>}
            {s.lastRunAt && <div style={{ color: C.textS, fontSize: 12, marginTop: 4 }}>Last run {fmtDate(manilaDate(s.lastRunAt))}, {manilaTime(s.lastRunAt)}: {s.lastDeleted ?? 0} deleted.</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 16 }}>
            <ActionButton kind="red" icon="trash" disabled={busy} onClick={runNow}>Delete old bookings now</ActionButton>
            <ActionButton kind="primary" icon="check" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save retention" : "Saved"}</ActionButton>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </>
      )}
      {confirmDialog}
    </section>
  );
}
