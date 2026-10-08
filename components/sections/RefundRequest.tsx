"use client";

/* The refund page: how to reach the owner, not a form.
 *
 * A refund is only possible when the RESORT cancelled a booking — a guest
 * who cancels is never refunded — and it is arranged with the owner over a
 * call or a chat, where they agree the amount and where to send it. So this
 * page lists the owner's contacts and nothing here moves any money.
 *
 * It used to be a form that posted a "Refund" message to the Customer
 * Service inbox. The page is kept, unlisted, because cancellation emails sent
 * before the change link here; a guest following one now lands on the
 * contact details instead of a broken page.
 */

import { useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { SPACE } from "@/lib/spacing";
import { Icon } from "@/components/common/Icon";
import { ResortContact } from "@/components/common/ResortContact";

const serif = "'Satoshi',system-ui,sans-serif";

export function RefundRequest({ setPage }: { setPage: (p: string) => void }) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const params = useSearchParams();

  // Present when the guest arrives from their cancelled booking.
  const reference = (params.get("booking") ?? "").toUpperCase().match(/\bSW-\d{4,}\b/)?.[0] ?? "";

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
          Ask for a refund
        </h1>
        <p style={{ color: C.textS, textAlign: "center", fontSize: 14.5, margin: `0 0 ${SPACE.xxl}px`, lineHeight: 1.7 }}>
          Refunds are available when <strong style={{ color: C.textH }}>the resort cancelled your booking</strong>.
          Call or message us and we&rsquo;ll arrange it with you directly.
        </p>

        <div style={{ ...card, display: "flex", flexDirection: "column", gap: SPACE.md }}>
          {/* The one rule that decides whether this request can succeed. */}
          <div style={{ border: `1px solid ${gold}55`, background: `${gold}0f`, borderRadius: 10, padding: SPACE.md, display: "flex", gap: SPACE.sm, alignItems: "flex-start" }}>
            <Icon name="info" size={15} strokeWidth={1.5} style={{ color: C.goldInk, marginTop: 3, flexShrink: 0 }} />
            <div style={{ color: C.textB, fontSize: 13, lineHeight: 1.65 }}>
              If <strong style={{ color: C.textH }}>you</strong> cancelled the booking, payments are not refunded — but you can
              move your booking to another date once from your booking page.
            </div>
          </div>

          <p style={{ color: C.textB, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            {reference
              ? <>Please have your booking reference <strong style={{ color: C.textH, fontFamily: "monospace" }}>{reference}</strong> ready.</>
              : <>Please have your booking reference (it starts with SW-) ready.</>}
            {" "}We send refunds by GCash, so we&rsquo;ll also ask for the number to send it to.
          </p>

          <ResortContact mailSubject={reference ? `Refund request – ${reference}` : "Refund request"} />

          <button className="sw-btn" type="button" onClick={() => setPage("Home")} style={{ ...goldBtn, alignSelf: "center", marginTop: SPACE.sm }}>
            BACK TO HOME
          </button>
        </div>
      </div>
    </div>
  );
}
