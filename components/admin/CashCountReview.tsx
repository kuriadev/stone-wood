"use client";

/* Looking into a day whose cash count came out short or over, from the
 * owner's My Tasks. One window with everything needed to settle it:
 *
 *   The count        opening float + cash in − cash out = what should be in
 *                    the box, against what was counted, and who closed it
 *   Cash entries     every cash payment, refund and expense recorded that
 *                    day, so the count can be matched line by line
 *   What could       records whose amount is exactly the difference first
 *   explain it       (lib/cashReview), then the usual causes
 *   Fix it           record the missed payment or expense on that day,
 *                    correct the float or the count and save the closing
 *                    again, or accept the difference with a note
 *
 * Saving the count again replaces the closing; the first count stays in
 * Activity History (app/api/closings). Accepting is logged too, and clears
 * the task for everyone.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { call, useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { Modal, Label, ActionButton, AmountRow, ErrorNote, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { RecordPaymentModal } from "@/components/admin/RecordPaymentModal";
import { ExpenseModal } from "@/components/admin/SalesTab";
import { Icon } from "@/components/common/Icon";
import { cashClues, dayCash } from "@/lib/cashReview";
import { manilaTime, round2 } from "@/lib/finance";
import { fmt, fmtDate } from "@/lib/utils";
import type { DailyClosing } from "@/types/finance";

const offBy = (d: number) => d === 0 ? "Balanced" : `${d > 0 ? "Over" : "Short"} by ${fmt(Math.abs(d))}`;
const offColor = (d: number) => d === 0 ? "#2e9e4e" : d > 0 ? "#d4a800" : "#d44";

export function CashCountReview({ closing: given, closedBy, onClose, onReviewed, onOpenBooking }: {
  closing: DailyClosing;
  /** Who closed the day, from the activity log. */
  closedBy?: string;
  onClose: () => void;
  /** The owner accepted the difference: the task can go. */
  onReviewed: () => void;
  onOpenBooking?: (id: string) => void;
}) {
  const { C, soft, cBr, inp } = useAdminStyle();
  const ops = useOps();
  const { bookings } = useApp();
  const { toast } = useToast();
  // The closing as it is now: saving it again below replaces it.
  const c = ops.closings.find((x) => x.closingDate === given.closingDate) ?? given;
  const date = c.closingDate;

  /* Worked out from the ledger as it is now, so a payment recorded or
     voided since the count shows up straight away. */
  const day = dayCash(date, ops.payments, ops.expenses);
  const expected = round2(c.openingFloat + day.cashIn - day.cashOut);
  const diff = round2(c.countedCash - expected);
  const changed = expected !== c.expectedCash;
  const clues = cashClues({ date, difference: diff, openingFloat: c.openingFloat, payments: ops.payments, expenses: ops.expenses });

  const [adding, setAdding] = useState<"payment" | "expense" | null>(null);
  const [float, setFloat] = useState(String(c.openingFloat));
  const [counted, setCounted] = useState(String(c.countedCash));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "accept" | null>(null);
  const [error, setError] = useState("");

  const newFloat = Math.max(0, Number(float) || 0);
  const newCounted = Number(counted);
  const newExpected = round2(newFloat + day.cashIn - day.cashOut);
  const newDiff = counted === "" || !Number.isFinite(newCounted) ? null : round2(newCounted - newExpected);
  const edited = newFloat !== c.openingFloat || newCounted !== c.countedCash;

  const saveAgain = async (openingFloat: number, countedCash: number) => {
    setError("");
    if (!Number.isFinite(countedCash) || countedCash < 0) return setError("Enter the cash counted (0 or more).");
    setBusy("save");
    const r = await ops.closeDay({ date, openingFloat, countedCash, notes: c.notes });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    const after = round2(countedCash - round2(openingFloat + day.cashIn - day.cashOut));
    toast(after === 0 ? `${fmtDate(date)} now balances.` : `${fmtDate(date)} saved: ${offBy(after).toLowerCase()}.`, after === 0 ? "success" : "info");
    if (after === 0) onClose();
  };

  const accept = async () => {
    setError("");
    setBusy("accept");
    const r = await call("/api/activity", "POST", { action: "day.count_reviewed", date, difference: diff, note: note.trim() });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    toast(`${fmtDate(date)}: difference accepted. It's in Activity History.`, "success");
    onReviewed();
    onClose();
  };

  const h3 = { color: C.textH, fontSize: 14.5, fontWeight: 600, margin: "22px 0 10px" } as const;

  return (
    <>
      {/* Stepped aside while a payment or expense is being added, then back
          with the new figures. */}
      {adding === null && <Modal
        title={`Cash count for ${fmtDate(date)}`}
        subtitle={`Closed by ${closedBy ?? "front desk"} · ${manilaTime(c.closedAt)}`}
        onClose={onClose}
        width={760}
        footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><ActionButton onClick={onClose}>Close</ActionButton></div>}
      >
        {/* ── The count ── */}
        {changed && diff === 0 ? (
          <div role="status" style={{ border: "1px solid #2e9e4e66", background: "#2e9e4e14", borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Icon name="check-circle" size={18} style={{ color: "#2e9e4e", flexShrink: 0 }} />
            <span style={{ color: C.textB, fontSize: 13.5, flex: 1, minWidth: 200 }}>
              The records now account for all the cash counted. Save the count again so the closing says balanced.
            </span>
            <ActionButton kind="green" size="sm" disabled={busy !== null} onClick={() => void saveAgain(c.openingFloat, c.countedCash)}>
              {busy === "save" ? "Saving…" : "Update the closing"}
            </ActionButton>
          </div>
        ) : changed ? (
          <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 12px", display: "flex", gap: 6 }}>
            <Icon name="info" size={13} style={{ marginTop: 3, flexShrink: 0 }} />
            The records for this day changed after it was counted (it expected {fmt(c.expectedCash)} then). The figures below are as they are now.
          </p>
        ) : null}

        <div style={{ background: soft, borderRadius: 8, padding: "12px 16px" }}>
          <AmountRow label="Opening float (change money at the start)" value={fmt(c.openingFloat)} />
          <AmountRow label={`Cash taken in (${day.payments} ${day.payments === 1 ? "entry" : "entries"})`} value={`+ ${fmt(day.cashIn)}`} />
          <AmountRow label={`Cash paid out (${day.expenses} ${day.expenses === 1 ? "expense" : "expenses"})`} value={`− ${fmt(day.cashOut)}`} />
          <div style={{ borderTop: `1px solid ${cBr}`, margin: "6px 0" }} />
          <AmountRow label="Should be in the box" value={fmt(expected)} strong />
          <AmountRow label="Counted" value={fmt(c.countedCash)} strong />
          <AmountRow label="Difference" value={offBy(diff)} strong color={offColor(diff)} />
        </div>
        {c.notes && <p style={{ color: C.textB, fontSize: 13, margin: "10px 0 0" }}>Note when it was closed: {c.notes}</p>}

        {/* ── Every cash entry of the day ── */}
        <h3 style={h3}>Cash recorded on {fmtDate(date)}</h3>
        {day.entries.length === 0 ? (
          <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>
            No cash payment, refund or expense was recorded for this day, so the box should hold only the opening float.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, border: `1px solid ${cBr}`, borderRadius: 8 }}>
            {day.entries.map((e, i) => (
              <li key={e.key} style={{ listStyle: "none", display: "flex", gap: 12, alignItems: "baseline", padding: "8px 12px", borderTop: i ? `1px solid ${cBr}` : "none", fontSize: 13 }}>
                <span style={{ color: C.textS, width: 70, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{e.when || "—"}</span>
                <span style={{ flex: 1, minWidth: 0, color: C.textB }}>
                  <strong style={{ color: C.textH, fontWeight: 600 }}>{e.what}</strong> · {e.who}
                  {e.bookingId && (onOpenBooking
                    ? <> · <button type="button" onClick={() => onOpenBooking(e.bookingId!)} style={{ background: "none", border: "none", padding: 0, color: "#c9a84c", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>{e.bookingId}</button></>
                    : ` · ${e.bookingId}`)}
                  {e.note && <span style={{ color: C.textS }}> — {e.note}</span>}
                </span>
                <span style={{ color: e.amount < 0 ? "#d44" : C.textH, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {e.amount < 0 ? "− " : "+ "}{fmt(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Why it might be off ── */}
        {diff !== 0 && (
          <>
            <h3 style={h3}>What could explain {diff > 0 ? "the extra" : "the missing"} {fmt(Math.abs(diff))}</h3>
            <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {clues.map((k, i) => (
                <li key={i} style={{ listStyle: "none", display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.55, color: C.textB }}>
                  {k.kind === "match"
                    ? <StatusBadge color="#c9a84c" style={{ flexShrink: 0 }}>Same amount</StatusBadge>
                    : <Icon name="search" size={14} style={{ color: C.textS, marginTop: 3, flexShrink: 0 }} />}
                  <span style={{ flex: 1 }}>
                    {k.text}
                    {k.bookingId && onOpenBooking && (
                      <> <button type="button" onClick={() => onOpenBooking(k.bookingId!)} style={{ background: "none", border: "none", padding: 0, color: "#c9a84c", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>Open {k.bookingId}</button></>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── Fixing it ── */}
        <h3 style={h3}>Fix it</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <ActionButton size="sm" icon="plus" kind={diff > 0 ? "primary" : "ghost"} onClick={() => setAdding("payment")}>Record a missed cash payment</ActionButton>
          <ActionButton size="sm" icon="plus" kind={diff < 0 ? "primary" : "ghost"} onClick={() => setAdding("expense")}>Record a missed cash expense</ActionButton>
        </div>
        <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 14px" }}>Either one is dated {fmtDate(date)}, so it lands in this day&apos;s count.</p>

        <div style={{ border: `1px solid ${cBr}`, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Correct the float or the count</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label htmlFor="review-float">Opening float (₱)</Label>
              <Input id="review-float" type="number" min={0} step="0.01" value={float} onChange={(e) => setFloat(e.target.value)} style={inp} />
            </div>
            <div>
              <Label htmlFor="review-counted">Cash counted (₱)</Label>
              <Input id="review-counted" type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ fontSize: 13, color: C.textS }}>
              Then it should be {fmt(newExpected)}:{" "}
              <strong style={{ color: newDiff === null ? C.textS : offColor(newDiff) }}>{newDiff === null ? "—" : offBy(newDiff).toLowerCase()}</strong>
            </span>
            <ActionButton size="sm" kind="primary" disabled={busy !== null || !edited || newDiff === null} onClick={() => void saveAgain(newFloat, newCounted)}>
              {busy === "save" ? "Saving…" : "Save the count again"}
            </ActionButton>
          </div>
          <p style={{ color: C.textS, fontSize: 12, margin: "8px 0 0" }}>The first count stays in Activity History.</p>
        </div>

        {diff !== 0 && (
          <div style={{ border: `1px solid ${cBr}`, borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Can&apos;t find it?</div>
            <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 8px" }}>
              Accept the {offBy(diff).toLowerCase()} as it stands. This clears the task, and your note is kept in Activity History.
            </p>
            <Label htmlFor="review-note">Note (optional)</Label>
            <Textarea id="review-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, width: "100%" }}
              placeholder={diff > 0 ? "e.g. Tip left by a guest, kept in the box." : "e.g. Wrong change given; talked to front desk."} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <ActionButton size="sm" disabled={busy !== null} onClick={() => void accept()}>
                {busy === "accept" ? "Saving…" : "Accept the difference"}
              </ActionButton>
            </div>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </Modal>}

      {adding === "payment" && (
        <RecordPaymentModal bookings={bookings} receivedOn={date} onClose={() => setAdding(null)} />
      )}
      {adding === "expense" && <ExpenseModal initialDate={date} onClose={() => setAdding(null)} />}
    </>
  );
}
