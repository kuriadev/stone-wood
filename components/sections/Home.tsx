"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { PACKAGES } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { AvailabilityCalendar } from "@/components/common/AvailabilityCalendar";
import type { Booking } from "@/types/booking";

interface HomeProps {
  setPage: (p: string) => void;
  onBookWithDate: (d: string) => void;
  bookings: Booking[];
  closedDates: string[];
}

// TODO: swap for the resort's own night/pool photography when available.
const HERO_BG =
  "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=2400&auto=format&fit=crop";

// Resort services — rendered as a clean line-icon row.
const SERVICES: { name: string; icon: React.ReactNode }[] = [
  {
    name: "Swimming Pool",
    icon: (
      <>
        <path d="M2 17c1.8 0 1.8 1.4 3.6 1.4S7.4 17 9.2 17s1.8 1.4 3.6 1.4S14.6 17 16.4 17s1.8 1.4 3.6 1.4" />
        <path d="M2 12.6c1.8 0 1.8 1.4 3.6 1.4s1.8-1.4 3.6-1.4 1.8 1.4 3.6 1.4 1.8-1.4 3.6-1.4 1.8 1.4 3.6 1.4" />
        <path d="M8 13V5a2 2 0 0 1 4 0" />
        <path d="M16 13V5a2 2 0 0 0-4 0" />
      </>
    ),
  },
  {
    name: "BBQ / Grilling Area",
    icon: (
      <>
        <path d="M5 4h14l-1.6 7.5a6 6 0 0 1-11.8 0z" />
        <path d="M9.5 15.5 8 21" />
        <path d="M14.5 15.5 16 21" />
        <path d="M9 21h6" />
      </>
    ),
  },
  {
    name: "Billiards",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.4" />
      </>
    ),
  },
  {
    name: "Videoke",
    icon: (
      <>
        <rect x="9" y="2.5" width="6" height="11" rx="3" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
        <path d="M12 18v3.5" />
        <path d="M8.5 21.5h7" />
      </>
    ),
  },
  {
    name: "Parking Area",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
      </>
    ),
  },
  {
    name: "Air-Conditioned Rooms",
    icon: (
      <>
        <rect x="2.5" y="4.5" width="19" height="9" rx="2.5" />
        <path d="M6 9h12" />
        <path d="M7 17.5v2" />
        <path d="M12 17.5v3" />
        <path d="M17 17.5v2" />
      </>
    ),
  },
];

