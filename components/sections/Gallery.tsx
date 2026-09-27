"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { srcSetFor, SIZES } from "@/lib/img";
import { Icon } from "@/components/common/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface GalleryProps {
  galleryImgs: string[];
}

/**
 * The gallery told as one day at the resort, 7am to midnight.
 *
 * The times and the places are the real ones, not invented atmosphere: the
 * chapters sit inside the Day Tour (7:00 AM – 5:00 PM) and Night Tour
 * (7:00 PM – 12:00 AM) windows quoted on the Home page, and every location
 * named is a facility that actually exists in INIT_FACILITIES.
 *
 * The photo set is admin-editable and can be any length, so chapters take
 * contiguous slices of whatever is there rather than mapping to fixed
 * images. With fewer photos than chapters, the later chapters simply do not
 * render — the story shortens instead of breaking.
 */
/** Column spans for the mosaic, on a repeating cycle. The pattern is taken
 *  from the design: rows that cannot fit the next span end early, which is
 *  what produces the deliberate gaps down the right-hand side. */
const SPANS = [7, 5, 4, 5, 7, 7, 4, 3, 4, 7];

/** Photos are stamped with a time of day, spread evenly across the resort's
 *  seventeen open hours (07:00 to 23:00) however many photos the admin has
 *  uploaded -- hence "Seventeen hours, told in order". */
function hourLabel(i: number, total: number): string {
  const span = 16; // 07:00 -> 23:00
  const hour = total <= 1 ? 7 : 7 + Math.round((i * span) / (total - 1));
  return `${String(hour).padStart(2, "0")}:00`;
}

