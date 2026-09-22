"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import type { Booking } from "@/types/booking";
import { Panel, StatCard, BarChart, ProgressRow } from "@/components/admin/charts";

interface AnalyticsTabProps {
  bookings: Booking[];
}

export function AnalyticsTab({ bookings }: AnalyticsTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const gBM = months.map((_, mi) => { const m = String(mi + 1).padStart(2, "0"); return bookings.filter((b) => b.date && b.date.startsWith(`2026-${m}`) && b.status !== "Cancelled").reduce((s, b) => s + b.guests, 0); });
  const bBM = months.map((_, mi) => { const m = String(mi + 1).padStart(2, "0"); return bookings.filter((b) => b.date && b.date.startsWith(`2026-${m}`) && b.status !== "Cancelled").length; });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 2.5, marginBottom: 8 }}>INSIGHTS</p>
        <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 24 : 30, fontWeight: 400, margin: 0 }}>Analytics</h2>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: mob ? 10 : 14, marginBottom: 18 }}>
        <StatCard
          icon="users"
          label="Total Guests"
          value={bookings.filter((b) => b.status !== "Cancelled").reduce((s, b) => s + b.guests, 0)}
          color="#4caf50"
          series={gBM}
          mob={mob}
        />
        <StatCard
          icon="clipboard"
          label="Total Bookings"
          value={bookings.length}
          color={gold}
          series={bBM}
          mob={mob}
        />
      </div>

      {/* Monthly Guest Chart */}
      <Panel title="MONTHLY GUEST LOG (2026)" style={{ marginBottom: 18 }}>
        <BarChart
          data={months.map((label, i) => ({ label, value: gBM[i] }))}
          color={gold}
          height={200}
          mob={mob}
        />
      </Panel>

      {/* Monthly Bookings Chart */}
      <Panel title="MONTHLY BOOKINGS (2026)" style={{ marginBottom: 18 }}>
        <BarChart
          data={months.map((label, i) => ({ label, value: bBM[i] }))}
          color="#4caf50"
          height={180}
          mob={mob}
        />
      </Panel>

      {/* Package Breakdown */}
      <Panel title="PACKAGE BREAKDOWN">
        {["Day Tour", "Day Tour + Room", "Night Tour", "Night Tour + Room"].map((p) => {
          const n = bookings.filter((b) => b.package === p).length;
          const pct = bookings.length ? Math.round((n / bookings.length) * 100) : 0;
          return <ProgressRow key={p} label={p} value={n} pct={pct} color={gold} />;
        })}
      </Panel>
    </div>
  );
}
