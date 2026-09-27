"use client";

import { useEffect, useState } from "react";
import { gold } from "@/lib/styles";

export interface GalleryShot {
  src: string;
  /** Caption for this frame, shown bottom-right and used as the thumbnail's
   *  accessible name. */
  label?: string;
  /** Optional kind line above the caption, e.g. "ROOM", "POOL". */
  kind?: string;
}

interface MediaGalleryProps {
  shots: GalleryShot[];
  /** Small tracking-wide line above the title, e.g. "PACKAGE" or "ROOM". */
  eyebrow?: string;
  /** Rendered over the photo. Pass a DialogTitle so the dialog takes its
   *  accessible name from the visible heading rather than a hidden copy. */
  title: React.ReactNode;
  /** Shorter frame on small screens. */
  compact?: boolean;
  className?: string;
}

/**
 * The photo column shared by every detail dialog — package, room, event.
 *
 * Pulled out of Home's package modal so the three dialogs behave the same
 * way instead of each growing its own variant. Rooms carry a single image
 * today and packages carry several, so this degrades on purpose: with one
 * shot there are no arrows, no counter and no thumbnail strip, and the frame
 * is just a photo with its caption.
 *
 * Everything here sits on a photo under a dark gradient, so it uses the
 * bright `gold` rather than the theme-following `goldInk` — see the two-golds
 * note in the README. That is also why the text is white in both themes.
 */
export function MediaGallery({
  shots,
  eyebrow,
  title,
  compact = false,
  className = "",
}: MediaGalleryProps) {
  const [idx, setIdx] = useState(0);
  const many = shots.length > 1;

  // A different item can be opened without this unmounting, so the index has
  // to come back to the first frame or the new item opens mid-gallery.
  useEffect(() => { setIdx(0); }, [shots]);

  const step = (dir: number) => setIdx((n) => (n + dir + shots.length) % shots.length);
  const shot = shots[Math.min(idx, shots.length - 1)];

  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [many, shots.length]);

  const arrow =
    "absolute top-1/2 z-[3] flex size-9 -translate-y-1/2 items-center justify-center " +
    "rounded-full border bg-black/40 text-lg backdrop-blur-sm transition hover:bg-black/60";

  return (
    <div className={`relative flex flex-col overflow-hidden bg-black/20 ${className}`}>
      <div
        className="relative flex-1 overflow-hidden bg-[#0a0806]"
        style={{ minHeight: compact ? 230 : 280 }}
      >
        {shots.map((g, i) => (
          <div
            key={(g.src || "") + i}
            aria-hidden={i !== idx}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-300"
            style={{ backgroundImage: `url(${g.src})`, opacity: i === idx ? 1 : 0 }}
          />
        ))}

        {/* Legibility floor for the caption, whatever the photo is doing. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />

        {many && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className={`${arrow} left-2.5`}
              style={{ borderColor: `${gold}44`, color: gold }}
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className={`${arrow} right-2.5`}
              style={{ borderColor: `${gold}44`, color: gold }}
            >
              &rsaquo;
            </button>

            <div
              className="absolute top-4 left-4 z-[3] rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11.5px] tracking-widest text-white/80 backdrop-blur-sm"
              aria-live="polite"
            >
              {String(idx + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")}
            </div>
          </>
        )}

        <div className="absolute right-5 bottom-3.5 left-5 z-[3]">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-1 text-[10.5px] tracking-[3px]" style={{ color: gold }}>
                  {eyebrow}
                </div>
              )}
              {title}
            </div>
            {(shot?.kind || shot?.label) && (
              <div className="shrink-0 text-right">
                {shot.kind && (
                  <div className="mb-0.5 text-[10.5px] tracking-[2px]" style={{ color: gold }}>
                    {shot.kind.toUpperCase()}
                  </div>
                )}
                {shot.label && <div className="text-[13.5px] text-white/90">{shot.label}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {many && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-5 pt-3 pb-1 sm:px-8">
          {shots.map((g, i) => (
            <button
              key={(g.src || "") + i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`View ${g.label || `photo ${i + 1}`}`}
              aria-current={i === idx}
              className="size-auto h-10 w-[52px] shrink-0 rounded-md border-2 bg-cover bg-center p-0 transition"
              style={{
                backgroundImage: `url(${g.src})`,
                borderColor: i === idx ? gold : "transparent",
                opacity: i === idx ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
