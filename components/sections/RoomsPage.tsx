"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { Room } from "@/types/room";

interface RoomsPageProps {
  setPage: (p: string) => void;
  rooms: Room[];
  onAddToBooking: (id: number) => void;
}

export function RoomsPage({ setPage, rooms, onAddToBooking }: RoomsPageProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "52px 20px" : "88px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10, textAlign: "center" }}>ACCOMMODATIONS</p>
        <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 28 : 46, color: C.textH, textAlign: "center", marginBottom: 10 }}>Rooms & Sleeping Quarters</h2>
        <p style={{ color: C.textS, textAlign: "center", marginBottom: 48, fontSize: 13 }}>Rooms are rented separately from the pool.</p>
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : tab ? "1fr 1fr" : "repeat(3,1fr)", gap: 28 }}>
          {rooms.map((r) => (
            <div key={r.id} className="sw-room-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: C.shadowCard }}>
              <div style={{ overflow: "hidden", position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.img} alt={r.name} className="sw-img" style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.35),transparent 60%)" }} />
                <div style={{ position: "absolute", bottom: 12, left: 14, right: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: "3px 8px", backdropFilter: "blur(4px)" }}>👥 Up to {r.capacity} guests</span>
                  <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{fmt(r.price)}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>/night</span></span>
                </div>
              </div>
              <div style={{ padding: "20px 22px 22px" }}>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, marginBottom: 5, fontWeight: 400 }}>{r.name}</h3>
                <p style={{ color: gold, fontSize: 12, marginBottom: 8 }}>🛏 {r.beds}</p>
                <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>{r.desc}</p>
                <button className="sw-btn" onClick={() => onAddToBooking(r.id)} style={{ ...outBtn, width: "100%", padding: "11px", borderRadius: 6, letterSpacing: 1.5 }}>
                  ADD TO BOOKING
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
