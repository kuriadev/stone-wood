"use client";

/* Tomorrow's arrivals, with a reminder for each — on the Dashboard.
 *
 * The resort doesn't send text messages; everything goes by email. Each
 * arrival has an Email button to write to the guest, and the day-before
 * reminder email goes out by itself: opening the
 * Dashboard runs /api/reminders once a day, and that route emails each
 * booking once. The row says when it did.
 */

import { useEffect, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useStaff } from "@/contexts/StaffContext";
import { ActionButton, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { EmailGuestModal } from "@/components/admin/EmailGuestModal";
import { bookingMoney, manilaDate } from "@/lib/finance";
import { fmt, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { FoldHeader, useFold } from "@/components/admin/FoldHeader";
import type { Booking } from "@/types/booking";

export function TomorrowPanel({ bookings }: { bookings: Booking[] }) {
  const { C, cBr, cBg } = useAdminStyle();
  const ops = useOps();
  const staff = useStaff();
  // Write to a guest by email (the day-before reminder itself goes out
  // automatically; texts are not sent any more).
  const [emailing, setEmailing] = useState<Booking | null>(null);
  const [shown, toggleShown] = useFold("tomorrow");
  const today = manilaDate();
  const tomorrow = manilaDate(new Date(Date.now() + 86_400_000));

  // The day-before emails: once per browser per day is plenty — the route
  // itself sends each booking's email only once, whoever calls it.
  useEffect(() => {
    if (!staff.can("bookings.edit")) return;
    const key = `sw-reminders-${today}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode: run anyway, the route is idempotent */ }
    void fetch("/api/reminders", { method: "POST" }).then(() => ops.refresh()).catch(() => {});
    // Data retention's daily run (Rates & Settings): the server does
    // nothing unless the owner switched it on, and only once a day.
    void fetch("/api/retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto" }) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const arriving = bookings
    .filter((b) => b.date === tomorrow && (b.status === "Confirmed" || b.status === "Pending") && !b.archived && !b.id.startsWith("TMP-"))
    .sort((a, b) => (a.arrivalTime ?? "99").localeCompare(b.arrivalTime ?? "99"));
  if (arriving.length === 0) return null;


  return (
    <section aria-labelledby="tomorrow" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, padding: shown ? "16px 20px 8px" : "16px 20px", marginBottom: 20 }}>
      <FoldHeader id="tomorrow" icon="calendar-clock" iconColor="#3e8ed0" open={shown} onToggle={toggleShown}
        title={<>Tomorrow&apos;s arrivals ({arriving.length})</>} />
      {shown && (<div id="tomorrow-body">
      <p style={{ color: C.textS, fontSize: 12.5, margin: "6px 0 10px" }}>
        Guests with an email get a reminder by themselves. Send a text too — most guests read those first.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {arriving.map((b) => {
          const s = SLOTS[getBookingSlot(b)];
          const m = bookingMoney(b, ops.payments, ops.damages);
          return (
            <li key={b.id} style={{ borderTop: `1px solid ${cBr}`, padding: "12px 0" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ color: C.textH, fontWeight: 600 }}>{b.name} <span style={{ color: C.textS, fontWeight: 400, fontSize: 12.5 }}>· {b.id}</span></div>
                  <div style={{ color: C.textS, fontSize: 12.5 }}>
                    {s.label} {s.hours} · {b.guests} guest{b.guests === 1 ? "" : "s"}{m.balance > 0 ? ` · ${fmt(m.balance)} due on arrival` : " · paid"}
                  </div>
                </div>
                {b.status === "Pending" && <StatusBadge color="#f5a524">Not confirmed</StatusBadge>}
                {b.remindedAt ? <StatusBadge color="#2e9e4e">Emailed</StatusBadge> : b.email ? null : <StatusBadge color="#888">No email</StatusBadge>}
                <ActionButton size="sm" icon="mail" onClick={() => setEmailing(b)}>Email</ActionButton>
              </div>
            </li>
          );
        })}
      </ul>
      </div>)}
      {emailing && <EmailGuestModal booking={emailing} onClose={() => setEmailing(null)} />}
    </section>
  );
}