// Photo pools. Each package draws its gallery from these based on how many
// rooms and pools it includes — swap these URLs for the resort's own shots.
const ROOM_PHOTOS = [
  { label: "Room 1 — Queen & Deck", src: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop" },
  { label: "Room 2 — Deck Suite", src: "https://images.unsplash.com/photo-1566665797739-1674de7a421a?q=80&w=1200&auto=format&fit=crop" },
  { label: "Room 3 — Cozy Double", src: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=1200&auto=format&fit=crop" },
  { label: "Room 4 — Garden Room", src: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1200&auto=format&fit=crop" },
];

const POOL_PHOTOS = [
  { label: "Main Pool", src: "https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop" },
  { label: "Second Pool", src: "https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1200&auto=format&fit=crop" },
];

// Wide resort shot — used as the 4B (full resort) cover.
const RESORT_WIDE = "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop";

// Gallery for a package = its rooms, then its pools.
const pkgGallery = (rooms: number, pools: number) => [
  ...ROOM_PHOTOS.slice(0, rooms).map((p) => ({ ...p, kind: "Room" })),
  ...POOL_PHOTOS.slice(0, pools).map((p) => ({ ...p, kind: "Pool" })),
];

const DURATIONS = [
  { label: "Day Tour", window: "7:00 AM – 5:00 PM" },
  { label: "Night Tour", window: "7:00 PM – 12:00 AM" },
  { label: "Overnight", window: "7:00 PM – 7:00 AM (next day)" },
];

const ADDONS = ["Breakfast", "Lunch", "Dinner"];

const PACKAGE_TIERS = [
  { code: "1A", rooms: 1, pools: 1, status: "Shared",    cover: ROOM_PHOTOS[0].src },
  { code: "1B", rooms: 1, pools: 2, status: "Exclusive", cover: POOL_PHOTOS[1].src },
  { code: "2A", rooms: 2, pools: 1, status: "Shared",    cover: ROOM_PHOTOS[1].src },
  { code: "2B", rooms: 2, pools: 2, status: "Exclusive", cover: POOL_PHOTOS[0].src },
  { code: "3A", rooms: 3, pools: 1, status: "Shared",    cover: ROOM_PHOTOS[2].src },
  { code: "3B", rooms: 3, pools: 2, status: "Exclusive", cover: POOL_PHOTOS[1].src },
  { code: "4A", rooms: 4, pools: 1, status: "Shared",    cover: ROOM_PHOTOS[3].src },
  { code: "4B", rooms: 4, pools: 2, status: "Exclusive", cover: RESORT_WIDE, note: "Full resort" },
];

// Grouped views of PACKAGE_TIERS for display. The original index rides
// along because openPkg() and pkgCardRefs both index into PACKAGE_TIERS
// itself — losing it here would open the wrong package on click.
const PACKAGE_GROUPS = [
  { label: "SHARED", status: "Shared" },
  { label: "EXCLUSIVE", status: "Exclusive" },
].map((g) => ({
  ...g,
  tiers: PACKAGE_TIERS.map((p, i) => ({ p, i })).filter(({ p }) => p.status === g.status),
}));

const MARQUEE_REVIEWS = [
  { name: "Isabella M.", rating: 5, message: "Absolutely magical. The infinity pool at sunset is something I'll never forget. Staff treated us like family." },
  { name: "Daniel R.", rating: 5, message: "Perfect blend of luxury and privacy. The BBQ deck made our anniversary dinner unforgettable." },
  { name: "Aiko T.", rating: 5, message: "The karaoke room is unreal — we sang till sunrise. Every amenity exceeded our expectations." },
  { name: "Marcus L.", rating: 4, message: "Quiet, elegant, and impeccably maintained. We're already planning our next stay here." },
  { name: "Maria Santos", rating: 5, message: "StoneWood is our family's go-to getaway. The pool is amazing and so relaxing!" },
  { name: "Jose Reyes", rating: 5, message: "Celebrated my birthday here — unforgettable. The staff were so accommodating." },
  { name: "Ana Cruz", rating: 4, message: "Quiet, private, and beautiful. Exactly what we needed for our team outing." },
  { name: "Carlo Tan", rating: 5, message: "Great value for the whole group. The videoke setup made the night so much fun." },
];

export function Home({ setPage, onBookWithDate, bookings, closedDates }: HomeProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  // ── Shared type scale ──────────────────────────────────────────────
  // Larger, higher-contrast display type that holds up in both themes.
  const serif = "'Cormorant Garamond',Georgia,serif";
  const eyebrow: React.CSSProperties = {
    color: gold,
    fontSize: 12,
    letterSpacing: 4.5,
    fontWeight: 500,
    textTransform: "uppercase",
    marginBottom: 14,
  };
  const h2: React.CSSProperties = {
    fontFamily: serif,
    fontSize: mob ? 34 : tab ? 44 : 54,
    lineHeight: 1.12,
    color: C.textH,
    fontWeight: 400,
    letterSpacing: "-0.5px",
    margin: 0,
  };
  const lede: React.CSSProperties = {
    color: C.textS,
    fontSize: mob ? 14 : 15,
    lineHeight: 1.9,
    fontWeight: 300,
  };
  const [activePkg, setActivePkg] = useState<number | null>(null);
  // Drives the open transition — set one frame after mount so the card animates in.
  const [pkgShown, setPkgShown] = useState(false);
  // Which photo of the expanded package's gallery is showing.
  const [photoIdx, setPhotoIdx] = useState(0);

  const openPkg = (i: number) => {
    setActivePkg(i);
    setPhotoIdx(0);
    requestAnimationFrame(() => setPkgShown(true));
  };
  const closePkg = () => {
    setPkgShown(false);
    setTimeout(() => setActivePkg(null), 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePkg !== null) closePkg();
        return;
      }
      if (activePkg === null) return;
      const len = pkgGallery(PACKAGE_TIERS[activePkg].rooms, PACKAGE_TIERS[activePkg].pools).length;
      if (e.key === "ArrowRight") setPhotoIdx((n) => (n + 1) % len);
      if (e.key === "ArrowLeft") setPhotoIdx((n) => (n - 1 + len) % len);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePkg]);

  // Lock page scroll while a package card is expanded.
  useEffect(() => {
    if (activePkg === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [activePkg]);

  const ratesHeaderRef = useRef<HTMLDivElement>(null);
  const amenitiesDivRef = useRef<HTMLDivElement>(null);
  const testimonyHeaderRef = useRef<HTMLDivElement>(null);
  const packageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const amenityRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pkgHeaderRef = useRef<HTMLDivElement>(null);
  const pkgDurationRef = useRef<HTMLDivElement>(null);
  const pkgCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pkgAddonRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("sw-reveal-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -50px 0px" }
    );
    const targets = [
      ratesHeaderRef.current,
      amenitiesDivRef.current,
      testimonyHeaderRef.current,
      pkgHeaderRef.current,
      pkgDurationRef.current,
      pkgAddonRef.current,
      closingRef.current,
      ...packageRefs.current,
      ...amenityRefs.current,
      ...pkgCardRefs.current,
    ].filter(Boolean) as Element[];
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main id="main" style={{ background: C.bg }}>

      {/* ── HERO — real photo background, calendar always visible ── */}
      <div
        style={{
          position: "relative",
          minHeight: mob ? "auto" : "100vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: mob ? "40px 20px 40px" : "48px 40px 56px",
        }}
      >
        {/* Photo background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${HERO_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center 60%",
          }}
        />
        {/* Legibility overlay — same gold-tinted dark tone as the rest of the design system */}
        <div style={{ position: "absolute", inset: 0, background: isDark ? "linear-gradient(180deg,rgba(6,5,3,0.72) 0%,rgba(6,5,3,0.45) 35%,rgba(6,5,3,0.6) 70%,rgba(4,3,2,0.92) 100%)" : "linear-gradient(180deg,rgba(10,7,3,0.62) 0%,rgba(10,7,3,0.38) 35%,rgba(10,7,3,0.55) 70%,rgba(8,6,3,0.88) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%,transparent 40%,rgba(0,0,0,0.35) 100%)" }} />

        {/* Gold accent lines — unchanged from the existing system */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent 0%,${gold}88 30%,${gold} 50%,${gold}88 70%,transparent 100%)` }} />

        {/* Heading */}
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 720, width: "100%", marginTop: mob ? 8 : 24 }}>
          <h1
            className="hero-title sw-hero-title"
            style={{ fontFamily: serif, fontSize: mob ? 44 : tab ? 64 : 82, color: "#fff", lineHeight: 1.04, margin: "0 0 22px", fontWeight: 400, letterSpacing: "-1px", textShadow: "0 2px 30px rgba(0,0,0,0.45)" }}
          >
            Where Stone<br />
            <span className="sw-hero-gold-text" style={{ fontStyle: "italic" }}>Meets the Woods</span>
          </h1>

          <p className="hero-sub" style={{ color: "rgba(246,241,232,0.94)", fontSize: mob ? 15 : 18, maxWidth: 520, margin: "0 auto", lineHeight: 1.8, fontWeight: 300, textShadow: "0 1px 16px rgba(0,0,0,0.4)" }}>
            An exclusive private resort experience crafted for those who seek luxury, privacy, and nature.
          </p>
        </div>

        {/* ── Inline booking panel — calendar is visible immediately, no click required ── */}
        <div
          className="hero-card sw-hero-card-float"
          style={{
            position: "relative",
            zIndex: 3,
            marginTop: mob ? 28 : 34,
            width: "100%",
            maxWidth: 900,
            background: isDark ? "rgba(6,5,3,0.72)" : "rgba(10,7,3,0.72)",
            border: `1px solid rgba(201,168,76,${isDark ? "0.28" : "0.4"})`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 16,
            padding: mob ? "22px 18px" : "30px 34px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ display: "flex", flexDirection: mob ? "column" : "row", gap: mob ? 20 : 32, alignItems: mob ? "stretch" : "flex-start" }}>

            {/* Left: one instruction, then supporting detail — the calendar is the action */}
            <div style={{ flex: mob ? "none" : "0 0 250px" }}>
              <p style={{ color: gold, fontSize: 11, letterSpacing: 3, marginBottom: 12, fontWeight: 500 }}>RESERVATIONS</p>
              <h2 style={{ fontFamily: serif, fontSize: mob ? 26 : 30, color: "#fff", fontWeight: 400, marginBottom: 14, lineHeight: 1.18, letterSpacing: "-0.3px" }}>
                Select a date to begin
              </h2>
              <p style={{ color: "rgba(238,232,220,0.72)", fontSize: 13.5, lineHeight: 1.75, marginBottom: 22 }}>
                Green dates are open. Choosing one takes you straight into booking.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 18, borderTop: "1px solid rgba(201,168,76,0.22)" }}>
                {[["Resort hours", "7:00 AM – 5:00 PM"], ["Base rate", `${fmt(6000)} /day`]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(238,232,220,0.6)" }}>
                    <span>{l}</span>
                    <span style={{ color: gold, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Secondary paths — present, but visibly subordinate */}
              <div style={{ display: "flex", gap: 18, marginTop: 20, flexWrap: "wrap" }}>
                {[["Browse rooms", "Rooms"], ["Manage booking", "Cancel Booking"]].map(([label, target]) => (
                  <button
                    key={target}
                    onClick={() => setPage(target)}
                    style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      color: "rgba(238,232,220,0.72)", fontSize: 12, letterSpacing: 0.4,
                      borderBottom: "1px solid rgba(201,168,76,0.4)", paddingBottom: 2,
                      transition: "color .2s ease, border-color .2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = gold; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(238,232,220,0.72)"; e.currentTarget.style.borderColor = "rgba(201,168,76,0.4)"; }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: the calendar itself — always rendered, never hidden behind a click */}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <AvailabilityCalendar
                bookings={bookings}
                closedDates={closedDates}
                onSelectDate={(ds) => onBookWithDate(ds)}
              />
            </div>
          </div>
        </div>

        {/* Amenity pills */}
      </div>

      {/* ── PACKAGES — click a card to expand it at centre screen ── */}
      <div style={{ background: isDark ? "#080604" : "#f7f2ea", padding: mob ? "52px 20px" : "88px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          <div ref={pkgHeaderRef} className="sw-reveal" style={{ textAlign: "center", marginBottom: mob ? 32 : 44 }}>
            <p style={eyebrow}>Packages</p>
            <h2 className="sw-section-title" style={{ ...h2, marginBottom: 16 }}>
              Choose Your Stay
            </h2>
            <p style={{ ...lede, maxWidth: 520, margin: "0 auto" }}>
              Eight configurations across rooms and pools. Select a package to see the full details.
            </p>
          </div>

          {/* Duration windows */}
          <div
            ref={pkgDurationRef}
            className="sw-reveal"
            style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: mob ? 28 : 40 }}
          >
            {DURATIONS.map((d) => (
              <div key={d.label} style={{ background: C.bgCard2, padding: mob ? "18px 20px" : "22px 24px", textAlign: "center" }}>
                <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2.5, marginBottom: 7 }}>{d.label.toUpperCase()}</div>
                <div style={{ color: gold, fontSize: mob ? 14 : 15, fontWeight: 500, letterSpacing: 0.3 }}>{d.window}</div>
              </div>
            ))}
          </div>

          {/* Package cards — split into shared and exclusive groups */}
          {PACKAGE_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : (mob ? 30 : 40) }}>

            {/* Group divider — same treatment as AVAILABLE ADD-ONS below */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: mob ? 14 : 18 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, whiteSpace: "nowrap" }}>{group.label}</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : tab ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: mob ? 10 : 14 }}>
            {group.tiers.map(({ p, i }, gIdx) => {
              const exclusive = p.status === "Exclusive";
              return (
                <div
                  key={p.code}
                  ref={(el) => { pkgCardRefs.current[i] = el; }}
                  className="sw-card sw-reveal"
                  onClick={() => openPkg(i)}
                  style={{
                    background: C.bgCard2,
                    border: `1px solid ${exclusive ? `${gold}44` : C.border}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: C.shadowCard,
                    transitionDelay: `${gIdx * 50}ms`,
                  }}
                  onMouseEnter={(e) => {
                    const img = e.currentTarget.querySelector(".sw-pkg-img") as HTMLElement;
                    if (img) img.style.transform = "scale(1.07)";
                  }}
                  onMouseLeave={(e) => {
                    const img = e.currentTarget.querySelector(".sw-pkg-img") as HTMLElement;
                    if (img) img.style.transform = "scale(1)";
                  }}
                >
                  {/* Cover photo */}
                  <div style={{ position: "relative", height: mob ? 104 : 128, overflow: "hidden", background: isDark ? "#14110d" : "#e8e0d4" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="sw-pkg-img"
                      src={p.cover}
                      alt={`Package ${p.code}`}
                      onError={(e) => {
                        // Fall back to a known-good shot rather than an empty card.
                        const img = e.currentTarget;
                        if (img.src !== RESORT_WIDE) img.src = RESORT_WIDE;
                      }}
                      style={{
                        position: "absolute", inset: 0,
                        width: "100%", height: "100%", objectFit: "cover",
                        transition: "transform .5s cubic-bezier(.22,1,.36,1)",
                      }}
                    />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.15) 60%,transparent 100%)" }} />

                    {/* Photo count */}
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", borderRadius: 20, padding: "3px 8px" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: 600 }}>{p.rooms + p.pools}</span>
                    </div>

                    {/* Code over the photo */}
                    <div style={{ position: "absolute", bottom: 8, left: 14, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 28 : 34, color: "#fff", lineHeight: 1, fontWeight: 400, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
                      {p.code}
                    </div>
                  </div>

                  {/* Top hairline — gold for exclusive tiers */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: exclusive ? `linear-gradient(to right,transparent,${gold},transparent)` : "transparent", zIndex: 2 }} />

                  <div style={{ padding: mob ? "14px 14px 16px" : "16px 18px 18px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                      <div style={{ color: C.textB, fontSize: 12 }}>{p.rooms} {p.rooms === 1 ? "Room" : "Rooms"}</div>
                      <div style={{ color: C.textB, fontSize: 12 }}>{p.pools} {p.pools === 1 ? "Pool" : "Pools"}</div>
                    </div>

                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 9,
                        letterSpacing: 1.5,
                        padding: "3px 9px",
                        borderRadius: 20,
                        background: exclusive ? `${gold}18` : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                        color: exclusive ? gold : C.textS,
                        border: `1px solid ${exclusive ? `${gold}44` : C.border}`,
                      }}
                    >
                      {p.status.toUpperCase()}
                    </span>

                    {p.note && (
                      <div style={{ color: C.textXS, fontSize: 10, marginTop: 8, letterSpacing: 0.5 }}>{p.note}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          ))}

          {/* Add-ons */}
          <div ref={pkgAddonRef} className="sw-reveal" style={{ marginTop: mob ? 28 : 40, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, whiteSpace: "nowrap" }}>AVAILABLE ADD-ONS</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              {ADDONS.map((a) => (
                <div
                  key={a}
                  style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 24, padding: "9px 20px", color: C.textB, fontSize: 13, letterSpacing: 0.3 }}
                >
                  {a}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Expanded package card — centred, blurred backdrop ── */}
      {activePkg !== null && (() => {
        const p = PACKAGE_TIERS[activePkg];
        const exclusive = p.status === "Exclusive";
        const gallery = pkgGallery(p.rooms, p.pools);
        const shot = gallery[Math.min(photoIdx, gallery.length - 1)];
        const step = (dir: number) => setPhotoIdx((n) => (n + dir + gallery.length) % gallery.length);
        return (
          <div
            onClick={closePkg}
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: mob ? 18 : 24,
              background: isDark ? "rgba(4,3,2,0.55)" : "rgba(20,14,6,0.45)",
              backdropFilter: `blur(${pkgShown ? 10 : 0}px)`,
              WebkitBackdropFilter: `blur(${pkgShown ? 10 : 0}px)`,
              opacity: pkgShown ? 1 : 0,
              transition: "opacity .22s ease, backdrop-filter .22s ease",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 480,
                maxHeight: "90vh",
                overflowY: "auto",
                background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
                border: `1px solid ${exclusive ? `${gold}55` : C.border}`,
                borderRadius: 18,
                boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
                transform: pkgShown ? "scale(1) translateY(0)" : "scale(0.94) translateY(12px)",
                opacity: pkgShown ? 1 : 0,
                transition: "transform .28s cubic-bezier(.22,1,.36,1), opacity .22s ease",
              }}
            >
              <button
                onClick={closePkg}
                aria-label="Close package details"
                style={{
                  position: "absolute", top: 14, right: 14, zIndex: 4,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
                  border: "none", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>

              {/* ── Gallery ── */}
              <div style={{ position: "relative", height: mob ? 230 : 280, overflow: "hidden", background: "#0a0806" }}>
                {gallery.map((g, gi) => (
                  <div
                    key={g.label}
                    style={{
                      position: "absolute", inset: 0,
                      backgroundImage: `url(${g.src})`,
                      backgroundSize: "cover", backgroundPosition: "center",
                      opacity: gi === photoIdx ? 1 : 0,
                      transition: "opacity .35s ease",
                    }}
                  />
                ))}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.2) 55%,rgba(0,0,0,0.3) 100%)" }} />

                {/* Prev / next */}
                {gallery.length > 1 && (
                  <>
                    <button
                      onClick={() => step(-1)}
                      aria-label="Previous photo"
                      style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        width: 34, height: 34, borderRadius: "50%",
                        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)",
                        border: `1px solid ${gold}44`, color: gold, fontSize: 17, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3,
                      }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => step(1)}
                      aria-label="Next photo"
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        width: 34, height: 34, borderRadius: "50%",
                        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)",
                        border: `1px solid ${gold}44`, color: gold, fontSize: 17, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3,
                      }}
                    >
                      ›
                    </button>
                  </>
                )}

                {/* Counter */}
                <div style={{ position: "absolute", top: 16, left: 16, zIndex: 3, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", borderRadius: 20, padding: "4px 10px", color: "rgba(255,255,255,0.8)", fontSize: 10, letterSpacing: 1.5, fontFamily: "monospace" }}>
                  {String(photoIdx + 1).padStart(2, "0")} / {String(gallery.length).padStart(2, "0")}
                </div>

                {/* Code + current photo label */}
                <div style={{ position: "absolute", bottom: 14, left: 20, right: 20, zIndex: 3 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ color: gold, fontSize: 9, letterSpacing: 3, marginBottom: 4 }}>PACKAGE</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 42 : 50, color: "#fff", lineHeight: 1, fontWeight: 400, textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
                        {p.code}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: gold, fontSize: 9, letterSpacing: 2, marginBottom: 3 }}>{shot.kind.toUpperCase()}</div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 12 }}>{shot.label}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thumbnail strip */}
              {gallery.length > 1 && (
                <div style={{ display: "flex", gap: 6, padding: mob ? "12px 20px 0" : "14px 32px 0", overflowX: "auto" }}>
                  {gallery.map((g, gi) => (
                    <button
                      key={g.label}
                      onClick={() => setPhotoIdx(gi)}
                      aria-label={`View ${g.label}`}
                      style={{
                        flexShrink: 0,
                        width: 52, height: 40, borderRadius: 6,
                        backgroundImage: `url(${g.src})`,
                        backgroundSize: "cover", backgroundPosition: "center",
                        border: `2px solid ${gi === photoIdx ? gold : "transparent"}`,
                        opacity: gi === photoIdx ? 1 : 0.5,
                        cursor: "pointer", padding: 0,
                        transition: "opacity .2s, border-color .2s",
                      }}
                    />
                  ))}
                </div>
              )}

              <div style={{ padding: mob ? "22px 24px 30px" : "26px 36px 36px" }}>

              {/* Status */}
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <span
                  style={{
                    display: "inline-block", fontSize: 9, letterSpacing: 2, padding: "4px 12px", borderRadius: 20,
                    background: exclusive ? `${gold}18` : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                    color: exclusive ? gold : C.textS,
                    border: `1px solid ${exclusive ? `${gold}44` : C.border}`,
                  }}
                >
                  {p.status.toUpperCase()}{p.note ? ` · ${p.note.toUpperCase()}` : ""}
                </span>
              </div>

              {/* Inclusions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
                {[
                  ["ROOMS", `${p.rooms}`],
                  ["POOLS", `${p.pools}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: isDark ? "#0b0a07" : "#faf7f2", padding: "18px 14px", textAlign: "center" }}>
                    <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>{l}</div>
                    <div style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 26, fontWeight: 400 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Duration windows */}
              <div style={{ marginBottom: 22 }}>
                <p style={{ color: C.textXS, fontSize: 9, letterSpacing: 2.5, marginBottom: 12 }}>AVAILABLE DURATIONS</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {DURATIONS.map((d) => (
                    <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 9, borderBottom: `1px solid ${C.borderLight}` }}>
                      <span style={{ color: C.textB, fontSize: 13 }}>{d.label}</span>
                      <span style={{ color: gold, fontSize: 12, fontWeight: 500 }}>{d.window}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add-ons */}
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 9, letterSpacing: 2.5, marginBottom: 12 }}>ADD-ONS</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ADDONS.map((a) => (
                    <span key={a} style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 14px", color: C.textB, fontSize: 12 }}>
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              <button
                className="sw-btn"
                onClick={() => { closePkg(); setPage("Book Now"); }}
                style={{ ...goldBtn, width: "100%", padding: "14px 20px", letterSpacing: 1.5, fontSize: 12, borderRadius: 8 }}
              >
                BOOK PACKAGE {p.code} →
              </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── RATES & FACILITIES (unchanged) ── */}
      <div style={{ background: isDark ? "#0a0806" : "#fdf9f4", padding: mob ? "52px 20px" : "88px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
          <div ref={ratesHeaderRef} className="sw-reveal">
            <p style={eyebrow}>What&rsquo;s Included</p>
            <h2 className="sw-section-title" style={{ ...h2, marginBottom: 16 }}>Day Tour &amp; Room Add-ons</h2>
            <p style={{ ...lede, marginBottom: 52, maxWidth: 520, margin: "0 auto 52px" }}>Base pricing before package configuration. Every reservation starts here.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 48, maxWidth: 900, margin: "0 auto 48px" }}>
            {PACKAGES.map((p, i) => (
              <div key={p.id} ref={(el) => { packageRefs.current[i] = el; }} className="sw-card sw-reveal"
                style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: mob ? "22px 18px" : "28px 24px", textAlign: "left", boxShadow: C.shadowCard, display: "flex", flexDirection: "column", transitionDelay: `${i * 100}ms` }}>
                <div style={{ fontSize: 30, marginBottom: 12 }}>{p.icon}</div>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, marginBottom: 6 }}>{p.label}</h3>
                <p style={{ color: C.textS, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>{p.desc}</p>
                <div style={{ color: gold, fontSize: 24, fontWeight: 700, marginBottom: 16 }}>{fmt(p.base)}<span style={{ color: C.textXS, fontSize: 12 }}> /day</span></div>
                {p.details.map((d) => (
                  <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                    <span style={{ color: gold, fontSize: 10, marginTop: 2, flexShrink: 0 }}>✓</span>
                    <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.5 }}>{d}</span>
                  </div>
                ))}
                {p.id === "room" && (
                  <button className="sw-btn" onClick={() => setPage("Rooms")} style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg,#c9a84c,#e8c56a)", color: "#1a1000", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1.5, boxShadow: "0 2px 12px rgba(201,168,76,0.3)", width: "100%" }}>
                    <span>🛏</span> VIEW ROOMS
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <p style={{ color: C.textXS, fontSize: 13, marginTop: 8, lineHeight: 1.8 }}>All bookings require a 50% down payment. No refunds. Rescheduling subject to discussion.</p>
        </div>
      </div>

      {/* ── OUR SERVICES — clean line-icon row ── */}
      <div style={{ background: isDark ? "#0b0907" : "#ffffff", padding: mob ? "60px 20px" : "104px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          <div ref={amenitiesDivRef} className="sw-reveal" style={{ textAlign: "center", marginBottom: mob ? 44 : 64 }}>
            <p style={eyebrow}>Our Services</p>
            <h2 style={h2}>Resort Facilities</h2>
          </div>

          <div
            ref={(el) => { amenityRefs.current[0] = el; }}
            className="sw-reveal"
            style={{
              display: "grid",
              gridTemplateColumns: mob ? "repeat(2,1fr)" : tab ? "repeat(3,1fr)" : "repeat(6,1fr)",
              gap: mob ? "36px 16px" : 20,
            }}
          >
            {SERVICES.map((s) => (
              <div key={s.name} style={{ textAlign: "center" }}>
                <svg
                  width="38"
                  height="38"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textH}
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ margin: "0 auto 18px", display: "block", opacity: 0.85 }}
                  aria-hidden="true"
                >
                  {s.icon}
                </svg>
                <div style={{ fontFamily: serif, fontSize: mob ? 15 : 17, color: C.textH, fontWeight: 400, lineHeight: 1.35 }}>
                  {s.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TESTIMONIALS — infinite marquee (unchanged) ── */}
      <div style={{ background: isDark ? "#080604" : "#f5f0e8", padding: mob ? "52px 0" : "88px 0", overflow: "hidden" }}>
        <div ref={testimonyHeaderRef} className="sw-reveal" style={{ textAlign: "center", marginBottom: mob ? 44 : 60, padding: "0 20px" }}>
          <p style={eyebrow}>Testimonials</p>
          <h2 style={h2}>What Our Guests Say</h2>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right,${isDark ? "#080604" : "#f5f0e8"},transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to left,${isDark ? "#080604" : "#f5f0e8"},transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div className="sw-marquee-track">
            {[...MARQUEE_REVIEWS, ...MARQUEE_REVIEWS].map((r, i) => (
              <div key={i} style={{ flexShrink: 0, width: mob ? 280 : 330, marginRight: 16, background: isDark ? "#0e0c09" : "#fff", border: `1px solid ${isDark ? "rgba(201,168,76,0.1)" : "rgba(201,168,76,0.15)"}`, borderRadius: 12, padding: "26px 24px", boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.35)" : "0 4px 16px rgba(100,70,20,0.08)" }}>
                <p style={{ color: C.textB, fontSize: 15, lineHeight: 1.85, margin: "0 0 16px", fontStyle: "italic", fontFamily: serif }}>&ldquo;{r.message}&rdquo;</p>
                <span style={{ color: gold, fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>— {r.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CLOSING CTA — gives the most engaged visitor somewhere to go ── */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: mob ? "72px 20px" : "112px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${RESORT_WIDE})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(6,5,3,0.82),rgba(6,5,3,0.9))" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}66,transparent)` }} />

        <div ref={closingRef} className="sw-reveal" style={{ position: "relative", zIndex: 2, maxWidth: 620, margin: "0 auto" }}>
          <p style={{ ...eyebrow, marginBottom: 18 }}>Angono, Rizal</p>
          <h2 style={{ ...h2, color: "#fff", marginBottom: 20 }}>
            The resort is yours<br />for the day
          </h2>
          <p style={{ color: "rgba(238,232,220,0.78)", fontSize: mob ? 14 : 16, lineHeight: 1.85, fontWeight: 300, marginBottom: 34 }}>
            Check an open date and reserve in a few minutes.
          </p>
          <button
            className="sw-btn"
            onClick={() => setPage("Book Now")}
            style={{ ...goldBtn, padding: mob ? "15px 34px" : "17px 46px", fontSize: 12.5, letterSpacing: 2.5, borderRadius: 8 }}
          >
            BOOK YOUR STAY
          </button>
        </div>
      </div>
    </main>
  );
}