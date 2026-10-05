"use client";

// ── "Live · updated 8s ago"
//
// The admin panel re-reads bookings, facilities and payments on its own
// (OpsContext). This says so on screen, says when it last worked, warns
// when it can't reach the server, and lets the owner refresh at once.

import { useEffect, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { Icon } from "@/components/common/Icon";
import { useAdminStyle } from "@/components/admin/ui";

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
}

export function LiveStatus() {
  const { live } = useOps();
  const { C, cBr } = useAdminStyle();

  // Re-render every few seconds so "updated 8s ago" keeps counting. A sync
  // newer than this clock reads as "just now" (ago() clamps at zero).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const color = live.failed ? "#d4a800" : live.syncedAt ? "#2e9e4e" : C.textS;
  const text = live.failed
    ? `Can't reach the server${live.syncedAt ? ` · last updated ${ago(now - live.syncedAt)}` : ""}`
    : live.syncedAt
      ? `Live · updated ${ago(now - live.syncedAt)}`
      : "Connecting…";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px 4px 12px", borderRadius: 20, border: `1px solid ${live.failed ? "#d4a80066" : cBr}`, fontSize: 12.5, color: live.failed ? "#d4a800" : C.textS, whiteSpace: "nowrap" }}>
      {live.failed
        ? <Icon name="cloud-off" size={13} />
        : <span aria-hidden className={live.syncedAt ? "motion-safe:animate-pulse" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
      {/* Announced only when it goes wrong; a ticking clock read aloud every
          few seconds would drown out everything else. */}
      <span role={live.failed ? "alert" : undefined}>{text}</span>
      <button type="button" onClick={() => void live.syncNow()} disabled={live.syncing}
        aria-label="Refresh now" title="Refresh now"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", border: "none", background: "transparent", color: C.textB, cursor: live.syncing ? "default" : "pointer" }}>
        <Icon name="refresh" size={13} className={live.syncing ? "motion-safe:animate-spin" : undefined} />
      </button>
    </div>
  );
}
