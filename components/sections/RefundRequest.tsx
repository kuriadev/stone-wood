"use client";

/* The refund request page.
 *
 * Deliberately NOT an option on the public Customer Service form. A refund is
 * only possible when the RESORT cancelled a booking — a guest who cancels is
 * never refunded — so offering "Refund" alongside Question and Feedback would
 * invite requests the resort cannot grant and then have to turn down.
 *
 * Instead this page is reached from the cancellation email and from the
 * guest's own booking page, which is to say: only by someone the resort
 * actually cancelled on. It is unlisted in the nav for the same reason.
 *
 * It posts to the same /api/customer-service inbox as every other message,
 * with type "Refund", so the owner reads and answers it in one place and the
 * money is arranged by hand. Nothing here moves any.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { SPACE } from "@/lib/spacing";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isValidPHNumber, sanitizeContact } from "@/lib/validators";

const serif = "'Satoshi',system-ui,sans-serif";

export function RefundRequest({ setPage }: { setPage: (p: string) => void }) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const { toast } = useToast();
  const params = useSearchParams();

  // Prefilled when the guest arrives from their cancelled booking.
  const refFromUrl = (params.get("booking") ?? "").toUpperCase().match(/\bSW-\d{4,}\b/)?.[0] ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState(refFromUrl);
  /* Where the money goes. Refunds are sent by GCash, so without this the
     owner has to chase the guest for it before they can pay anything back. */
  const [gcash, setGcash] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const gcashOk = isValidPHNumber(gcash);
  const ready = name.trim().length >= 2 && /@/.test(email) && reference.trim().length >= 4 && gcashOk;

  const send = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/customer-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          type: "Refund",
          // The reference leads, so the owner can find the booking without
          // reading the whole message.
          // GCash details lead the message so the owner can pay without
          // reading to the end or writing back to ask.
          message:
            `[Refund request — booking ${reference.trim().toUpperCase()}] ` +
            `GCash ${gcash} (${name.trim()}). ` +
            (message.trim() || "The resort cancelled this booking and I would like to request a refund of what I paid."),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Could not send your request. Please try again.");
        return;
      }
      setSent(true);
      toast("Refund request sent.", "success");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const card: React.CSSProperties = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: mob ? SPACE.lg : SPACE.xl,
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "52px 20px" : "88px 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p style={{ color: C.goldInk, letterSpacing: 4, fontSize: 12.5, textAlign: "center", margin: 0 }}>SUPPORT</p>
        <h1 style={{ fontFamily: serif, fontSize: mob ? 28 : 42, color: C.textH, textAlign: "center", margin: "12px 0" , fontWeight: 400 }}>
          Request a refund
        </h1>
        <p style={{ color: C.textS, textAlign: "center", fontSize: 14.5, margin: `0 0 ${SPACE.xxl}px`, lineHeight: 1.7 }}>
          Refunds are available when <strong style={{ color: C.textH }}>the resort cancelled your booking</strong>.
          Send the details below and our team will arrange it with you.
        </p>

        {sent ? (
          <div style={{ ...card, textAlign: "center" }}>
            <Icon name="check-circle" size={32} style={{ color: "#6ec071" }} />
            <h2 style={{ color: C.textH, fontFamily: serif, fontSize: 24, fontWeight: 400, margin: "12px 0 8px" }}>Request sent</h2>
            <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.7, margin: `0 0 ${SPACE.lg}px` }}>
              Our team will reply to <strong style={{ color: C.textH }}>{email.trim()}</strong>. Please allow one business day.
            </p>
            <button className="sw-btn" type="button" onClick={() => setPage("Home")} style={{ ...goldBtn }}>BACK TO HOME</button>
          </div>
        ) : (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: SPACE.md }}>
            {/* The one rule that decides whether this request can succeed. */}
            <div style={{ border: `1px solid ${gold}55`, background: `${gold}0f`, borderRadius: 10, padding: SPACE.md, display: "flex", gap: SPACE.sm, alignItems: "flex-start" }}>
              <Icon name="info" size={15} strokeWidth={1.5} style={{ color: C.goldInk, marginTop: 3, flexShrink: 0 }} />
              <div style={{ color: C.textB, fontSize: 13, lineHeight: 1.65 }}>
                If <strong style={{ color: C.textH }}>you</strong> cancelled the booking, payments are not refunded — but you can
                move your booking to another date once from your booking page.
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">BOOKING REFERENCE</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SW-10133" style={C.inp} />
            </div>
            <div>
              <Label className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">FULL NAME</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" style={C.inp} />
            </div>
            <div>
              <Label className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">EMAIL ADDRESS</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="yourname@gmail.com" style={C.inp} inputMode="email" />
            </div>
            <div>
              <Label className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">GCASH NUMBER</Label>
              <Input
                value={gcash}
                onChange={(e) => setGcash(sanitizeContact(e.target.value))}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                style={C.inp}
                aria-invalid={gcash.length > 0 && !gcashOk}
              />
              <p style={{ color: gcash.length > 0 && !gcashOk ? "#e07a7a" : C.textXS, fontSize: 12, margin: "6px 0 0", lineHeight: 1.6 }}>
                {gcash.length > 0 && !gcashOk
                  ? "Enter an 11-digit mobile number starting 09."
                  : "We send refunds by GCash. Please make sure this number is registered to the name above."}
              </p>
            </div>
            <div>
              <Label className="mb-2 block text-[11.5px] tracking-[2px] text-accent-ink">ANYTHING ELSE WE SHOULD KNOW? (OPTIONAL)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Anything else that helps us send it back." style={C.inp} />
            </div>

            {error && <p role="alert" style={{ color: "#e07a7a", fontSize: 13, margin: 0 }}>{error}</p>}

            <button
              className="sw-btn"
              type="button"
              disabled={!ready || busy}
              onClick={() => void send()}
              style={{ ...goldBtn, width: "100%", opacity: !ready || busy ? 0.45 : 1, cursor: !ready ? "not-allowed" : busy ? "wait" : "pointer" }}
            >
              {busy ? "SENDING…" : "SEND REFUND REQUEST"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
