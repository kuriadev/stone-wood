"use client";

// ── Invoice / statement of account for one booking
//
// The same itemised tally Settle shows (BookingStatement): charges, damage
// penalties, every payment, and what is left. Printing renders a plain copy
// straight under <body> (see .sw-print-only in globals.css) so the page
// behind the dialog, and the dialog's own scroll box, don't end up on paper.

import { createPortal } from "react-dom";
import { useOps } from "@/contexts/OpsContext";
import { bookingMoney, manilaDate } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import type { Booking } from "@/types/booking";
import { BookingStatement } from "@/components/admin/InspectionModals";
import { Modal, ActionButton, StatusBadge, useAdminStyle } from "@/components/admin/ui";

function Head({ b }: { b: Booking }) {
  const slot = SLOTS[getBookingSlot(b)];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
      <div>
        <div style={{ fontSize: 20, fontFamily: "'Satoshi',system-ui,sans-serif" }}>StoneWood Private Resort</div>
        <div style={{ fontSize: 12.5, opacity: 0.75 }}>Angono, Rizal · Statement of account</div>
      </div>
      <div style={{ textAlign: "right", fontSize: 13 }}>
        <div>Invoice <strong style={{ fontFamily: "monospace" }}>{b.id}</strong></div>
        <div>Issued {fmtDate(manilaDate())}</div>
      </div>
      <div style={{ flexBasis: "100%", fontSize: 13, lineHeight: 1.6 }}>
        <div><strong>{b.name}</strong> · {b.contact}{b.email ? ` · ${b.email}` : ""}</div>
        <div>{fmtDate(b.date)} · {slot.label} ({slot.hours}) · {b.guests} guests · {b.source ?? "Online"}</div>
      </div>
    </div>
  );
}

export function InvoiceModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { soft } = useAdminStyle();
  const ops = useOps();
  const m = bookingMoney(booking, ops.payments, ops.damages);

  return (
    <>
      <Modal title={`Invoice ${booking.id}`} subtitle={`${booking.name} · ${fmtDate(booking.date)}`} onClose={onClose} width={720}
        footer={<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {m.due > 0 ? <StatusBadge color="#d4a800">{fmt(m.due)} due</StatusBadge> : <StatusBadge color="#2e9e4e">Paid in full</StatusBadge>}
          <ActionButton kind="primary" icon="printer" onClick={() => window.print()}>Print invoice</ActionButton>
        </div>}>
        <Head b={booking} />
        <div style={{ background: soft, borderRadius: 10, padding: "4px 16px 12px", marginTop: 12 }}>
          <BookingStatement booking={booking} />
        </div>
      </Modal>
      {typeof document !== "undefined" && createPortal(
        <div className="sw-print-only">
          <Head b={booking} />
          <BookingStatement booking={booking} />
        </div>,
        document.body,
      )}
    </>
  );
}
