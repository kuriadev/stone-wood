"use client";

/* Pay at the front desk by GCash.
 *
 * The page behind blurs; on the left the resort's own GCash QR (Admin →
 * Website Photos) and the amount, on the right the booking it pays for.
 * The guest scans it and sends the money; staff check it arrived in the
 * resort's GCash app, type the reference number from the guest's receipt
 * and press "Payment received". onPaid hands that reference back and the
 * walk-in / payment / check-out saves itself. The server checks the
 * reference hasn't been used before (lib/deskQr.server.ts). */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useHeroMedia } from "@/hooks/useHeroMedia";
import { GCASH_QR_DEFAULT } from "@/lib/heroMedia";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ActionButton, useAdminStyle } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import { fmt, fmtDate, stayLabel, bookingSlotInfo } from "@/lib/utils";
import { livePayments, manilaDate, round2 } from "@/lib/finance";
import { paymentLine } from "@/lib/labels";
import { OVERTIME_RATE } from "@/lib/validators";
import type { Payment, DamageRecord } from "@/types/finance";
import type { Room } from "@/types/room";
import { packageAvailed } from "@/lib/pricing";
import type { Booking } from "@/types/booking";
import "./QrPayModal.css";

export interface QrSummary {
  title: string;          // "Day Stay · Pool"
  lines: string[];        // ["7:00 AM – 5:00 PM · 20 guests", "Sunday, November 1, 2026"]
  guest: string;          // "Juan Dela Cruz · 0917…"
  items: { label: string; sub?: string; amount: number }[];
  total: number;
  /** Payments already made, shown under the total (an existing booking). */
  paid?: { label: string; amount: number }[];
  /** What is still owed before this payment (an existing booking). */
  balance?: number;
  dueLabel: string;       // "Due now (full)" / "Due now (half)"
  note?: string;
}

/** The right-hand summary for money collected on an existing booking
 *  (check-out, settle, record payment): the full price breakdown (the
 *  booking, overtime, each damage), what was already paid, the balance,
 *  and what is being paid now. `newDamage` is damage found at this
 *  check-out that isn't saved yet. */
export function qrSummaryForBooking(b: Booking, amount: number, ctx: {
  payments: Payment[]; damages: DamageRecord[]; rooms?: Room[];
  newDamage?: { label: string; amount: number }[];
}): QrSummary {
  const slot = bookingSlotInfo(b);
  const overtimeFee = slot.id === "Day" ? (b.overtime || 0) * OVERTIME_RATE : 0;
  const roomNames = (b.rooms ?? []).map((id) => ctx.rooms?.find((r) => r.id === id)?.name).filter(Boolean) as string[];
  const damages = ctx.damages.filter((d) => d.bookingId === b.id && !d.voided);
  const items: QrSummary["items"] = [
    {
      label: packageAvailed(b),
      sub: [`${slot.label} · ${b.guests} guest${b.guests === 1 ? "" : "s"}`, roomNames.length ? `incl. ${roomNames.join(", ")}` : ""].filter(Boolean).join(" · "),
      amount: round2(b.total - overtimeFee),
    },
    ...(overtimeFee > 0 ? [{ label: `Overtime (${b.overtime} hr)`, amount: overtimeFee }] : []),
    ...damages.map((d) => ({ label: `Damage: ${d.itemName}${d.quantity > 1 ? ` × ${d.quantity}` : ""}`, sub: d.facilityName, amount: d.amount })),
    ...(ctx.newDamage ?? []).map((d) => ({ label: `Damage: ${d.label}`, sub: "Found at check-out", amount: d.amount })),
  ];
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  const paid = livePayments(ctx.payments).filter((p) => p.bookingId === b.id && p.type !== "Refund")
    .sort((x, y) => x.receivedAt.localeCompare(y.receivedAt))
    .map((p) => ({ label: `${paymentLine(p)} · ${fmtDate(manilaDate(p.receivedAt))}`, amount: p.amount }));
  const refunded = livePayments(ctx.payments).filter((p) => p.bookingId === b.id && p.type === "Refund").reduce((s, p) => s + p.amount, 0);
  const balance = round2(total - paid.reduce((s, p) => s + p.amount, 0) + refunded);
  return {
    title: packageAvailed(b),
    lines: [`${stayLabel(b)} · ${b.guests} guest${b.guests === 1 ? "" : "s"}`],
    guest: [b.name, b.contact].filter(Boolean).join(" · "),
    items, total, paid, balance,
    dueLabel: amount < balance ? "Paying now (part of the balance)" : "Due now",
  };
}

