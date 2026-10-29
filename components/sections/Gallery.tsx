"use client";

import { useMemo } from "react";
import { useWidth } from "@/hooks/useWidth";
import { THEME_COLORS } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { srcSetFor } from "@/lib/img";
import { galleryTiles, galleryColumns, type GalleryPhoto } from "@/lib/gallery";
import { Masonry } from "@/components/common/Masonry";

interface GalleryProps {
  photos: GalleryPhoto[];
}

/**
 * The gallery: an opening photo, then the rest of the admin-editable set.
 * Each photo can carry a title and a line of text written in the admin
 * Gallery tab, shown when a guest hovers it.
 *
 * The photos are a masonry wall (components/common/Masonry): every photo
 * keeps its own shape, the columns stay full to the bottom, and a tap opens
 * it full size with arrows and Esc.
 */
export function Gallery({ photos }: GalleryProps) {
  const C = THEME_COLORS;
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  const hero = photos[0]?.url;
  const columns = galleryColumns(w);
  const tiles = useMemo(() => galleryTiles(photos, columns), [photos, columns]);

  const serif = "'Satoshi',system-ui,sans-serif";

  // Nothing to tell a story with.
  if (photos.length === 0) {
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
              margin: "0 0 16px",
              // Gold on a bright photo is the weakest pairing on this page;
              // the shadow keeps it readable whatever the hero image is.
              textShadow: "0 1px 12px rgba(0,0,0,0.85)",
            }}
          >
            GALLERY
          </p>
          <h1
            style={{
              fontFamily: serif,
              fontSize: mob ? 38 : tab ? 52 : 66,
              lineHeight: 1.05,
              color: "#fff",
              fontWeight: 400,
              margin: "0 0 20px",
              letterSpacing: "-0.5px",
              textShadow: "0 2px 30px rgba(0,0,0,0.45)",
            }}
          >
            Seventeen hours,<br />
            <span style={{ fontStyle: "italic", color: C.goldInk }}>told in order</span>
          </h1>
          <p style={{ color: "rgba(246,241,232,0.9)", fontSize: mob ? 15 : 17, lineHeight: 1.75, maxWidth: 540, margin: 0, fontWeight: 300 }}>
            Tap any photo to see it full size.
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

      {/* 1240 left roughly a third of a wide screen empty on either side,
          which made the mosaic read as a narrow column rather than a wall of
          photographs. The cap is still a cap — photos stop growing on a very
          wide monitor rather than stretching to the bezels — but it is set
          where the grid fills the screen it is actually viewed on. */}
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: mob ? "48px 20px 72px" : "88px 48px 112px" }}>

        <Masonry
          items={tiles}
          columns={columns}
          gap={mob ? 12 : 20}
          radius={14}
          hoverEffect="zoom"
          // The title and text staff wrote, shown on hover like React Bits'
          // Masonry; always shown on touch screens (Masonry.css), which
          // cannot hover, and under the photo in the full-size view.
          captions="hover"
          draggable={false}
          animateFrom="bottom"
          stagger={0.06}
        />
      </div>

    </div>
  );
}
