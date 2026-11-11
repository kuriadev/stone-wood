"use client";

import "./RoomsPage.css";
import { useWidth } from "@/hooks/useWidth";
import { THEME_COLORS } from "@/lib/theme";
import { goldBtn, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { Room } from "@/types/room";
import { useEffect, useState } from "react";
import { srcSetFor } from "@/lib/img";
import { roomShots } from "@/lib/gallery";
import { Icon } from "@/components/common/Icon";
import { GuestCapBadge } from "@/components/common/GuestCapBadge";
import { useRoomCart, roomCart } from "@/hooks/useRoomCart";
import { Reveal, REVEAL_STEP } from "@/components/common/Reveal";
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
  const inCart = useRoomCart();
  /* Arriving from "View rooms" on a room in the home page's carousel: scroll
     that room to the middle of the screen, so the guest lands on the one they
     picked rather than the top of the list. No highlight, just the scroll. */
  useEffect(() => {
    if (rooms.length === 0) return;
    let id: string | null = null;
    try { id = sessionStorage.getItem("sw_room_focus"); sessionStorage.removeItem("sw_room_focus"); } catch { /* nothing to do */ }
    if (!id) return;
    const until = Date.now() + 4000;
    let t = 0;
    const look = () => {
      const el = document.querySelector<HTMLElement>(`[data-room="${CSS.escape(id!)}"]`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if (Date.now() < until) t = window.setTimeout(look, 90);
    };
    // After the page's first paint.
    const raf = requestAnimationFrame(() => requestAnimationFrame(look));
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [rooms.length]);
  /* Add and remove with the same button: an added room's button takes it
     off again (the pill beside the theme button is the way on to Book
     Now). */
  const toggleRoom = (r: Room) => {
    if (inCart.includes(r.id)) {
      roomCart.remove(r.id);
    } else {
      onAddToBooking(r.id);
    }
  };
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const C = THEME_COLORS;
  const w = useWidth();
  const mob = w < 768;

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
          marginBottom: 12,
        }}>
          Rooms & Sleeping Quarters
        </h2>

        <p style={{ color: C.textS, textAlign: "center", marginBottom: 48, fontSize: 14.5 }}>
          Rooms are rented separately from the pool.
        </p>
        </Reveal>

        {/* ROOMS — one wide row each, the photo and the words side by side,
            alternating left and right down the page. Everything the cards
            held is here: name, beds, how many it sleeps, price, the
            description, and Add to booking. The photo opens the details. */}
        <div className="sw-rooms">
          {rooms.map((r, i) => {
            // "Room 1 — Queen & Deck" reads as a small "ROOM 1" and a big
            // "Queen & Deck"; a name without the pattern stays whole.
            const m = /^(Room\s*\d+)\s*[—–-]\s*(.+)$/i.exec(r.name);
            const eyebrow = (m ? m[1] : `Room ${i + 1}`).toUpperCase();
            const title = m ? m[2] : r.name;
            const flip = !mob && i % 2 === 1;
            const added = inCart.includes(r.id);
            return (
              <Reveal key={r.id} delay={i * REVEAL_STEP}>
                <article data-room={r.id} className={`sw-room${flip ? " is-flip" : ""}`} style={{ gridTemplateColumns: mob ? "minmax(0, 1fr)" : flip ? "minmax(0,1fr) minmax(0,1.15fr)" : "minmax(0,1.15fr) minmax(0,1fr)" }}>
                  <button type="button" className="sw-room__photo" onClick={() => setActiveRoom(r)} aria-label={`See ${r.name}`}
                    style={{ order: flip ? 2 : 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- room photos are admin uploads (often data: URLs) with their own srcSet */}
                    <img
                      loading="lazy" decoding="async"
                      src={r.img}
                      srcSet={srcSetFor(r.img)}
                      sizes={mob ? "100vw" : "(max-width: 1100px) 55vw, 600px"}
                      alt={r.name}
                      className="room-img"
                    />
                    <span className="sw-room__chip"><Icon name="users" size={13} /> {r.capacity} guests</span>
                  </button>

                  <div className="sw-room__text" style={{ order: flip ? 1 : 0 }}>
                    <p className="sw-room__eyebrow" style={{ color: C.goldInk }}>{eyebrow}</p>
                    <h3 className="sw-room__title" style={{ color: C.textH }}>{title}</h3>
                    <p className="sw-room__beds" style={{ color: C.textB }}>
                      <Icon name="bed" size={14} style={{ color: C.goldInk }} /> {r.beds} <GuestCapBadge n={r.capacity} />
                    </p>
                    <p className="sw-room__price" style={{ color: C.textH }}>{fmt(r.price)} <span style={{ color: C.textS }}>per tour</span></p>
                    {r.desc && <p className="sw-room__desc" style={{ color: C.textS }}>{r.desc}</p>}
                    <div className="sw-room__actions">
                      {/* Added: says so; tapping again takes it off. */}
                      <button
                        type="button"
                        className={added ? "sw-btn" : "sw-btn-out"}
                        onClick={() => toggleRoom(r)}
                        aria-pressed={added}
                        style={{ ...(added ? goldBtn : outBtn), padding: "12px 22px", borderRadius: 8 }}
                      >
                        {added ? "✓ ADDED · TAP TO REMOVE" : "ADD TO BOOKING"}
                      </button>
                      <button type="button" className="sw-ulink" onClick={() => setActiveRoom(r)}
                        style={{ background: "none", border: "none", padding: "8px 2px", color: C.goldInk, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        View details
                      </button>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
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
                  className="sw-btn h-auto w-full rounded-lg border border-accent-ink bg-transparent py-4 text-xs font-bold tracking-wider text-accent-ink hover:bg-accent-ink/10"
                  onClick={() => toggleRoom(activeRoom)}
                >
                  {inCart.includes(activeRoom.id) ? "✓ ADDED · TAP TO REMOVE" : "ADD TO BOOKING"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
