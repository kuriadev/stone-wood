"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { Stars } from "@/components/common/Stars";
import type { Booking } from "@/types/booking";
import type { Review } from "@/types/review";

interface AnalyticsTabProps {
  bookings: Booking[];
  reviews: Review[];
}

export function AnalyticsTab({ bookings, reviews }: AnalyticsTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const gBM = months.map((_, mi) => { const m = String(mi + 1).padStart(2, "0"); return bookings.filter((b) => b.date && b.date.startsWith(`2026-${m}`) && b.status !== "Cancelled").reduce((s, b) => s + b.guests, 0); });
  const bBM = months.map((_, mi) => { const m = String(mi + 1).padStart(2, "0"); return bookings.filter((b) => b.date && b.date.startsWith(`2026-${m}`) && b.status !== "Cancelled").length; });
  const maxG = Math.max(...gBM, 1);
  const maxB = Math.max(...bBM, 1);
  const rDist = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));
  const cBg = isDark ? "#0b0a08" : "#ffffff";
  const cBr = isDark ? "#1e1a14" : "#e4ddd1";

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>INSIGHTS</p>
        <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Analytics</h2>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 14, marginBottom: 32 }}>
        {[["Total Guests", bookings.filter((b) => b.status !== "Cancelled").reduce((s, b) => s + b.guests, 0), "👥", "#4caf50"], ["Total Bookings", bookings.length, "📋", gold], ["Reviews", reviews.length, "💬", "#4a9fd4"]].map(([l, v, icon, c]) => (
          <div key={l as string} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "20px 16px", position: "relative", overflow: "hidden", boxShadow: C.shadowCard }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${c}22,${c})` }} />
            <div style={{ fontSize: 20, marginBottom: 8 }}>{icon as string}</div>
            <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>{(l as string).toUpperCase()}</div>
            <div style={{ color: c as string, fontSize: 28, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>{String(v)}</div>
          </div>
        ))}
      </div>

      {/* Monthly Guest Chart */}
      <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "24px 20px", marginBottom: 24, boxShadow: C.shadowCard }}>
        <h3 style={{ color: C.textS, fontSize: 10, letterSpacing: 2, marginBottom: 20 }}>MONTHLY GUEST LOG (2026)</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: mob ? 4 : 8, height: 140, paddingBottom: 28, position: "relative" }}>
          {gBM.map((v, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ color: v > 0 ? gold : C.textXS, fontSize: mob ? 8 : 10, fontWeight: 700 }}>{v > 0 ? v : ""}</span>
              <div style={{ width: "100%", background: v > 0 ? (isDark ? "#1a1400" : "#fef6d8") : isDark ? "#100e0b" : "#f0ece4", border: `1px solid ${v > 0 ? gold + "66" : cBr}`, borderRadius: "3px 3px 0 0", height: `${(v / maxG) * 110}px`, minHeight: v > 0 ? 4 : 0, transition: "height .4s cubic-bezier(.22,1,.36,1)" }} />
              <span style={{ color: C.textXS, fontSize: mob ? 7 : 9, position: "absolute", bottom: 0 }}>{months[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Bookings Chart */}
      <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "24px 20px", marginBottom: 24, boxShadow: C.shadowCard }}>
        <h3 style={{ color: C.textS, fontSize: 10, letterSpacing: 2, marginBottom: 20 }}>MONTHLY BOOKINGS (2026)</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: mob ? 4 : 8, height: 120, paddingBottom: 28, position: "relative" }}>
          {bBM.map((v, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ color: v > 0 ? "#4caf50" : C.textXS, fontSize: mob ? 8 : 10, fontWeight: 700 }}>{v > 0 ? v : ""}</span>
              <div style={{ width: "100%", background: v > 0 ? (isDark ? "#0d2416" : "#e8f8ee") : isDark ? "#100e0b" : "#f0ece4", border: `1px solid ${v > 0 ? "#4caf5066" : cBr}`, borderRadius: "3px 3px 0 0", height: `${(v / maxB) * 90}px`, minHeight: v > 0 ? 4 : 0, transition: "height .4s cubic-bezier(.22,1,.36,1)" }} />
              <span style={{ color: C.textXS, fontSize: mob ? 7 : 9, position: "absolute", bottom: 0 }}>{months[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Package Breakdown */}
        <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "24px 20px", boxShadow: C.shadowCard }}>
          <h3 style={{ color: C.textS, fontSize: 10, letterSpacing: 2, marginBottom: 20 }}>PACKAGE BREAKDOWN</h3>
          {["Day Tour", "Day Tour + Room"].map((p) => {
            const n = bookings.filter((b) => b.package === p).length;
            const pct = bookings.length ? Math.round((n / bookings.length) * 100) : 0;
            return (
              <div key={p} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: C.textB, fontSize: 12 }}>{p}</span><span style={{ color: gold, fontWeight: 700, fontSize: 12 }}>{n} <span style={{ color: C.textXS }}>({pct}%)</span></span></div>
                <div style={{ background: isDark ? "#1a1714" : "#ede8de", borderRadius: 4, height: 6, overflow: "hidden" }}><div style={{ width: `${pct}%`, background: `linear-gradient(to right,#b8902a,${gold})`, height: "100%", borderRadius: 4, transition: "width .6s cubic-bezier(.22,1,.36,1)" }} /></div>
              </div>
            );
          })}
        </div>
      </div>
  );
}