/** Shown when GCash is picked: the next window shows the resort's QR. */
export function GcashHint({ amount, text }: { amount: number; text: string }) {
  const { C } = useAdminStyle();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(62,142,208,0.35)", background: "rgba(62,142,208,0.08)" }}>
      <Icon name="cash" size={16} style={{ color: "#3e8ed0", flexShrink: 0 }} />
      <span style={{ flex: 1, color: C.textB, fontSize: 12.5, lineHeight: 1.45 }}>{text.replace("{amount}", fmt(amount))}</span>
    </div>
  );
}

export function QrPayModal({ amount, summary, onPaid, onCancel }: {
  amount: number;
  /** What it pays for, kept for the caller's records. */
  description?: string;
  summary: QrSummary;
  /** The GCash reference number staff typed. */
  onPaid: (reference: string) => void;
  onCancel: () => void;
}) {
  const { C, inp } = useAdminStyle();
  const { media } = useHeroMedia(undefined, "gcash");
  const qrSrc = media?.kind === "image" ? media.src : GCASH_QR_DEFAULT;
  const [ref, setRef] = useState("");
  const [tried, setTried] = useState(false);
  const clean = ref.replace(/\s/g, "");
  const ok = /^[A-Za-z0-9-]{6,40}$/.test(clean);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent showCloseButton={false} overlayClassName="sw-qrpay__scrim" className="sw-qrpay" style={{ maxWidth: 880, width: "calc(100vw - 32px)", padding: 0 }}>
        <div className="sw-qrpay__grid">
          {/* ── The resort's GCash QR ── */}
          <section className="sw-qrpay__left">
            <div className="sw-qrpay__brand"><Icon name="cash" size={15} /> GCash</div>
            <DialogTitle className="sw-qrpay__amount">{fmt(amount)}</DialogTitle>
            <DialogDescription className="sw-qrpay__sub">Ask the guest to scan this with GCash and send exactly {fmt(amount)}. When it shows in the resort&apos;s GCash, type the reference number from their receipt.</DialogDescription>
            <div className="sw-qrpay__qr is-waiting" style={{ background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the resort's own QR, as uploaded */}
              <img src={qrSrc} alt="The resort's GCash QR code" style={{ objectFit: "contain" }} />
            </div>
            <div style={{ width: "100%", marginTop: 8 }}>
              <label htmlFor="desk-ref" style={{ display: "block", color: C.textS, fontSize: 12, marginBottom: 6 }}>GCash reference number</label>
              <Input id="desk-ref" value={ref} onChange={(e) => setRef(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={48}
                placeholder="e.g. 1012 345 678901" aria-invalid={tried && !ok} style={{ ...inp, width: "100%", fontFamily: "monospace", letterSpacing: 1 }} />
              {tried && !ok && <p style={{ color: C.dangerInk, fontSize: 12, margin: "6px 0 0" }}>Type the reference number shown on the guest&apos;s GCash receipt.</p>}
            </div>
            <div style={{ display: "grid", gap: 8, width: "100%", marginTop: 10 }}>
              <ActionButton kind="green" icon="check" onClick={() => { setTried(true); if (ok) onPaid(clean.toUpperCase()); }} style={{ width: "100%" }}>Payment received</ActionButton>
              <ActionButton kind="red" icon="x" onClick={onCancel} style={{ width: "100%" }}>Cancel</ActionButton>
            </div>
          </section>

          {/* ── What it pays for ── */}
          <section className="sw-qrpay__card">
            <p className="sw-qrpay__eyebrow">Your booking</p>
            <h3 className="sw-qrpay__title">{summary.title}</h3>
            {summary.lines.map((l) => <p key={l} className="sw-qrpay__line">{l}</p>)}
            <p className="sw-qrpay__guest"><Icon name="user" size={12} /> {summary.guest}</p>
            <hr />
            {summary.items.map((i) => (
              <div key={i.label} className="sw-qrpay__item">
                <div><b>{i.label}</b>{i.sub && <span>{i.sub}</span>}</div>
                <b>{i.amount < 0 ? `−${fmt(-i.amount)}` : fmt(i.amount)}</b>
              </div>
            ))}
            <hr />
            <div className="sw-qrpay__total"><span>Total</span><span>{fmt(summary.total)}</span></div>
            {summary.paid?.map((p) => (
              <div key={p.label} className="sw-qrpay__due"><span>{p.label}</span><span>−{fmt(p.amount)}</span></div>
            ))}
            {summary.balance !== undefined && summary.paid && summary.paid.length > 0 && (
              <div className="sw-qrpay__due"><span>Balance</span><span>{fmt(summary.balance)}</span></div>
            )}
            <div className="sw-qrpay__due sw-qrpay__due--now"><span>{summary.dueLabel}</span><b>{fmt(amount)}</b></div>
            {summary.note && <p className="sw-qrpay__note" style={{ color: C.textS }}>{summary.note}</p>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
