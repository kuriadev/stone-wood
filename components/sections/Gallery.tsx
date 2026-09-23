"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { srcSetFor, SIZES } from "@/lib/img";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { Icon } from "@/components/common/Icon";

interface GalleryProps {
  galleryImgs: string[];
  onBookNow?: () => void;
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
const CHAPTERS = [
  {
    time: "7:00 AM",
    label: "Arrival",
    title: "The gate opens",
    body:
      "Day Tour starts at seven. Park under the trees, walk in while the stone is still cool, and take the place in before anyone else is up.",
    tint: "#7ea8c4", // early blue
  },
  {
    time: "9:30 AM",
    label: "The Pool",
    title: "First in the water",
    body:
      "The pool has the morning to itself. This is the quiet hour — before the food comes out, before the speakers go on.",
    tint: "#4fb0c6",
  },
  {
    time: "12:30 PM",
    label: "Grilling Area",
    title: "Charcoal and smoke",
    body:
      "Lunch happens at the BBQ deck. Bring your own or pre-order from the menu so it is ready when you arrive.",
    tint: "#d98a3d",
  },
  {
    time: "4:00 PM",
    label: "Golden Hour",
    title: "The light turns",
    body:
      "An hour before Day Tour closes, the light drops low across the water. Most of the photos people take here are taken now.",
    tint: "#e0a84c",
  },
  {
    time: "7:00 PM",
    label: "Videoke & Billiards",
    title: "The night tour begins",
    body:
      "A separate booking, a different resort. Videoke in one corner, billiards in the other, the pool lit from below.",
    tint: "#7c5cc4",
  },
  {
    time: "11:00 PM",
    label: "The Rooms",
    title: "Last light",
    body:
      "Three rooms if you are staying over. The last hour is the quietest one of the day — the pool empty, the deck cooling down.",
    tint: "#3b4a7a",
  },
] as const;

/** Split a list into `buckets` contiguous, near-equal groups. Contiguous so
 *  the order the admin arranged in the Gallery tab is preserved. */
function sliceEvenly<T>(items: T[], buckets: number): T[][] {
  const out: T[][] = [];
  let idx = 0;
  for (let b = 0; b < buckets; b++) {
    const take = Math.ceil((items.length - idx) / (buckets - b));
    out.push(items.slice(idx, idx + take));
    idx += take;
  }
  return out;
}

export function Gallery({ galleryImgs, onBookNow }: GalleryProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.
  useScrollReveal();

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  // <section>, so HTMLElement — not HTMLDivElement.
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  /** Where focus was before the lightbox opened, so it can be handed back. */
  const openerRef = useRef<HTMLElement | null>(null);

  const hero = galleryImgs[0];
  const rest = useMemo(() => galleryImgs.slice(1), [galleryImgs]);

  // Only as many chapters as there are photos to carry them.
  const chapters = useMemo(() => {
    const count = Math.min(CHAPTERS.length, Math.max(rest.length, 1));
    const groups = sliceEvenly(rest, count);
    return CHAPTERS.slice(0, count).map((c, i) => ({ ...c, images: groups[i] ?? [] }));
  }, [rest]);

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

  // Which chapter the reader is in, for the time rail.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (seen) {
          const i = sectionRefs.current.indexOf(seen.target as HTMLElement);
          if (i >= 0) setActive(i);
        }
      },
      { threshold: [0.25, 0.5], rootMargin: "-20% 0px -40% 0px" },
    );
    sectionRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [chapters.length]);

  const jumpTo = (i: number) =>
    sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

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
              color: gold,
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
            <span style={{ fontStyle: "italic", color: gold }}>told in order</span>
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

      <div style={{ display: "flex", maxWidth: 1240, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        {/* ── Time rail: the spine of the story ───────────────────── */}
        {!tab && (
          <nav
            aria-label="Jump to a time of day"
            style={{ position: "sticky", top: 120, alignSelf: "flex-start", height: "fit-content", paddingTop: 96, paddingRight: 44, flexShrink: 0 }}
          >
            {chapters.map((c, i) => {
              const on = i === active;
              return (
                <button
                  key={c.time}
                  onClick={() => jumpTo(i)}
                  aria-current={on ? "true" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "none",
                    border: "none",
                    padding: "9px 0",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    width: 150,
                    color: on ? gold : C.textXS,
                    transition: "color .25s ease",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: on ? 26 : 12,
                      height: 1,
                      background: on ? gold : C.border,
                      transition: "width .25s ease, background .25s ease",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11.5, letterSpacing: 1.6, whiteSpace: "nowrap" }}>{c.time}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* ── Chapters ────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, paddingBottom: mob ? 56 : 96 }}>
          {chapters.map((c, i) => {
            const [lead, ...extras] = c.images;
            return (
              <section
                key={c.time}
                ref={(el) => { sectionRefs.current[i] = el; }}
                style={{ position: "relative", paddingTop: mob ? 56 : 96, scrollMarginTop: 96 }}
              >
                {/* Ambient wash that shifts with the hour. Low alpha so it
                    reads as light rather than a coloured panel, in either theme. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: mob ? -20 : -80,
                    right: mob ? -20 : -80,
                    top: 0,
                    height: 340,
                    background: `radial-gradient(ellipse 60% 100% at 30% 0%, ${c.tint}${isDark ? "1f" : "17"} 0%, transparent 70%)`,
                    pointerEvents: "none",
                  }}
                />

                <div className="sw-reveal" style={{ position: "relative", maxWidth: 620, marginBottom: mob ? 22 : 30 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <span
                      style={{
                        color: gold,
                        fontSize: 11.5,
                        letterSpacing: 2.4,
                        border: `1px solid ${gold}44`,
                        borderRadius: 20,
                        padding: "5px 13px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.time}
                    </span>
                    <span style={{ color: C.textXS, fontSize: 11, letterSpacing: 2.6, textTransform: "uppercase" }}>
                      {c.label}
                    </span>
                  </div>
                  <h2
                    style={{
                      fontFamily: serif,
                      fontSize: mob ? 27 : 38,
                      color: C.textH,
                      fontWeight: 400,
                      margin: "0 0 12px",
                      letterSpacing: "-0.3px",
                      lineHeight: 1.15,
                    }}
                  >
                    {c.title}
                  </h2>
                  <p style={{ color: C.textS, fontSize: mob ? 14.5 : 16, lineHeight: 1.8, margin: 0 }}>{c.body}</p>
                </div>

                {lead && (
                  <div className="sw-reveal" style={{ display: "grid", gridTemplateColumns: extras.length && !mob ? "1.7fr 1fr" : "1fr", gap: mob ? 10 : 14 }}>
                    <GalleryFrame
                      src={lead}
                      alt={`${c.title} — ${c.label} at StoneWood, ${c.time}`}
                      height={mob ? 260 : 440}
                      border={C.border}
                      shadow={C.shadowCard}
                      onOpen={open}
                    />
                    {extras.length > 0 && (
                      <div
                        style={{
                          display: "grid",
                          gap: mob ? 10 : 14,
                          // On a phone a lone extra was taking one half of a
                          // two-column grid and leaving the other half empty.
                          // It only pairs up when there is something to pair with.
                          gridTemplateColumns: mob && extras.length > 1 ? "1fr 1fr" : "1fr",
                        }}
                      >
                        {extras.map((src) => (
                          <GalleryFrame
                            key={src}
                            src={src}
                            alt={`${c.label} at StoneWood`}
                            height={
                              mob
                                ? extras.length > 1 ? 130 : 200
                                : (440 - 14 * (extras.length - 1)) / extras.length
                            }
                            border={C.border}
                            shadow={C.shadowCard}
                            onOpen={open}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {/* ── Closing: every photo, so nothing is buried in the story ── */}
          <section style={{ paddingTop: mob ? 60 : 104 }}>
            <div className="sw-reveal" style={{ textAlign: "center", marginBottom: mob ? 24 : 32 }}>
              <p style={{ color: gold, letterSpacing: 4, fontSize: 11.5, margin: "0 0 10px" }}>THE FULL SET</p>
              <h2 style={{ fontFamily: serif, fontSize: mob ? 24 : 32, color: C.textH, fontWeight: 400, margin: "0 0 8px" }}>
                Every photo, all at once
              </h2>
              <p style={{ color: C.textS, fontSize: 14.5, margin: 0 }}>
                {galleryImgs.length} photo{galleryImgs.length === 1 ? "" : "s"} · tap any one to view full size
              </p>
            </div>
            <div
              className="sw-reveal"
              style={{
                display: "grid",
                gridTemplateColumns: mob ? "1fr 1fr" : tab ? "repeat(3,1fr)" : "repeat(4,1fr)",
                gap: mob ? 8 : 12,
              }}
            >
              {galleryImgs.map((src, i) => (
                <GalleryFrame
                  key={src + i}
                  src={src}
                  alt={`StoneWood Resort, photo ${i + 1} of ${galleryImgs.length}`}
                  height={mob ? 118 : 172}
                  border={C.border}
                  shadow={C.shadowCard}
                  onOpen={open}
                />
              ))}
            </div>

            <div className="sw-reveal" style={{ textAlign: "center", marginTop: mob ? 44 : 64 }}>
              <p style={{ color: C.textS, fontSize: mob ? 15 : 16.5, lineHeight: 1.8, maxWidth: 460, margin: "0 auto 22px" }}>
                That is one day. Pick a date and it is yours.
              </p>
              <button
                onClick={onBookNow}
                className="sw-btn"
                style={{ ...goldBtn, padding: "14px 36px", fontSize: 13, letterSpacing: 2, borderRadius: 6, fontFamily: "inherit" }}
              >
                CHECK AVAILABILITY →
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────── */}
      {selIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,4,3,0.97)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: mob ? 12 : 20,
          }}
        >
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
        </div>
      )}
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
