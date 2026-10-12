"use client";

/* Requests to the owner, at the top of the Dashboard.
 *
 * Owner: every pending request, each one line the owner can decide on
 * ("Void the ₱2,000 GCash payment on SW-10150 (Juan)") with who asked and
 * why. Approve runs it — the same route the owner's own button would — and
 * Decline sends a note back. Nothing reaches the guest until then.
 *
 * Front desk: what they sent, and what happened to it, so nobody has to
 * walk over and ask "did you see my refund?".
 *
 * Hidden when there is nothing to show.
 */

import { useEffect, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useStaff } from "@/contexts/StaffContext";
import { useToast } from "@/contexts/ToastContext";
import { ActionButton, ConfirmDialog, Label, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/common/Icon";
import { manilaTime } from "@/lib/finance";
import type { OwnerRequest } from "@/types/admin";

const STATUS_COLOR: Record<OwnerRequest["status"], string> = {
  Pending: "#e0a020", Approved: "#2e9e4e", Declined: "#e55", Withdrawn: "#888",
};

export function OwnerRequestsPanel({ mob }: { mob: boolean }) {
  const { C, cBr, cBg, inp } = useAdminStyle();
  const ops = useOps();
  const { can, staffEnabled } = useStaff();
  const { toast } = useToast();
  const isOwner = can("requests.decide");
  const { me } = useStaff();
  const [busy, setBusy] = useState<number | null>(null);
  /* Folded away or open, like a dropdown: the arrow at the top right. Each
     person's choice is remembered on this browser. Folding only tucks the
     list away — the count stays in the header, nothing is removed. */
  const openKey = `sw_requests_open:${me?.id ?? "me"}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { const v = localStorage.getItem(openKey); if (v !== null) setOpen(v === "1"); } catch { /* none */ }
  }, [openKey]);
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(openKey, o ? "0" : "1"); } catch { /* private mode */ }
    return !o;
  });
  const [declining, setDeclining] = useState<OwnerRequest | null>(null);
  const [note, setNote] = useState("");

  if (!staffEnabled) return null;
  const pending = ops.requests.filter((r) => r.status === "Pending");
  // Front desk also sees the owner's answers from the last three days (not
  // their own withdrawals). Older ones are in Activity History.
  const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const answered = isOwner ? [] : ops.requests
    .filter((r) => (r.status === "Approved" || r.status === "Declined") && (r.decidedAt ?? r.requestedAt) >= recent)
    .slice(0, 5);
  if (pending.length === 0 && answered.length === 0) return null;

  const approve = async (r: OwnerRequest) => {
    setBusy(r.id);
    const res = await ops.decideRequest(r.id, true, "");
    setBusy(null);
    if (res.ok) toast(`Done: ${r.summary}`, "success");
    else toast(res.error, "error");
  };

  const row = (r: OwnerRequest) => (
    <li key={r.id} style={{ listStyle: "none", borderTop: `1px solid ${cBr}`, padding: "14px 0", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: mob ? "wrap" : "nowrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <StatusBadge color={STATUS_COLOR[r.status]}>{r.status === "Pending" ? r.label : r.status}</StatusBadge>
          <span style={{ color: C.textS, fontSize: 12 }}>
            {isOwner ? `${r.requestedByName} · ` : ""}{manilaTime(r.requestedAt)}
          </span>
        </div>
        <p style={{ color: C.textH, fontSize: 14, margin: 0, lineHeight: 1.55 }}>{r.summary}</p>
        {r.reason && <p style={{ color: C.textS, fontSize: 13, margin: "4px 0 0" }}>Reason: {r.reason}</p>}
        {r.status !== "Pending" && r.decisionNote && (
          <p style={{ color: C.textB, fontSize: 13, margin: "4px 0 0" }}>{r.decidedByName ?? "Owner"}: {r.decisionNote}</p>
        )}
        {r.status === "Pending" && r.lastError && (
          <p style={{ color: "var(--sw-danger-ink)", fontSize: 12.5, margin: "6px 0 0", display: "flex", gap: 6 }}>
            <Icon name="alert" size={13} style={{ marginTop: 2, flexShrink: 0 }} /> Last try didn&apos;t go through: {r.lastError}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {r.status === "Pending" && isOwner && (
          <>
            <ActionButton size="sm" onClick={() => { setDeclining(r); setNote(""); }} disabled={busy === r.id}>Decline</ActionButton>
            <ActionButton size="sm" kind="primary" icon="check" onClick={() => void approve(r)} disabled={busy === r.id}>
              {busy === r.id ? "Working…" : "Approve"}
            </ActionButton>
          </>
        )}
        {r.status === "Pending" && !isOwner && (
          <ActionButton size="sm" onClick={async () => {
            const res = await ops.withdrawRequest(r.id);
            toast(res.ok ? "Request withdrawn." : res.error, res.ok ? "info" : "error");
          }}>Withdraw</ActionButton>
        )}
      </div>
    </li>
  );

  return (
    <section aria-labelledby="owner-requests" style={{ border: `1px solid ${pending.length && isOwner ? "#e0a02088" : cBr}`, borderRadius: 12, background: cBg, padding: open ? "16px 20px 4px" : "16px 20px", marginBottom: 24 }}>
      {/* The whole header opens and closes the box; the arrow at the top
          right says which way it will go. */}
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls="owner-requests-list" className="sw-hit"
        style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
        <Icon name="handshake" size={17} style={{ color: "#e0a020", flexShrink: 0 }} />
        <h2 id="owner-requests" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textH, flex: 1, minWidth: 0 }}>
          {isOwner ? `Waiting for your approval${pending.length ? ` (${pending.length})` : ""}` : "Your requests to the owner"}
          {!open && !isOwner && (
            <span style={{ color: C.textS, fontWeight: 400, fontSize: 13 }}>
              {" "}· {[pending.length ? `${pending.length} waiting` : "", answered.length ? `${answered.length} answered` : ""].filter(Boolean).join(", ")}
            </span>
          )}
        </h2>
        <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${cBr}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.textB, flexShrink: 0 }}>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
        </span>
        <span className="sr-only">{open ? "Fold away" : "Show"}</span>
      </button>
      {open && (
        <div id="owner-requests-list">
          <p style={{ color: C.textS, fontSize: 12.5, margin: "6px 0 10px" }}>
            {isOwner
              ? "Front desk can't refund, void, cancel or remove records on their own. Approving does it now, exactly as if you had pressed the button."
              : "These happen only once the owner approves them. Answers stay here for three days; all of them are in Activity History."}
          </p>
          <ul style={{ margin: 0, padding: 0 }}>
            {pending.map(row)}
            {answered.map(row)}
          </ul>
        </div>
      )}

      {declining && (
        <ConfirmDialog
          title="Decline this request?"
          description={declining.summary}
          onCancel={() => setDeclining(null)}
          confirm={
            <ActionButton kind="red" disabled={busy === declining.id} onClick={async () => {
              setBusy(declining.id);
              const res = await ops.decideRequest(declining.id, false, note.trim());
              setBusy(null);
              if (res.ok) { toast(note.trim() ? "Declined. Front desk will see your note." : "Declined.", "info"); setDeclining(null); }
              else toast(res.error, "error");
            }}>Decline</ActionButton>
          }
        >
          <div>
            <Label htmlFor="decline-note">Why? (optional — front desk sees this)</Label>
            <Textarea id="decline-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} style={{ ...inp, width: "100%" }}
              placeholder="e.g. The guest already got their money back by GCash." />
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