export function Gallery({ galleryImgs }: GalleryProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  const [selIdx, setSelIdx] = useState<number | null>(null);
  /** Where focus was before the lightbox opened, so it can be handed back. */
  const openerRef = useRef<HTMLElement | null>(null);

  const hero = galleryImgs[0];
  const rest = useMemo(() => galleryImgs.slice(1), [galleryImgs]);

  const open = (src: string, e?: React.MouseEvent) => {
    openerRef.current = (e?.currentTarget as HTMLElement) ?? null;
    setSelIdx(galleryImgs.indexOf(src));
  };
  const close = useCallback(() => {
    setSelIdx(null);
    openerRef.current?.focus?.();
  }, []);
  const step = useCallback(
    (d: number) =>
      setSelIdx((i) => (i === null ? null : (i + d + galleryImgs.length) % galleryImgs.length)),
    [galleryImgs.length],
  );

  // Keyboard control for the lightbox. It had none before: once open, the
  // only way out was a mouse click, which leaves a keyboard user trapped.
  useEffect(() => {
    if (selIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the overlay from scrolling under it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selIdx, close, step]);

  const serif = "'Cormorant Garamond',Georgia,serif";

  // Nothing to tell a story with.
  if (galleryImgs.length === 0) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ color: C.textS, fontSize: 15 }}>No photos yet — add some from the admin Gallery tab.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        // The per-chapter glow deliberately bleeds past the text column
        // (left/right: -80), which pushed the page 48px wider than the
        // viewport at tablet widths and anywhere the 1240 max-width ran out
        // of slack. `clip` trims that bleed without creating a scroll
        // container — `hidden` would, and that would kill the sticky rail.
        overflowX: "clip",
      }}
    >
      {/* ── Opening frame ─────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          height: mob ? "72vh" : "86vh",
          minHeight: mob ? 420 : 520,
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero}
          srcSet={srcSetFor(hero)}
          sizes="100vw"
          alt="StoneWood Resort at first light"
          // The opening image is the LCP element, so it is eager and high
          // priority rather than lazy like the rest.
          fetchPriority="high"
          decoding="async"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              // Ramps up earlier and finishes darker than a simple top-and-tail
              // scrim: the title block sits at the bottom, and over a bright
              // photo the gold eyebrow had almost no contrast against it.
              "linear-gradient(180deg,rgba(6,5,3,0.50) 0%,rgba(6,5,3,0.12) 28%,rgba(6,5,3,0.58) 60%,rgba(6,5,3,0.93) 100%)",
          }}
        />
        <div style={{ position: "relative", zIndex: 2, padding: mob ? "0 20px 44px" : "0 48px 72px", maxWidth: 820 }}>
          <p
            style={{
              color: C.goldInk,
              letterSpacing: 5,
              fontSize: 11.5,
              margin: "0 0 14px",
              // Gold on a bright photo is the weakest pairing on this page;
              // the shadow keeps it readable whatever the hero image is.
              textShadow: "0 1px 12px rgba(0,0,0,0.85)",
            }}
          >
            GALLERY · ONE DAY AT STONEWOOD
          </p>
          <h1
            style={{
              fontFamily: serif,
              fontSize: mob ? 38 : tab ? 52 : 66,
              lineHeight: 1.05,
              color: "#fff",
              fontWeight: 400,
              margin: "0 0 18px",
              letterSpacing: "-0.5px",
              textShadow: "0 2px 30px rgba(0,0,0,0.45)",
            }}
          >
            Seventeen hours,<br />
            <span style={{ fontStyle: "italic", color: C.goldInk }}>told in order</span>
          </h1>
          <p style={{ color: "rgba(246,241,232,0.9)", fontSize: mob ? 15 : 17, lineHeight: 1.75, maxWidth: 540, margin: 0, fontWeight: 300 }}>
            From the gate opening at seven to the last light before midnight. Scroll
            through the day — or tap any photo to see it full size.
          </p>
        </div>

        <div
          aria-hidden="true"
          className="sw-hero-scroll-indicator"
          style={{ color: "rgba(246,241,232,0.65)", fontSize: 10.5, letterSpacing: 3 }}
        >
          SCROLL
          <span style={{ display: "block", width: 1, height: 26, background: `${gold}88`, margin: "8px auto 0" }} />
        </div>
      </section>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: mob ? "48px 20px 72px" : "88px 32px 112px" }}>

        {/* Section head: the label on the left, the line on the right. */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: mob ? 26 : 40 }}>
          <p style={{ color: C.textS, fontSize: 11, letterSpacing: 2.6, margin: 0 }}>MORNING TO MIDNIGHT</p>
          <h2 style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 26 : 38, fontWeight: 400, margin: 0, lineHeight: 1.15 }}>
            A quiet look inside your stay
          </h2>
        </div>

        {/* A 12-column mosaic. The spans repeat on a ten-photo cycle, and a
            row that cannot fit the next span simply ends -- the gap on the
            right is the layout, not a bug. Photos keep their own aspect
            ratio, so rows stagger the way the design does. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(12, 1fr)",
            gap: mob ? 14 : 22,
            alignItems: "start",
          }}
        >
          {rest.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={(e) => open(src, e)}
              aria-label={`Open photo ${i + 1} of ${rest.length}, ${hourLabel(i, rest.length)}`}
              style={{
                gridColumn: mob ? "auto" : `span ${SPANS[i % SPANS.length]}`,
                position: "relative",
                display: "block",
                width: "100%",
                padding: 0,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                overflow: "hidden",
                background: C.bgCard2,
                cursor: "zoom-in",
                lineHeight: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                loading="lazy"
                decoding="async"
                src={src}
                srcSet={srcSetFor(src)}
                sizes={SIZES.card}
                alt=""
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  background: "rgba(0,0,0,0.58)",
                  color: "#f2ede4",
                  fontSize: 11,
                  letterSpacing: 1,
                  padding: "5px 10px",
                  borderRadius: 999,
                  lineHeight: 1.2,
                }}
              >
                {hourLabel(i, rest.length)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Lightbox ── a Dialog, for the focus trap. It already carried
          role="dialog" and aria-modal and it already closed on Escape, but
          nothing confined Tab to it: with a photo open, 0 of 14 tab stops
          landed inside — focus walked the gallery tiles behind the overlay,
          so the prev, next and close buttons could not be reached by keyboard
          at all. Radix confines focus and restores it to the tile on close.

          The panel keeps the full-bleed look: no background, no border, no
          padding, sized to the viewport rather than shadcn's default card. */}
      <Dialog open={selIdx !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 grid h-dvh w-screen max-w-none translate-x-0 translate-y-0 place-items-center border-0 bg-transparent p-0 shadow-none sm:max-w-none"
          style={{
            padding: mob ? 12 : 20,
            // The original viewer sat on a near-opaque rgba(5,4,3,0.97).
            // shadcn's overlay is black/50, which left the gallery grid
            // showing through behind the photo. DialogContent is full-bleed
            // here, so putting the backdrop on it restores the original
            // without needing to reach into the overlay.
            background: "rgba(5,4,3,0.97)",
            boxShadow: "none",
          }}
        >
          <DialogTitle className="sr-only">Photo viewer</DialogTitle>
          <DialogDescription className="sr-only">
            {selIdx !== null ? `Photo ${selIdx + 1} of ${galleryImgs.length}. Use the left and right arrow keys to browse.` : ""}
          </DialogDescription>

          {selIdx !== null && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                aria-label="Previous photo"
                style={arrowStyle(mob, "left")}
              >
                ‹
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={galleryImgs[selIdx]}
                srcSet={srcSetFor(galleryImgs[selIdx])}
                sizes={SIZES.modal}
                alt={`StoneWood Resort, photo ${selIdx + 1} of ${galleryImgs.length}`}
                decoding="async"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "92%", maxHeight: "86vh", borderRadius: 8, boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}
              />

              <button
                onClick={(e) => { e.stopPropagation(); step(1); }}
                aria-label="Next photo"
                style={arrowStyle(mob, "right")}
              >
                ›
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); close(); }}
                aria-label="Close photo viewer"
                style={{ ...arrowStyle(mob, "right"), right: mob ? 12 : 20, top: mob ? 12 : 20, transform: "none", fontSize: 20 }}
              >
                <Icon name="x" size={17} />
              </button>

              <div
                style={{
                  position: "fixed",
                  bottom: mob ? 14 : 24,
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: "rgba(201,168,76,0.6)",
                  fontSize: 12.5,
                  letterSpacing: 2,
                  textAlign: "center",
                }}
              >
                {selIdx + 1} / {galleryImgs.length}
                {!mob && (
                  <span style={{ display: "block", fontSize: 10.5, letterSpacing: 1.4, marginTop: 5, color: "rgba(246,241,232,0.35)" }}>
                    ← → TO BROWSE · ESC TO CLOSE
                  </span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function arrowStyle(mob: boolean, side: "left" | "right"): React.CSSProperties {
  return {
    position: "fixed",
    [side]: mob ? 8 : 20,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(201,168,76,0.1)",
    border: `1px solid ${gold}44`,
    // Stays the bright gold: the lightbox backdrop is rgba(5,4,3,0.97) in
    // BOTH themes, so these arrows are always on near-black and the darker
    // light-mode gold would only reduce contrast here.
    color: gold,
    width: 44,
    height: 44,
    borderRadius: "50%",
    fontSize: 22,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 201,
    fontFamily: "inherit",
  };
}

/** One framed, clickable photo. Kept in one place so the hover treatment and
 *  the overflow clipping cannot drift between the story and the full grid. */
function GalleryFrame({
  src, alt, height, border, shadow, onOpen,
}: {
  src: string;
  alt: string;
  height: number;
  border: string;
  shadow: string;
  onOpen: (src: string, e?: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={(e) => onOpen(src, e)}
      aria-label={`View larger: ${alt}`}
      style={{
        overflow: "hidden",
        borderRadius: 10,
        border: `1px solid ${border}`,
        boxShadow: shadow,
        padding: 0,
        background: "none",
        cursor: "pointer",
        display: "block",
        width: "100%",
        lineHeight: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        loading="lazy"
        decoding="async"
        src={src}
        srcSet={srcSetFor(src)}
        sizes={SIZES.tile}
        alt={alt}
        className="room-img"
        style={{ width: "100%", height, objectFit: "cover", display: "block" }}
      />
    </button>
  );
}
