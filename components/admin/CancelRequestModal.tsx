"use client";

/* ── View a cancellation request
 *
 * Opened from "Do these first" on the Dashboard and from My Tasks: who sent
 * it, their booking, how to reach them, why they need to cancel and their
 * proof, with Approve and Decline (EmergencyReview). The same request is in
 * Guest Messages too.
 */

import { Modal, useAdminStyle } from "@/components/admin/ui";
import { EmergencyReview } from "@/components/admin/EmergencyReview";
import { Icon, type IconName } from "@/components/common/Icon";
import { useApp } from "@/contexts/AppContext";
import { fmt, fmtDate, bookingSlotInfo, getBookingTier, getBookingResource } from "@/lib/utils";
import { headcountLabel } from "@/lib/children";
import { tierLabel } from "@/lib/labels";
import type { CustomerMessage } from "@/types/admin";

/** The guest's own words: the message without its "Cancellation request
 *  for NT-1 (date):" first line. */
export const requestReason = (m: Pick<CustomerMessage, "message">) =>
  m.message.replace(/^(Cancellation|Emergency) request for [^\n]*:\s*/i, "").trim();

export function CancelRequestModal({ message, onClose, onOpenBooking }: {
  message: CustomerMessage;
  onClose: () => void;
  onOpenBooking?: (id: string) => void;
}) {
  const { C, soft } = useAdminStyle();
  const { bookings, customerMessages, setCustomerMessages } = useApp();
  // The live copy, so the window shows the decision as soon as it is made.
  const m = customerMessages.find((x) => x.id === message.id) ?? message;
  const b = bookings.find((x) => x.id === m.bookingId) ?? null;
  const slot = b ? bookingSlotInfo(b) : null;

  const rows: [IconName, string, React.ReactNode][] = [
    ["user", "Guest", m.name],
    ...(b ? [
      ["calendar", "Booking", <><span style={{ fontFamily: "monospace" }}>{b.id}</span> · {fmtDate(b.date)}</>],
      ["clock", slot!.label, slot!.hours],
      ["users", "Guests", `${headcountLabel(b.guests, b.children ?? 0)} · ${b.package || "Booking"} · ${getBookingResource(b) === "Venue" ? "Events venue only" : tierLabel(getBookingTier(b))}`],
      ["cash", "Total", `${fmt(b.total)} · status ${b.status}`],
      ["phone", "Mobile", <a key="t" href={`tel:${b.contact}`} style={{ color: "inherit" }}>{b.contact}</a>],
    ] as [IconName, string, React.ReactNode][] : []),
    ["mail", "Email", <a key="m" href={`mailto:${m.email}`} style={{ color: "inherit" }}>{m.email}</a>],
  ];

  return (
    <Modal title="Cancellation request" subtitle={`${m.name}${b ? ` · ${b.id} · ${fmtDate(b.date)}` : ""}`} onClose={onClose} width={720}>
      <div style={{ display: "grid", gap: 16 }}>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {rows.map(([icon, label, value]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, alignItems: "center" }}>
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: soft, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.goldInk }}>
                <Icon name={icon} size={14} />
              </span>
              <div style={{ minWidth: 0 }}>
                <dt style={{ color: C.textS, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</dt>
                <dd style={{ margin: 0, color: C.textH, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <div>
          <p style={{ margin: "0 0 6px", color: C.textS, fontSize: 12, fontWeight: 700, letterSpacing: 1.2 }}>THEIR REASON</p>
          <p style={{ margin: 0, padding: "12px 14px", borderRadius: 10, background: soft, color: C.textH, fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{requestReason(m) || "No reason given."}</p>
        </div>

        <EmergencyReview
          message={m}
          booking={b}
          onOpenBooking={(id) => { onClose(); onOpenBooking?.(id); }}
          onDecided={(patch) => setCustomerMessages((list) => list.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))}
        />
      </div>
    </Modal>
  );
}
