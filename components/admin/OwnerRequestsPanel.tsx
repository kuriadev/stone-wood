"use client";

/* Approvals, at the top of the Dashboard. It folds away like a dropdown
 * (FoldHeader), but the header and its count always stay on screen, and the
 * super admin always sees it.
 *
 * Super admin: every pending request, each one line they can decide on
 * ("Void the ₱2,000 GCash payment on SW-10150 (Juan)") with who asked and
 * why. Approve runs it — the same route the owner's own button would — and
 * Decline sends a note back. Nothing reaches the guest until then.
 *
 * Front desk: what they sent, and what happened to it, so nobody has to
 * walk over and ask "did you see my refund?".
 *
 * Guest reschedules waiting for a decision are counted here too, with a
 * button to the Reschedules list, so every approval starts in one place.
 *
 * The super admin always sees the panel ("Nothing waiting" when empty);
 * front desk sees it once they have sent something.
 */

import { useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useStaff } from "@/contexts/StaffContext";
import { useToast } from "@/contexts/ToastContext";
import { ActionButton, ConfirmDialog, Label, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/common/Icon";
import { FoldHeader, useFold } from "@/components/admin/FoldHeader";
import { manilaTime } from "@/lib/finance";
import type { OwnerRequest } from "@/types/admin";

const STATUS_COLOR: Record<OwnerRequest["status"], string> = {
  Pending: "#e0a020", Approved: "#2e9e4e", Declined: "#e55", Withdrawn: "#888",
};

export function OwnerRequestsPanel({ mob, reschedules = 0, onReviewReschedules }: {
  mob: boolean;
  /** Guest date changes waiting for the super admin (Dashboard → Reschedules). */
  reschedules?: number;
  onReviewReschedules?: () => void;
}) {
  const { C, cBr, cBg, inp } = useAdminStyle();
  const ops = useOps();
  const { can, staffEnabled } = useStaff();
  const { toast } = useToast();
  const isOwner = can("requests.decide");
  const [busy, setBusy] = useState<number | null>(null);
  const [open, toggle] = useFold("requests");
  const [declining, setDeclining] = useState<OwnerRequest | null>(null);
  /* Approving carries out a refund, a void or a cancellation, so it asks. */
  const [approving, setApproving] = useState<OwnerRequest | null>(null);
  const [note, setNote] = useState("");

  if (!staffEnabled) return null;
  const pending = ops.requests.filter((r) => r.status === "Pending");
  // Front desk also sees the owner's answers from the last three days (not
  // their own withdrawals). Older ones are in Activity History.
  const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const answered = isOwner ? [] : ops.requests
    .filter((r) => (r.status === "Approved" || r.status === "Declined") && (r.decidedAt ?? r.requestedAt) >= recent)
    .slice(0, 5);
  const waiting = pending.length + (isOwner ? reschedules : 0);
  if (!isOwner && pending.length === 0 && answered.length === 0) return null;

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
          <p style={{ color: C.textB, fontSize: 13, margin: "4px 0 0" }}>{r.decidedByName ?? "Super admin"}: {r.decisionNote}</p>
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
            <ActionButton size="sm" kind="primary" icon="check" onClick={() => setApproving(r)} disabled={busy === r.id}>
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
    <section aria-labelledby="owner-requests" style={{ border: `1px solid ${waiting && isOwner ? "#e0a02088" : cBr}`, borderRadius: 12, background: cBg, padding: open && (waiting || answered.length) ? "16px 20px 4px" : "16px 20px", marginBottom: 24 }}>
      <FoldHeader id="owner-requests" icon="handshake" iconColor="#e0a020" open={open} onToggle={toggle}
        title={isOwner ? `Waiting for your approval${waiting ? ` (${waiting})` : ""}` : "Your requests to the super admin"}
        folded={isOwner
          ? (waiting ? null : "nothing waiting")
          : [pending.length ? `${pending.length} waiting` : "", answered.length ? `${answered.length} answered` : ""].filter(Boolean).join(", ")} />
      {!open ? null : isOwner && waiting === 0 ? (
        <p style={{ color: C.textS, fontSize: 13, margin: "6px 0 0" }}>Nothing waiting for your approval.</p>
      ) : (
        <div id="owner-requests-body">
          <p style={{ color: C.textS, fontSize: 12.5, margin: "6px 0 10px" }}>
            {isOwner
              ? "Front desk can't refund, void, cancel or remove records on their own. Approving does it now, exactly as if you had pressed the button."
              : "These happen only once the super admin approves them. Answers stay here for three days; all of them are in Activity History."}
          </p>
          <ul style={{ margin: 0, padding: 0 }}>
            {isOwner && reschedules > 0 && (
              <li style={{ listStyle: "none", borderTop: `1px solid ${cBr}`, padding: "14px 0", display: "flex", gap: 16, alignItems: "center", flexWrap: mob ? "wrap" : "nowrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StatusBadge color="#e0a020">Reschedule</StatusBadge>
                  <p style={{ color: C.textH, fontSize: 14, margin: "4px 0 0", lineHeight: 1.55 }}>
                    {reschedules} guest{reschedules === 1 ? " wants" : "s want"} a new date. The date is held for them while you decide.
                  </p>
                </div>
                {onReviewReschedules && (
                  <ActionButton size="sm" kind="primary" icon="calendar" onClick={onReviewReschedules}>Review</ActionButton>
                )}
              </li>
            )}
            {pending.map(row)}
            {answered.map(row)}
          </ul>
        </div>
      )}

      {approving && (
        <ConfirmDialog
          title="Approve this request?"
          description={approving.summary}
          onCancel={() => setApproving(null)} cancelLabel="Go back"
          confirm={<ActionButton kind="primary" icon="check" disabled={busy === approving.id} onClick={() => { const r = approving; setApproving(null); void approve(r); }}>Approve</ActionButton>}
        >
          <p style={{ color: C.textS, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            It happens right away, exactly as if you had pressed the button yourself.
          </p>
        </ConfirmDialog>
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
