"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { Room } from "@/types/room";
import { useState } from "react";
import { srcSetFor, SIZES } from "@/lib/img";
import { roomShots } from "@/lib/gallery";
import { Icon } from "@/components/common/Icon";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/button";
import { MediaGallery } from "@/components/common/MediaGallery";
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
        <p style={{ color: C.goldInk, letterSpacing: 4, fontSize: 12.5, textAlign: "center" }}>
          ACCOMMODATIONS
        </p>

        <h2 style={{
          fontFamily: "'Satoshi',system-ui,sans-serif",
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
                    fontFamily: "'Satoshi',system-ui,sans-serif",
                  }}>
                    {fmt(r.price)}
                  </span>
                </div>
              </div>

              {/* CONTENT */}
              <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ color: C.textH, fontSize: 18 }}>{r.name}</h3>
                <p style={{ color: C.goldInk, fontSize: 13.5 }}><Icon name="bed" size={13} style={{ marginRight: 5 }} />{r.beds}</p>
                <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 16 }}>
                  {r.desc}
                </p>

                {/* BUTTON */}
                <button
                  className="sw-btn-out"
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

      {/* MODAL — PORTRAIT, deliberately.
          A room carries ~120 characters against a package's ~360, and split
          across two columns that left a 441px panel holding four short lines
          beside a full-height photo. Portrait keeps it in one reading column.

          It uses the same MediaGallery as the package dialogs, so the frame,
          caption and (when there is more than one shot) the slider all behave
          identically. A room carries up to five photos; one photo hides the
          arrows, counter and thumbnails on its own. */}
      <Dialog open={!!activeRoom} onOpenChange={(open) => { if (!open) setActiveRoom(null); }}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
          {activeRoom && (
            <div className="flex flex-col">
              <MediaGallery
                shots={roomShots(activeRoom)}
                eyebrow="ROOM"
                compact
                title={
                  <DialogTitle asChild>
                    <div className="truncate font-serif text-[26px] leading-tight font-normal text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
                      {activeRoom.name}
                    </div>
                  </DialogTitle>
                }
              />

              <div className="flex flex-col gap-4 p-6">
                <p className="flex items-center gap-2 text-sm text-accent-ink">
                  <Icon name="bed" size={14} />
                  {activeRoom.beds}
                </p>

                <DialogDescription asChild>
                  <p className="text-[15px] leading-relaxed text-body">{activeRoom.desc}</p>
                </DialogDescription>
              </div>

              <div className="mt-auto border-t border-border-soft p-6 pt-5">
                <Button
                  className="sw-btn h-auto w-full rounded-lg border border-accent-ink bg-transparent py-3.5 text-xs font-bold tracking-wider text-accent-ink hover:bg-accent-ink/10"
                  onClick={() => onAddToBooking(activeRoom.id)}
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
