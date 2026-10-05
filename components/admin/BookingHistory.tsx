"use client";

// ── One booking's history, from the activity log
//
// Everything that happened to a reservation in order: booked, paid,
// confirmed, moved, prepared, checked in and out, settled, cancelled,
// refunded, and who did each (the owner, the guest, or the system).

import { useEffect, useState } from "react";
import type { Activity } from "@/types/finance";
import { useAdminStyle, Pill } from "@/components/admin/ui";

export const ACTOR_COLOR: Record<Activity["actor"], string> = { Admin: "#c9a84c", Guest: "#3a8fc4", System: "#8a7a66" };

export function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export function BookingHistory({ bookingId }: { bookingId: string }) {
  const { C, cBr } = useAdminStyle();
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/activity?booking=${encodeURIComponent(bookingId)}&limit=100`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.success) setRows(j.activity as Activity[]);
        else setError(j?.error ?? "Couldn't load the history.");
      })
      .catch(() => { if (live) setError("Couldn't load the history."); });
    return () => { live = false; };
  }, [bookingId]);

  return (
    <div>
      <p style={{ color: C.textH, fontWeight: 600, fontSize: 14, margin: "0 0 8px" }}>History</p>
      {error && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>{error}</p>}
      {!error && rows === null && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>Loading…</p>}
      {rows && rows.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>Nothing recorded yet. History starts from when the activity log was switched on.</p>}
      {rows && rows.length > 0 && (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {[...rows].reverse().map((a) => (
            <li key={a.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", padding: "8px 0", borderTop: `1px solid ${cBr}`, fontSize: 13 }}>
              <span style={{ color: C.textS, fontSize: 12, whiteSpace: "nowrap" }}>{fmtWhen(a.at)}</span>
              <span style={{ color: C.textB }}>
                <Pill color={ACTOR_COLOR[a.actor]} style={{ marginRight: 8, padding: "4px 8px", fontSize: 10.5 }}>{a.actor}</Pill>
                {a.summary}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
