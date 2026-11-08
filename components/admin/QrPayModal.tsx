"use client";

/* Pay a walk-in by QR Ph (GCash, Maya or any QR Ph e-wallet).
 *
 * The page behind blurs; the QR sits on the left with the amount and a
 * countdown, the booking it pays for on the right. It checks every few
 * seconds; the moment PayMongo says it's paid, onPaid hands back the
 * payment id and the walk-in saves itself. "Cancel payment" voids the code
 * so a late scan can't take money. /api/payment/desk. */

import { WalletBadges } from "@/components/common/WalletBadges";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ActionButton, useAdminStyle } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import { fmt } from "@/lib/utils";
import "./QrPayModal.css";

export interface QrSummary {
  title: string;          // "Day Tour · Pool"
  lines: string[];        // ["7:00 AM – 5:00 PM · 20 guests", "Sunday, November 1, 2026"]
  guest: string;          // "Juan Dela Cruz · 0917…"
  items: { label: string; sub?: string; amount: number }[];
  total: number;
  dueLabel: string;       // "Due now (full)" / "Due now (half)"
  note?: string;
}

type Phase = "making" | "waiting" | "paid" | "expired" | "error";

export function QrPayModal({ amount, description, summary, onPaid, onCancel }: {
  amount: number;
  description: string;
  summary: QrSummary;
  onPaid: (paymentId: string) => void;
  onCancel: () => void;
}) {
  const { C } = useAdminStyle();
  const [phase, setPhase] = useState<Phase>("making");
  const [qr, setQr] = useState<{ id: string; image: string; seconds: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState("");
  const done = useRef(false);

  const make = useCallback(async () => {
    setPhase("making"); setError(""); setQr(null);
    const j = await fetch("/api/payment/desk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, description }) })
      .then((r) => r.json()).catch(() => null) as { success?: boolean; error?: string; payment?: { paymentIntentId: string; qrImageUrl: string; expiresInSeconds: number } } | null;
    if (!j?.success || !j.payment) { setError(j?.error ?? "Couldn't make a QR code."); setPhase("error"); return; }
    setQr({ id: j.payment.paymentIntentId, image: j.payment.qrImageUrl, seconds: j.payment.expiresInSeconds });
    setLeft(j.payment.expiresInSeconds);
    setPhase("waiting");
  }, [amount, description]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- makes the first code when it opens
  useEffect(() => { void make(); }, [make]);

  // The countdown, from the server's own expiry.
  useEffect(() => {
    if (phase !== "waiting") return;
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { setPhase("expired"); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Is it paid yet? Every 3 seconds while waiting.
  useEffect(() => {
    if (phase !== "waiting" || !qr) return;
    const t = setInterval(async () => {
      const j = await fetch(`/api/payment/desk?id=${encodeURIComponent(qr.id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null) as { paid?: boolean } | null;
      if (j?.paid && !done.current) {
        done.current = true;
        setPhase("paid");
        setTimeout(() => onPaid(qr.id), 900);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [phase, qr, onPaid]);

  // An expired code is voided too, so it can never be paid late.
  useEffect(() => {
    if (phase === "expired" && qr) void fetch(`/api/payment/desk?id=${encodeURIComponent(qr.id)}`, { method: "DELETE" }).catch(() => {});
  }, [phase, qr]);

  const cancel = async () => {
    if (qr && phase !== "paid") await fetch(`/api/payment/desk?id=${encodeURIComponent(qr.id)}`, { method: "DELETE" }).catch(() => {});
    onCancel();
  };

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <Dialog open onOpenChange={(o) => { if (!o && phase !== "paid") void cancel(); }}>
      <DialogContent showCloseButton={false} overlayClassName="sw-qrpay__scrim" className="sw-qrpay" style={{ maxWidth: 880, width: "calc(100vw - 32px)", padding: 0 }}>
        <div className="sw-qrpay__grid">
          {/* ── The code ── */}
          <section className="sw-qrpay__left">
            <div className="sw-qrpay__brand"><Icon name="cash" size={15} /> QR Ph</div>
            <DialogTitle className="sw-qrpay__amount">{fmt(amount)}</DialogTitle>
            <DialogDescription className="sw-qrpay__sub">Ask the guest to scan this with their app and pay. It saves by itself when the payment arrives.</DialogDescription>
            <div style={{ margin: "10px 0 4px" }}><WalletBadges muted="rgba(150,140,120,0.95)" /></div>
            <div className={`sw-qrpay__qr is-${phase}`}>
              {qr?.image && phase !== "error"
                // eslint-disable-next-line @next/next/no-img-element -- PayMongo's QR, a data URL
                ? <img src={qr.image} alt="QR Ph payment code" />
                : <span className="sw-qrpay__spin" aria-hidden="true" />}
              {phase === "paid" && <div className="sw-qrpay__overlay is-paid"><Icon name="check-circle" size={44} /><b>Paid</b><span>Saving the reservation…</span></div>}
              {phase === "expired" && <div className="sw-qrpay__overlay"><Icon name="clock" size={36} /><b>This code expired</b><ActionButton size="sm" kind="primary" icon="refresh" onClick={() => void make()}>Make a new code</ActionButton></div>}
              {phase === "error" && <div className="sw-qrpay__overlay"><Icon name="alert" size={36} /><b>No code</b><span>{error}</span><ActionButton size="sm" icon="refresh" onClick={() => void make()}>Try again</ActionButton></div>}
            </div>
            <div className="sw-qrpay__status" role="status" aria-live="polite">
              {phase === "making" && "Making the code…"}
              {phase === "waiting" && <><span className="sw-qrpay__dot" /> Waiting for payment · expires in {mm}:{ss}</>}
              {phase === "paid" && <span style={{ color: "#2e9e4e" }}>Payment received</span>}
              {phase === "expired" && "Expired — make a new code, or cancel."}
            </div>
            <ActionButton kind="red" icon="x" disabled={phase === "paid"} onClick={() => void cancel()} style={{ width: "100%" }}>Cancel payment</ActionButton>
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
            <div className="sw-qrpay__due"><span>{summary.dueLabel}</span><b>{fmt(amount)}</b></div>
            {summary.note && <p className="sw-qrpay__note" style={{ color: C.textS }}>{summary.note}</p>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
