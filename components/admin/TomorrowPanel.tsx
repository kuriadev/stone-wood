"use client";

/* Tomorrow's arrivals, with a reminder for each — on the Dashboard.
 *
 * Most guests here read texts, not email, so each arrival gets a one-tap
 * "Text reminder" from the owner's own phone (the same TextGuest every
 * other notice uses). The day-before email goes out by itself: opening the
 * Dashboard runs /api/reminders once a day, and that route emails each
 * booking once. The row says when it did.
 */

import { useEffect, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useStaff } from "@/contexts/StaffContext";
import { ActionButton, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { TextGuest } from "@/components/admin/TextGuest";
import { notices } from "@/lib/notices";
import { bookingMoney, manilaDate } from "@/lib/finance";
import { fmt, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { FoldHeader, useFold } from "@/components/admin/FoldHeader";
import type { Booking } from "@/types/booking";

export function TomorrowPanel({ bookings }: { bookings: Booking[] }) {
  const { C, cBr, cBg } = useAdminStyle();
  const ops = useOps();
  const staff = useStaff();
  const [openId, setOpenId] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const arriving = bookings
    .filter((b) => b.date === tomorrow && (b.status === "Confirmed" || b.status === "Pending") && !b.archived && !b.id.startsWith("TMP-"))
    .sort((a, b) => (a.arrivalTime ?? "99").localeCompare(b.arrivalTime ?? "99"));
  if (arriving.length === 0) return null;

  const open = async (b: Booking) => {
    if (openId === b.id) { setOpenId(null); return; }
    setOpenId(b.id);
    setLink(null);
    setLink(await ops.guestLink(b.id));
  };

  return (
    <section aria-labelledby="tomorrow" style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, padding: shown ? "16px 20px 8px" : "16px 20px", marginBottom: 24 }}>
      <FoldHeader id="tomorrow" icon="calendar-clock" iconColor="#3a8fc4" open={shown} onToggle={toggleShown}
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
                {b.status === "Pending" && <StatusBadge color="#e0a020">Not confirmed</StatusBadge>}
                {b.remindedAt ? <StatusBadge color="#2e9e4e">Emailed</StatusBadge> : b.email ? null : <StatusBadge color="#888">No email</StatusBadge>}
                <ActionButton size="sm" icon="message" onClick={() => void open(b)}>{openId === b.id ? "Close" : "Text reminder"}</ActionButton>
              </div>
              {openId === b.id && (
                <div style={{ marginTop: 10 }}>
                  {link
                    ? <TextGuest booking={b} message={notices.reminder(b, link, Math.max(0, m.balance)).sms} about="the reminder for tomorrow" />
                    : <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>Preparing the message…</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </div>)}
    </section>
  );
}
