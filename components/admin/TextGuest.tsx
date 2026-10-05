"use client";

// ── "Text the guest"
//
// Most guests here read text messages, not email. This shows the ready-made
// message and opens the owner's own messaging app with it filled in, to the
// guest's number: one tap, no SMS service, and it comes from the resort's
// known number. On a computer, where there's no messaging app, Copy puts it
// on the clipboard instead. Either way the activity log notes that the
// guest was texted.

import { useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { smsHref } from "@/lib/notices";
import type { Booking } from "@/types/booking";
import { Btn, useAdminStyle } from "@/components/admin/ui";

export function TextGuest({ booking, message, about }: {
  booking: Pick<Booking, "id" | "name" | "contact">;
  message: string;
  /** For the activity log: "the cancellation", "the new date"… */
  about: string;
}) {
  const { C, cBr, soft } = useAdminStyle();
  const ops = useOps();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      ops.noteTexted(booking.id, about);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 16px", background: soft, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ color: C.textH, fontWeight: 600, fontSize: 13.5 }}>Text {booking.name} ({booking.contact})</div>
      <p style={{ margin: 0, color: C.textB, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={smsHref(booking.contact, message)} onClick={() => ops.noteTexted(booking.id, about)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none", background: "linear-gradient(135deg,#c9a84c,#e8c56a)", color: "#1a1000" }}>
          Text the guest
        </a>
        <Btn size="sm" icon={copied ? "check" : "clipboard"} onClick={() => void copy()}>{copied ? "Copied" : "Copy message"}</Btn>
      </div>
    </div>
  );
}
