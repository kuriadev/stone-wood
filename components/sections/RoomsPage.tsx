"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { Room } from "@/types/room";
import { useState } from "react";

interface RoomsPageProps {
  setPage: (p: string) => void;
  rooms: Room[];
  onAddToBooking: (id: number) => void;
}

export function RoomsPage({ rooms, onAddToBooking }: RoomsPageProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  const [activeRoom, setActiveRoom] = useState<Room | null>(null);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "52px 20px" : "88px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        {/* HEADER */}
        <p style={{ color: gold, letterSpacing: 4, fontSize: 11, textAlign: "center" }}>
          ACCOMMODATIONS
        </p>

        <h2 style={{
          fontFamily: "'Cormorant Garamond',Georgia,serif",
          fontSize: mob ? 28 : 46,
          color: C.textH,
          textAlign: "center",
          marginBottom: 10,
        }}>
          Rooms & Sleeping Quarters
        </h2>

        <p style={{ color: C.textS, textAlign: "center", marginBottom: 48, fontSize: 13 }}>
          Rooms are rented separately from the pool.
        </p>

        {/* GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : tab ? "1fr 1fr" : "repeat(3,1fr)",
          gap: 28,
        }}>
          {rooms.map((r) => (
            <div
              key={r.id}
              className="lux-room-card"
              onClick={() => setActiveRoom(r)}
              style={{
                background: C.bgCard,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: C.shadowCard,
                cursor: "pointer",
                transition: "all .4s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {/* IMAGE */}
              <div style={{ position: "relative", overflow: "hidden" }}>
                <img
                  src={r.img}
                  alt={r.name}
                  style={{
                    width: "100%",
                    height: 220,
                    objectFit: "cover",
                    transition: "transform .6s ease",
                  }}
                  className="room-img"
                />

                {/* gradient */}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top,rgba(0,0,0,0.5),transparent 60%)",
                }} />

                {/* info */}
                <div style={{
                  position: "absolute",
                  bottom: 12,
                  left: 14,
                  right: 14,
                  display: "flex",
                  justifyContent: "space-between",
                }}>
                  <span style={{
                    fontSize: 11,
                    background: "rgba(0,0,0,0.4)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    color: "#fff",
                  }}>
                    👥 {r.capacity} guests
                  </span>

                  <span style={{
                    color: "#fff",
                    fontWeight: 700,
                    fontFamily: "'Cormorant Garamond'",
                  }}>
                    {fmt(r.price)}
                  </span>
                </div>
              </div>

              {/* CONTENT */}
              <div style={{ padding: 20 }}>
                <h3 style={{ color: C.textH, fontSize: 18 }}>{r.name}</h3>
                <p style={{ color: gold, fontSize: 12 }}>🛏 {r.beds}</p>
                <p style={{ color: C.textS, fontSize: 13, marginBottom: 16 }}>
                  {r.desc}
                </p>

                {/* BUTTON */}
                <button
                  className="sw-btn"
                  onClick={(e) => {
                    e.stopPropagation(); // ✅ prevents modal opening
                    onAddToBooking(r.id);
                  }}
                  style={{
                    ...outBtn,
                    width: "100%",
                    padding: "11px",
                    borderRadius: 8,
                  }}
                >
                  ADD TO BOOKING
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL */}
      {activeRoom && (
  <div
    onClick={() => setActiveRoom(null)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999,
      animation: "fadeIn .3s ease",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: mob ? "92%" : 720,
        borderRadius: 16,
        overflow: "hidden",
        background: "rgba(18,16,10,0.95)",
        border: `1px solid ${gold}`,
        boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
        animation: "scaleIn .35s ease",
      }}
    >
      <img
        src={activeRoom.img}
        alt={activeRoom.name}
        style={{ width: "100%", height: 260, objectFit: "cover" }}
      />

      <div style={{ padding: 24 }}>
        <h2 style={{
          fontFamily: "'Cormorant Garamond',Georgia,serif",
          fontSize: 26,
          color: "#fff",
          marginBottom: 6
        }}>
          {activeRoom.name}
        </h2>

        <p style={{ color: gold, fontSize: 13, marginBottom: 10 }}>
          🛏 {activeRoom.beds}
        </p>

        <p style={{ color: "#ccc", fontSize: 14, lineHeight: 1.7 }}>
          {activeRoom.desc}
        </p>

        <button
          className="sw-btn"
          onClick={() => onAddToBooking(activeRoom.id)}
          style={{
            ...outBtn,
            width: "100%",
            marginTop: 20,
            padding: "13px",
            borderRadius: 8,
          }}
        >
          ADD TO BOOKING
        </button>
      </div>
    </div>
  </div>
)}

      {/* STYLES */}
      <style jsx>{`
        .lux-room-card:hover .room-img {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
