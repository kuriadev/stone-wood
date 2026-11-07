"use client";

import type { CSSProperties } from "react";
import { Dialog as D } from "radix-ui";
import { Icon } from "@/components/common/Icon";
import "./FacilityLightbox.css";

// ── A Resort Facility, opened from Home
//
// The facility's photo grows out of the tile that was clicked and settles
// at the centre of the screen; its name and description rise onto it in a
// frosted-glass panel. Closing sends it back to the tile. The photo is the
// one staff set in Facility Management, or a stock one
// (lib/facilityPhotos.ts).

export interface FacilityShot {
  name: string;
  desc: string;
  photo: string;
  closed: boolean;
  /** Centre of the clicked tile, in viewport pixels. */
  origin: { x: number; y: number } | null;
}

export function FacilityLightbox({ shot, open, onOpenChange }: {
  shot: FacilityShot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!shot) return null;
  // How far the tile is from the centre of the screen: the card starts
  // there, small, and travels in (and back out when it closes).
  const from = shot.origin && typeof window !== "undefined"
    ? { x: shot.origin.x - window.innerWidth / 2, y: shot.origin.y - window.innerHeight / 2 }
    : { x: 0, y: 40 };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="sw-facbox__scrim" />
        <D.Content
          className="sw-facbox"
          style={{ "--from-x": `${from.x}px`, "--from-y": `${from.y}px` } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a staff-set data URL or a remote photo; next/image adds nothing here */}
          <img className="sw-facbox__img" src={shot.photo} alt="" />
          <div className="sw-facbox__shade" />
          <D.Close className="sw-facbox__close" aria-label="Close">
            <Icon name="x" size={18} />
          </D.Close>
          <div className="sw-facbox__glass">
            <span className="sw-facbox__eyebrow">Resort facility</span>
            <D.Title className="sw-facbox__title">{shot.name}</D.Title>
            {shot.desc
              ? <D.Description className="sw-facbox__desc">{shot.desc}</D.Description>
              : <D.Description className="sw-facbox__desc">Part of your stay at Stonewood Garden.</D.Description>}
            {shot.closed && <span className="sw-facbox__tag">Under maintenance</span>}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
