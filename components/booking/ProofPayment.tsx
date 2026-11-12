"use client";

/* ── Pay by GCash, then upload the receipt
 *
 * The guest sends exactly the "Pay now" amount to the resort's GCash
 * (Rates & Settings), then uploads a screenshot of the receipt. Before it
 * can be sent, the picture is checked here:
 *
 *   sharp enough      a blurry photo of a screen is turned away at once
 *   a real receipt    OCR finds the reference number and the date, and the
 *                     right amount or the name (lib/receiptOcr.ts)
 *
 * Anything that fails opens a pop-up saying what's wrong and asking for a
 * clear picture. "Change picture" swaps it any time, and a last pop-up asks
 * the guest to confirm before the booking is sent. Staff still check every
 * receipt (Dashboard → Pending proof of payment). Also used on Manage
 * booking to send a new receipt after one was turned down.
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { fmt, fmtDate } from "@/lib/utils";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { RESORT_CONTACT } from "@/lib/resort";
import { checkReceipt, type ReceiptCheck } from "@/lib/receiptOcr";
import { readReceipt, warmUpReceiptReader, BLUR_LIMIT, CONFIDENCE_LIMIT, RECEIPT_TYPES } from "@/lib/receiptImage";
import { Icon } from "@/components/common/Icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHeroMedia } from "@/hooks/useHeroMedia";
import { GCASH_QR_DEFAULT } from "@/lib/heroMedia";

export interface ProofOcrResult {
  reference: string | null;
  date: string | null;
  amounts: number[];
  amountMatch: boolean;
  nameFound: boolean;
  confidence: number;
  sharpness: number;
}

type Problem = { title: string; body: string } | null;

export function ProofPayment({ due, payFull, total, guestName, mob, submitLabel = "Submit booking", busy = false, error, onSubmit, showPayDetails = true }: {
  /** The "Pay now" amount. */
  due: number;
  payFull: boolean;
  total: number;
  guestName: string;
  mob: boolean;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (proof: string, ocr: ProofOcrResult) => void | Promise<void>;
  /** The GCash number and amount panel (hidden where it's already shown). */
  showPayDetails?: boolean;
}) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [check, setCheck] = useState<(ReceiptCheck & { confidence: number; sharpness: number }) | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  // The resort's GCash QR (Admin → Website Photos), or the one it ships with.
  const { media: qrMedia } = useHeroMedia(undefined, "gcash");
  const qrSrc = qrMedia?.kind === "image" ? qrMedia.src : GCASH_QR_DEFAULT;

  // Fetch the OCR engine while the guest is in their GCash app.
  useEffect(() => { warmUpReceiptReader(); }, []);

  const pick = () => fileRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true); setCheck(null); setPhoto(null);
    try {
      const scan = await readReceipt(file);
      // Blurry or unreadable: ask for a clearer picture before anything else.
      if (scan.sharpness < BLUR_LIMIT || scan.confidence < CONFIDENCE_LIMIT) {
        setProblem({
          title: "Your receipt isn't clear",
          body: "We can't read this picture because it's blurry or too dark. Please take a screenshot of your GCash receipt (instead of a photo of the screen), or a clear, well-lit photo, and upload it again.",
        });
        return;
      }
      const r = checkReceipt(scan.text, { due, names: [RESORT_CONTACT.gcashName, "Stonewood", guestName] });
      if (!r.ok) {
        setProblem(
          r.problem === "wrong-amount"
            ? { title: "The amount doesn't match", body: `Your receipt shows ${r.amounts.map(fmt).join(" / ")}, but the amount to pay now is ${fmt(due)}. Please send exactly ${fmt(due)} and upload that receipt.` }
            : r.problem === "old-date"
              ? { title: "This receipt is too old", body: `The date on this receipt (${r.date ? fmtDate(r.date) : "unknown"}) isn't from this week. Please upload the receipt for the payment you just made.` }
              : { title: "Please check your proof of payment", body: `This doesn't look like a payment receipt: we couldn't find ${r.missing.join(", ").replace(/, ([^,]*)$/, " and $1")} on it. Please upload a clear photo or screenshot of your receipt that shows the reference number, the date and the amount or name.` },
        );
        return;
      }
      setPhoto(scan.dataUrl);
      setCheck({ ...r, confidence: scan.confidence, sharpness: scan.sharpness });
    } catch (err) {
      setProblem({ title: "We couldn't read that file", body: err instanceof Error ? err.message : "Please try another picture." });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(RESORT_CONTACT.gcashNumber.replace(/\s/g, "")); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* not allowed */ }
  };

  const ocr = (): ProofOcrResult => ({
    reference: check?.reference ?? null, date: check?.date ?? null, amounts: check?.amounts ?? [],
    amountMatch: !!check?.amountMatch, nameFound: !!check?.nameFound, confidence: check?.confidence ?? 0, sharpness: Math.round(check?.sharpness ?? 0),
  });

  const box = { border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? 16 : 20, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" } as const;
  const stepNo = (n: number) => (
    <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: `${gold}26`, color: C.goldInk, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{n}</span>
  );
  const tick = (ok: boolean, label: string, value: string) => (
    <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <Icon name={ok ? "check-circle" : "info"} size={15} style={{ color: ok ? "#2e9e4e" : C.textS, flexShrink: 0 }} />
      <span style={{ color: C.textS }}>{label}</span>
      <strong style={{ color: C.textH, marginLeft: "auto", textAlign: "right", overflowWrap: "anywhere" }}>{value}</strong>
    </li>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showPayDetails && (
        <div style={box}>
          <p style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px", color: C.textH, fontSize: 15, fontWeight: 600 }}>{stepNo(1)} Scan the QR and send the payment</p>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "minmax(0, 290px) minmax(0, 1fr)", gap: mob ? 14 : 20, alignItems: "center" }}>
          {/* The QR to scan in GCash (or any InstaPay app). On a phone the
              guest can't scan their own screen, so it can be saved and opened
              from GCash's "Upload QR". */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <a href={qrSrc} target="_blank" rel="noopener noreferrer" aria-label="Open the GCash QR code full size"
              style={{ display: "block", background: "#fff", borderRadius: 14, padding: 8, boxShadow: "0 8px 28px rgba(0,85,255,0.18)", border: "2px solid rgba(0,85,255,0.18)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the resort's own QR, shown as uploaded */}
              <img src={qrSrc} alt={`GCash QR code for ${RESORT_CONTACT.gcashName}`} width={200} height={382}
                style={{ display: "block", width: mob ? 250 : 270, maxWidth: "100%", height: "auto", borderRadius: 8 }} />
            </a>
            <a href={qrSrc} download="stonewood-gcash-qr.png" style={{ color: C.goldInk, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Icon name="download" size={14} /> Save QR to your phone
            </a>
            <span style={{ color: C.textS, fontSize: 11.5, textAlign: "center", lineHeight: 1.5 }}>On a phone: save it, then in GCash tap QR → Upload QR.</span>
          </div>
          <div style={{ minWidth: 0 }}>
          <div style={{ background: "rgba(0,169,82,0.10)", border: "1px solid rgba(0,169,82,0.35)", borderRadius: 10, padding: "12px 16px", textAlign: "center", marginBottom: 14 }}>
            <div style={{ color: "#4caf50", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>PAY NOW</div>
            <div style={{ color: C.textH, fontSize: mob ? 26 : 30, fontWeight: 700, fontFamily: "'Satoshi',system-ui,sans-serif" }}>{fmt(due)}</div>
            <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>{payFull ? "Paid in full" : `50% down payment · the other ${fmt(total - due)} is paid on arrival`}</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: C.textS, fontSize: 13 }}>GCash number</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: C.textH, fontSize: 16, fontFamily: "monospace", letterSpacing: 1 }}>{RESORT_CONTACT.gcashNumber}</strong>
                <button type="button" onClick={() => void copy()} aria-label="Copy the GCash number"
                  style={{ border: `1px solid ${C.border}`, background: "transparent", color: copied ? "#2e9e4e" : C.goldInk, borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: C.textS, fontSize: 13 }}>Account name</span>
              <strong style={{ color: C.textH, fontSize: 14 }}>{RESORT_CONTACT.gcashName}</strong>
            </div>
          </div>
          <p style={{ color: C.textS, fontSize: 12.5, margin: "12px 0 0", lineHeight: 1.6 }}>
            Scan the QR or send to the number above. Send exactly <strong style={{ color: C.textH }}>{fmt(due)}</strong>, then take a screenshot of the GCash receipt.
          </p>
          </div>
          </div>
        </div>
      )}

      <div style={box}>
        <p style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 6px", color: C.textH, fontSize: 15, fontWeight: 600 }}>{showPayDetails && stepNo(2)} Upload your proof of payment</p>
        <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 14px", lineHeight: 1.6 }}>
          A screenshot of the receipt that shows the <strong style={{ color: C.textB }}>reference number</strong>, the <strong style={{ color: C.textB }}>date</strong> and the <strong style={{ color: C.textB }}>amount</strong>. JPG, PNG or WebP, up to 10 MB.
        </p>
        <input ref={fileRef} type="file" accept={RECEIPT_TYPES.join(",")} hidden onChange={(e) => void onFile(e.target.files?.[0])} />

        {reading ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, border: `1px dashed ${C.border}` }}>
            <span aria-hidden="true" style={{ width: 20, height: 20, border: "2px solid rgba(201,168,76,0.25)", borderTopColor: gold, borderRadius: "50%", animation: "sw-spin .8s linear infinite", flexShrink: 0 }} />
            <span style={{ color: C.textB, fontSize: 13.5 }}>Reading your receipt… <span style={{ color: C.textS }}>(the first time takes a few seconds)</span></span>
          </div>
        ) : photo && check ? (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexDirection: mob ? "column" : "row" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL the guest just picked */}
            <img src={photo} alt="Your receipt" style={{ width: mob ? "100%" : 140, maxHeight: 220, objectFit: "contain", borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff" }} />
            <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
              <p style={{ margin: "0 0 8px", color: "#2e9e4e", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check-circle" size={15} /> Receipt read
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {tick(!!check.reference, "Reference no.", check.reference ?? "—")}
                {tick(!!check.date, "Date", check.date ? fmtDate(check.date) : "—")}
                {tick(check.amountMatch, "Amount", check.amountMatch ? fmt(due) : check.amounts.length ? check.amounts.map(fmt).join(" / ") : "not read")}
              </ul>
              <button type="button" onClick={pick} style={{ ...outBtn, marginTop: 12, padding: "8px 14px", fontSize: 12, color: C.goldInk }}>
                <Icon name="image" size={14} /> CHANGE PICTURE
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={pick}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "18px 16px", borderRadius: 10, border: `1.5px dashed ${gold}88`, background: `${gold}0d`, color: C.goldInk, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            <Icon name="upload" size={18} /> Choose your receipt
          </button>
        )}
      </div>

      {error && <p role="alert" style={{ color: C.dangerInk, fontSize: 13, margin: 0 }}>{error}</p>}

      <button type="button" className="sw-btn" disabled={!photo || !check || busy || reading} onClick={() => setConfirming(true)}
        style={{ ...goldBtn, width: "100%", opacity: !photo || !check || busy || reading ? 0.45 : 1, cursor: !photo || !check || busy ? "not-allowed" : "pointer" }}>
        {busy ? "SENDING…" : submitLabel.toUpperCase()}
      </button>

      {/* Something is wrong with the picture: say what, and offer another go. */}
      <Dialog open={!!problem} onOpenChange={(o) => { if (!o) setProblem(null); }}>
        <DialogContent style={{ maxWidth: 460 }}>
          <DialogHeader>
            <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(245,165,36,0.14)", color: "#f5a524", marginBottom: 4 }}>
              <Icon name="info" size={20} />
            </span>
            <DialogTitle style={{ color: C.textH }}>{problem?.title}</DialogTitle>
            <DialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>{problem?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setProblem(null)} style={{ ...outBtn, color: C.goldInk }}>OK</button>
            <button type="button" className="sw-btn" onClick={() => { setProblem(null); setTimeout(pick, 50); }} style={{ ...goldBtn }}>CHOOSE ANOTHER PICTURE</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The last look before sending. */}
      <Dialog open={confirming} onOpenChange={(o) => { if (!o && !busy) setConfirming(false); }}>
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ color: C.textH }}>Send this proof of payment?</DialogTitle>
            <DialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>
              Check it&apos;s the right receipt. We&apos;ll confirm your booking by email once we see {fmt(due)} in our GCash. Your date is held for you meanwhile.
            </DialogDescription>
          </DialogHeader>
          {photo && (
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL */}
              <img src={photo} alt="" style={{ width: 90, height: 120, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff" }} />
              <div style={{ fontSize: 13.5, lineHeight: 1.8, color: C.textB }}>
                <div>Amount: <strong style={{ color: C.textH }}>{fmt(due)}</strong></div>
                <div>Reference: <strong style={{ color: C.textH, fontFamily: "monospace" }}>{check?.reference}</strong></div>
                {check?.date && <div>Date: <strong style={{ color: C.textH }}>{fmtDate(check.date)}</strong></div>}
              </div>
            </div>
          )}
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => { setConfirming(false); setTimeout(pick, 50); }} style={{ ...outBtn, color: C.goldInk }}>CHANGE PICTURE</button>
            <button type="button" className="sw-btn" disabled={busy}
              onClick={async () => { if (!photo) return; await onSubmit(photo, ocr()); setConfirming(false); }}
              style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "SENDING…" : "YES, SEND IT"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
