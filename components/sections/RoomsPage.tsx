"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { Room } from "@/types/room";
import { useState } from "react";
import { srcSetFor, SIZES } from "@/lib/img";
import { Icon } from "@/components/common/Icon";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface RoomsPageProps {
  setPage: (p: string) => void;
  rooms: Room[];
  onAddToBooking: (id: number) => void;
}

export function RoomsPage({ rooms, onAddToBooking }: RoomsPageProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  const [activeRoom, setActiveRoom] = useState<Room | null>(null);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "52px 20px" : "88px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        {/* HEADER — one reveal for the trio so they rise together
            rather than staggering into each other. */}
        <Reveal>
        <p style={{ color: gold, letterSpacing: 4, fontSize: 12.5, textAlign: "center" }}>
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

        <p style={{ color: C.textS, textAlign: "center", marginBottom: 48, fontSize: 14.5 }}>
          Rooms are rented separately from the pool.
        </p>
        </Reveal>

        {/* GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : tab ? "1fr 1fr" : "repeat(3,1fr)",
          gap: 28,
        }}>
          {rooms.map((r) => (
            <Reveal
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
                // See PackagesPage: column layout so the button can sit at the
                // bottom of every card regardless of description length.
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* IMAGE */}
              <div style={{ position: "relative", overflow: "hidden" }}>
                <img
                  loading="lazy" decoding="async"
                  src={r.img}
                  srcSet={srcSetFor(r.img)}
                  sizes={SIZES.card}
                  alt={r.name}
                  style={{
                    width: "100%",
                    height: 220,
                    objectFit: "cover",
                    // transition now lives on .room-img in globals.css, so the
                    // Packages cards get the same easing from the same place.
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
                    fontSize: 12.5,
                    background: "rgba(0,0,0,0.4)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    color: "#fff",
                  }}>
                    <Icon name="users" size={13} style={{ marginRight: 5 }} />{r.capacity} guests
                  </span>

                  <span style={{
                    color: "#fff",
                    fontWeight: 700,
                    fontFamily: "'Cormorant Garamond',Georgia,serif",
                  }}>
                    {fmt(r.price)}
                  </span>
                </div>
              </div>

              {/* CONTENT */}
              <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ color: C.textH, fontSize: 18 }}>{r.name}</h3>
                <p style={{ color: gold, fontSize: 13.5 }}><Icon name="bed" size={13} style={{ marginRight: 5 }} />{r.beds}</p>
                <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 16 }}>
                  {r.desc}
                </p>

                {/* BUTTON */}
                <button
                  className="sw-btn"
                  onClick={(e) => {
                    e.stopPropagation(); //  prevents modal opening
                    onAddToBooking(r.id);
                  }}
                  style={{
                    ...outBtn,
                    width: "100%",
                    padding: "11px",
                    borderRadius: 8,
                    marginTop: "auto",
                  }}
                >
                  ADD TO BOOKING
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* MODAL — landscape, matching the package modals: the photo holds one
          column and the room's details hold the other. Radix supplies the
          portal, focus trap, Escape and a close button, none of which the
          hand-rolled overlay had. */}
      <Dialog open={!!activeRoom} onOpenChange={(open) => { if (!open) setActiveRoom(null); }}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[min(52rem,calc(100%-2rem))]">
          {activeRoom && (
            <div className="grid max-h-[92vh] md:grid-cols-2">
              <div className="relative flex flex-col overflow-hidden bg-black/20">
                <img
                  loading="lazy" decoding="async"
                  src={activeRoom.img}
                  srcSet={srcSetFor(activeRoom.img)}
                  sizes={SIZES.modal}
                  alt={activeRoom.name}
                  style={{ width: "100%", flex: 1, minHeight: mob ? 200 : 260, objectFit: "cover" }}
                />
              </div>

              <div className="overflow-y-auto max-h-[92vh]" style={{ padding: 24, background: "rgba(18,16,10,0.95)" }}>
                <DialogTitle asChild>
                  <h2 style={{
                    fontFamily: "'Cormorant Garamond',Georgia,serif",
                    fontSize: 26,
                    color: "#fff",
                    marginBottom: 6,
                    fontWeight: 400
                  }}>
                    {activeRoom.name}
                  </h2>
                </DialogTitle>

                <p style={{ color: gold, fontSize: 14.5, marginBottom: 10 }}>
                  <Icon name="bed" size={13} style={{ marginRight: 5 }} />{activeRoom.beds}
                </p>

                <DialogDescription asChild>
                  <p style={{ color: "#ccc", fontSize: 15, lineHeight: 1.7 }}>
                    {activeRoom.desc}
                  </p>
                </DialogDescription>

                <Button
                  className="sw-btn"
                  onClick={() => onAddToBooking(activeRoom.id)}
                  style={{
                    ...outBtn,
                    width: "100%",
                    marginTop: 20,
                    padding: "13px",
                    height: "auto",
                    borderRadius: 8,
                  }}
                >
                  ADD TO BOOKING
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* STYLES */}
      <style jsx>{`
        .lux-room-card:hover .room-img {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
