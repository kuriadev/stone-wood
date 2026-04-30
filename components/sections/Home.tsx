"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { PACKAGES, AMENITIES } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { Stars } from "@/components/common/Stars";
import { AvailabilityCalendar } from "@/components/common/AvailabilityCalendar";
import type { Booking } from "@/types/booking";
import type { Review } from "@/types/review";

interface HomeProps {
  setPage: (p: string) => void;
  onBookWithDate: (d: string) => void;
  bookings: Booking[];
  closedDates: string[];
  reviews: Review[];
}

const AMENITY_DETAILS = [
  {
    icon: "🏊", name: "Swimming Pool",
    shortDesc: "Crystal-clear pool for up to 30 guests.",
    desc: "Our private pool is exclusively yours for the entire day — no sharing, no strangers. Perfect for families, teams, and celebrations.",
    image: "https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=796&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    videoUrl: "https://www.youtube.com/embed/ohPMoM6YSco?si=TZcRxeLwgVwwJF9z",
    bullets: ["Full-day exclusive use 8AM–5PM", "Capacity up to 30 guests included", "Clean filtered water daily", "Poolside seating & loungers provided"],
  },
  {
    icon: "🔥", name: "BBQ / Grilling Area",
    shortDesc: "Open-air grilling stations for groups.",
    desc: "Our open-air BBQ pavilion is set up for serious group cookouts. Bring your own ingredients or hire a catering service.",
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
    videoUrl: "https://www.youtube.com/embed/PFDvHizk140?si=i4RsnMBRrFJDqtfa",
    bullets: ["Multiple gas and charcoal grill stations", "Covered dining pavilion nearby", "Long tables and benches included", "String-lit ambient evening setup"],
  },
  {
    icon: "🎱", name: "Billiards",
    shortDesc: "Mahogany hall with regulation pool tables.",
    desc: "Enjoy a proper billiards lounge with regulation-size tables — great for friendly competition between guests.",
    image: "https://images.unsplash.com/photo-1575553939928-d03b21323afe?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    videoUrl: "https://www.youtube.com/embed/DHrHi-fd_Aw?si=Py1YSsXaCU_pYjJD",
    bullets: ["2 regulation-size billiards tables", "Cues, chalk, and racks provided", "Air-conditioned indoor space", "Available all day at no extra charge"],
  },
  {
    icon: "🎤", name: "Karaoke / Videoke",
    shortDesc: "Private suite with neon ambience and pro audio.",
    desc: "Belt out your favorites in our private videoke room with full sound system, microphones, and thousands of songs.",
    image: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80",
    videoUrl: "https://www.youtube.com/embed/iPy2YPjlrrY?si=UOVAA0ge_GSamyJq",
    bullets: ["Thousands of Filipino & English songs", "Pro audio system with sub-woofer", "Neon-lit private room", "Wireless microphones included"],
  },
  {
    icon: "🚗", name: "Parking Area",
    shortDesc: "Spacious, secure, shaded parking.",
    desc: "Worry-free parking for all your guests. Our secure on-site lot accommodates multiple vehicles.",
    image: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&q=80",
    videoUrl: "https://www.youtube.com/embed/OBgsPn-bLeM?si=3Tpc2XN-rEXICG6T",
    bullets: ["Secure on-site parking lot", "Accommodates 10+ vehicles", "Well-lit and monitored area", "Free for all guests"],
  },
  {
    icon: "❄️", name: "Air-Conditioned Rooms",
    shortDesc: "Air-conditioned space for rest and comfort.",
    desc: "A private, fully air-conditioned room where guests can relax, cool down, or take a break between activities.",
    image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1169&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    videoUrl: "https://www.youtube.com/embed/fPMsAIld9Ss?si=5KHW4Flc0n6bat1C",
    bullets: ["Fully air-conditioned for maximum comfort", "Ideal for resting, naps, or small group use", "Quiet and private indoor space", "Perfect break area from outdoor activities"],
  },
];

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

export function Home({ setPage, onBookWithDate, bookings, closedDates, reviews }: HomeProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;
  const [checkDate, setCheckDate] = useState("");
  const [showCal, setShowCal] = useState(false);
  const [activeAmenity, setActiveAmenity] = useState<number | null>(null);

  // ── Close modal on ESC ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveAmenity(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "—";

  const fmtD = (ds: string) => {
    if (!ds) return "Select a date";
    const [y, m, d] = ds.split("-");
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-PH", {
      month: "long", day: "numeric", year: "numeric",
    });
  };

  // ── Scroll-reveal refs ──────────────────────────────────────────────────────
  const ratesHeaderRef    = useRef<HTMLDivElement>(null);
  const amenitiesDivRef   = useRef<HTMLDivElement>(null);
  const testimonyHeaderRef= useRef<HTMLDivElement>(null);
  const packageRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const amenityRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const reviewRefs        = useRef<(HTMLDivElement | null)[]>([]);

  // ── IntersectionObserver ────────────────────────────────────────────────────
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
      ...packageRefs.current,
      ...amenityRefs.current,
      ...reviewRefs.current,
    ].filter(Boolean) as Element[];

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ background: C.bg }}>
      {/* ── HERO ── */}
      <div
        style={{
          position: "relative",
          minHeight: mob ? "90vh" : "100vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: mob ? "0 24px 48px" : "0 40px 60px",
        }}
      >
        {/* Dark background */}
        {isDark && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#070604 0%,#0e0b06 50%,#080603 100%)" }} />
            <div style={{ position: "absolute", top: "-10%", left: "35%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(201,168,76,0.13) 0%,rgba(180,140,50,0.05) 50%,transparent 72%)", animation: "heroOrb1 14s ease-in-out infinite", filter: "blur(2px)" }} />
            <div style={{ position: "absolute", bottom: "-5%", right: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(160,110,30,0.12) 0%,rgba(120,80,15,0.04) 55%,transparent 72%)", animation: "heroOrb2 18s ease-in-out infinite", filter: "blur(4px)" }} />
            <div style={{ position: "absolute", top: "30%", left: "-8%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle,rgba(100,65,10,0.1) 0%,transparent 65%)", animation: "heroOrb3 22s ease-in-out infinite", filter: "blur(6px)" }} />
            <div style={{ position: "absolute", top: 0, left: "-20%", width: "60%", height: "100%", background: "linear-gradient(105deg,transparent 40%,rgba(201,168,76,0.03) 55%,transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(to top,rgba(4,3,2,0.75),transparent)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "25%", background: "linear-gradient(to bottom,rgba(4,3,2,0.5),transparent)" }} />
            <div style={{ position: "absolute", inset: 0, opacity: 0.028, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "180px" }} />
          </>
        )}
        {/* Light background */}
        {!isDark && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1c1308 0%,#2e1e0a 45%,#160e05 100%)" }} />
            <div style={{ position: "absolute", top: "-8%", left: "30%", width: 680, height: 680, borderRadius: "50%", background: "radial-gradient(circle,rgba(220,180,80,0.2) 0%,rgba(200,155,55,0.08) 48%,transparent 70%)", animation: "heroOrb1 14s ease-in-out infinite", filter: "blur(2px)" }} />
            <div style={{ position: "absolute", bottom: "-5%", right: "-8%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle,rgba(190,135,40,0.18) 0%,rgba(160,110,25,0.06) 52%,transparent 72%)", animation: "heroOrb2 18s ease-in-out infinite", filter: "blur(4px)" }} />
            <div style={{ position: "absolute", top: "25%", left: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(160,105,20,0.14) 0%,transparent 65%)", animation: "heroOrb3 22s ease-in-out infinite", filter: "blur(6px)" }} />
            <div style={{ position: "absolute", top: 0, left: "-15%", width: "65%", height: "100%", background: "linear-gradient(108deg,transparent 38%,rgba(220,175,70,0.06) 54%,transparent 68%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(to top,rgba(12,8,2,0.6),transparent)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "22%", background: "linear-gradient(to bottom,rgba(12,8,2,0.45),transparent)" }} />
            <div style={{ position: "absolute", inset: 0, opacity: 0.035, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "180px" }} />
          </>
        )}
        {/* Gold accent lines */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent 0%,${gold}88 30%,${gold} 50%,${gold}88 70%,transparent 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}33,transparent)` }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 700, width: "100%" }}>
          <div className="hero-tag" style={{ display: "inline-flex", alignItems: "center", gap: 14, marginBottom: mob ? 24 : 36 }}>
            <div style={{ width: 32, height: 1, background: `linear-gradient(to right,transparent,${gold})`, opacity: 0.9 }} />
            <span style={{ color: gold, letterSpacing: mob ? 3 : 5, fontSize: mob ? 11 : 12, fontWeight: 500, textTransform: "uppercase" }}>Private Resort · Angono, Rizal</span>
            <div style={{ width: 32, height: 1, background: `linear-gradient(to left,transparent,${gold})`, opacity: 0.9 }} />
          </div>

          <h1
            className="hero-title sw-hero-title"
            style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 42 : tab ? 62 : 80, color: "#f8f4ee", lineHeight: 1.06, margin: "0 0 24px", fontWeight: 400, letterSpacing: "-0.5px" }}
          >
            Where Stone<br />
            <span className="sw-hero-gold-text" style={{ fontStyle: "italic" }}>
              Meets the Woods
            </span>
          </h1>

          <div className="hero-sub" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            <div className="sw-hero-divider-line" style={{ width: 40, height: 1, background: `linear-gradient(to right,transparent,${gold}66)` }} />
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: gold, opacity: 0.6 }} />
            <div className="sw-hero-divider-line" style={{ width: 40, height: 1, background: `linear-gradient(to left,transparent,${gold}66)` }} />
          </div>

          <p className="hero-sub" style={{ color: "rgba(240,232,215,0.88)", fontSize: mob ? 15 : 17, maxWidth: 460, margin: "0 auto", lineHeight: 1.9, marginBottom: mob ? 36 : 52, fontWeight: 300, letterSpacing: "0.2px" }}>
            An exclusive private resort experience crafted for those who seek luxury, privacy, and nature.
          </p>

          {/* Booking card */}
          <div
            className="hero-card sw-hero-card-float"
            style={{
              background: isDark ? "rgba(5,4,2,0.86)" : "rgba(14,9,3,0.84)",
              border: `1px solid rgba(201,168,76,${isDark ? "0.3" : "0.42"})`,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRadius: 12,
              padding: mob ? "20px 18px" : "30px 34px",
              display: "flex",
              flexDirection: mob ? "column" : "row",
              gap: 16,
              alignItems: mob ? "stretch" : "flex-end",
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              position: "relative",
              zIndex: 10,
              boxShadow: isDark ? "0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(201,168,76,0.06)" : "0 32px 80px rgba(0,0,0,0.55),0 0 0 1px rgba(201,168,76,0.1)",
            }}
          >
            <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: `linear-gradient(to right,transparent,${gold}55,transparent)`, borderRadius: 1 }} />
            <div style={{ flex: 1 }}>
              <label style={{ color: gold, fontSize: 11, letterSpacing: 2, display: "block", marginBottom: 8, fontWeight: 600, opacity: 0.95 }}>RESERVATION DATE</label>
              <div onClick={() => setShowCal(s => !s)} style={{ background: "rgba(255,255,255,0.06)", color: checkDate ? "#f0ede6" : "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.1)", padding: "13px 16px", fontSize: 14, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none", transition: "border-color .2s,background .2s" }}
                onMouseEnter={(e) => {
                const img = e.currentTarget.querySelector(".sw-amenity-img") as HTMLElement;
                if (img) img.style.transform = "scale(1.06)";

                const overlay = e.currentTarget.querySelector(".sw-amenity-overlay") as HTMLElement;
                if (overlay) {
                  overlay.style.background = `
                    radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 100%),
                    linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)
                  `;
                }
              }}
                onMouseLeave={(e) => {
                const img = e.currentTarget.querySelector(".sw-amenity-img") as HTMLElement;
                if (img) img.style.transform = "scale(1)";

                const overlay = e.currentTarget.querySelector(".sw-amenity-overlay") as HTMLElement;
                if (overlay) {
                  overlay.style.background = `
                    radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%),
                    linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)
                  `;
                }
              }}
              >
                <span>{fmtD(checkDate)}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </div>
            </div>
            <button className="sw-btn sw-hero-cta-glow" onClick={() => checkDate ? onBookWithDate(checkDate) : setPage("Book Now")} style={{ ...goldBtn, padding: "14px 26px", whiteSpace: "nowrap", letterSpacing: 2, fontSize: 12, borderRadius: 7 }}>
              CHECK & BOOK
            </button>
          </div>

          {showCal && (
            <>
              <div onClick={() => setShowCal(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
              <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 999 }}>
                <AvailabilityCalendar bookings={bookings} closedDates={closedDates} onSelectDate={(ds) => { setCheckDate(ds); setShowCal(false); }} selectedDate={checkDate} />
              </div>
            </>
          )}

          {/* Amenity pills — staggered entry */}
          <div className="hero-pills" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: mob ? 8 : 12, marginTop: mob ? 24 : 32, flexWrap: "wrap" }}>
            {[["🏊", "Private Pool"], ["🔥", "BBQ Area"], ["🎱", "Billiards"], ["🎤", "Videoke"],["❄️", "Rooms"]].map(([icon, label]) => (
              <div
                key={label}
                className="sw-hero-pill"
                style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.22)", borderRadius: 24, padding: "8px 16px", backdropFilter: "blur(8px)", transition: "background .2s,border-color .2s,transform .2s cubic-bezier(.22,1,.36,1)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.15)"; e.currentTarget.style.borderColor = "rgba(201,168,76,0.4)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.08)"; e.currentTarget.style.borderColor = "rgba(201,168,76,0.22)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ color: "rgba(240,230,210,0.92)", fontSize: mob ? 12 : 13, letterSpacing: 0.5, fontWeight: 400 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>


      </div>

      {/* ── RATES & FACILITIES ── */}
      <div style={{ background: isDark ? "#0a0806" : "#fdf9f4", padding: mob ? "52px 20px" : "88px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>

          {/* Section header — scroll reveal */}
          <div ref={ratesHeaderRef} className="sw-reveal">
            <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10 }}>RATES & FACILITIES</p>
            <h2 className="sw-section-title" style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 26 : 38, color: C.textH, marginBottom: 12 }}>Pricing & Resort Amenities</h2>
            <p style={{ color: C.textS, fontSize: 13, marginBottom: 44, maxWidth: 500, margin: "0 auto 44px" }}>Everything included for your perfect day at StoneWood.</p>
          </div>

          {/* Package cards — staggered reveal */}
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 48, maxWidth: 900, margin: "0 auto 48px" }}>
            {PACKAGES.map((p, i) => (
              <div
                key={p.id}
                ref={(el) => { packageRefs.current[i] = el; }}
                className="sw-card sw-reveal"
                style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: mob ? "22px 18px" : "28px 24px", textAlign: "left", boxShadow: C.shadowCard, display: "flex", flexDirection: "column", transitionDelay: `${i * 100}ms` }}
              >
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

          {/* Amenities divider — scroll reveal */}
          <div ref={amenitiesDivRef} className="sw-reveal" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44, maxWidth: 1100, margin: "0 auto 44px" }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, whiteSpace: "nowrap" }}>INCLUDED AMENITIES</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Amenity bento grid — click to open video modal */}
          <div
            ref={(el) => { amenityRefs.current[0] = el; }}
            className="sw-reveal"
            style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: mob? "1fr": tab? "1fr 1fr": "repeat(3,1fr)", gridTemplateRows: "auto", gap: 12 }}
          >
            {AMENITY_DETAILS.map((a, i) => (
              <div
                key={a.name}
                onClick={() => setActiveAmenity(i)}
                style={{
                position: "relative",
                borderRadius: 14,
                overflow: "hidden",
                cursor: "pointer",

                // PERFECT HEIGHT SYSTEM (no gaps)
                height: mob
                  ? 180
                  : tab
                  ? i === 1
                    ? 240
                    : 180
                  : i === 1
                  ? 280 // BBQ (top right)
                  : i === 0
                  ? 280 + 200 + 12 // Swimming = BBQ + middle row + gap
                  : i === 5
                  ? 200 // Rooms
                  : 200, // others

                // GRID POSITIONING
                gridColumn:
                  mob
                    ? undefined
                    : tab
                    ? i === 1
                      ? "1 / span 2" // BBQ full width tablet
                      : undefined
                    : i === 1
                    ? "2 / span 2" // BBQ wide
                    : i === 5
                    ? "2 / span 2" // Rooms wide bottom
                    : undefined,

                gridRow:
                  mob
                    ? undefined
                    : tab
                    ? undefined
                    : i === 0
                    ? "1 / span 2" // Swimming spans 2 rows
                    : undefined,

                transitionProperty: "all",
                transitionDuration: ".35s",
                transitionTimingFunction: "cubic-bezier(.22,1,.36,1)",

              }}
                onMouseEnter={(e) => { const img = e.currentTarget.querySelector(".sw-amenity-img") as HTMLElement; if (img) img.style.transform = "scale(1.06)"; const play = e.currentTarget.querySelector(".sw-play-btn") as HTMLElement; if (play) play.style.opacity = "1"; }}
                onMouseLeave={(e) => { const img = e.currentTarget.querySelector(".sw-amenity-img") as HTMLElement; if (img) img.style.transform = "scale(1)"; const play = e.currentTarget.querySelector(".sw-play-btn") as HTMLElement; if (play) play.style.opacity = "0"; }}
              >
                {/* Background photo */}
                <div
                  className="sw-amenity-img"
                  style={{ position: "absolute", inset: 0, backgroundImage: `url(${a.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform .5s cubic-bezier(.22,1,.36,1)" }}
                />
                {/* Dark gradient overlay */}
                <div
                className="sw-amenity-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `
                    radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%),
                    linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)
                  `,
                  transition: "opacity .35s ease, background .35s ease",
                }}
              />
            {/* Play button */}
              <div
                className="sw-play-btn"
                style={{
                  position: "absolute",
                  top: "45%", // (fixes alignment feel)
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  
                  background: "rgba(255,255,255,0.12)", 
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  
                  opacity: 0,
                  transition: "all 0.3s ease",
                  zIndex: 3
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="white" 
                  style={{ marginLeft: 2 }} 
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
                {/* Icon + name + desc */}
                <div style={{ position: "absolute", bottom: 14, left: 16, right: 16 }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{a.icon}</div>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{a.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 1.5 }}>{a.shortDesc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Amenity Video Modal */}
          {activeAmenity !== null && (
            <div
              onClick={() => { setActiveAmenity(null); }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: mob ? 12 : 24 }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ background: isDark ? "#0e0c09" : "#fff", borderRadius: 16, overflow: "hidden", width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: mob ? "column" : "row", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}
              >
                {/* Video side */}
                <div style={{ flex: mob ? "none" : "0 0 55%", background: "#000", position: "relative", aspectRatio: mob ? "16/9" : undefined, height: mob ? undefined : "auto" }}>
                  <iframe
                    src={`${AMENITY_DETAILS[activeAmenity].videoUrl}?autoplay=1&mute=1&rel=0`}
                    allow="autoplay; fullscreen"
                    style={{ width: "100%", height: mob ? "100%" : "100%", minHeight: mob ? 200 : 340, border: "none", display: "block" }}
                    title={AMENITY_DETAILS[activeAmenity].name}
                  />
                </div>

                {/* Details side */}
                <div
                  style={{
                    maxWidth: 420,
                    animation: "fadeIn 0.4s ease",
                    flex: 1,
                    padding: mob ? "22px 18px" : "36px 32px",
                    overflowY: "auto",
                    position: "relative",
                    margin: "0 auto",  
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    justifyContent: "center"
                  }}
                >
                  {/* Close Button */}
                  <button
                    onClick={() => setActiveAmenity(null)}
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      background: "rgba(255,255,255,0.06)",
                      color: "#aaa",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backdropFilter: "blur(6px)",
                      transition: "0.2s ease"
                    }}
                  >
                    ✕
                  </button>

                  {/* Content Wrapper (fix alignment + spacing) */}
                  <div style={{ maxWidth: 420 }}>
                    
                    {/* Title */}
                    <h3
                      style={{
                        color: C.textH,
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        fontSize: 24,
                        fontWeight: 500,
                        marginBottom: 10,
                        letterSpacing: "0.3px"
                      }}
                    >
                      {AMENITY_DETAILS[activeAmenity].name}
                    </h3>

                    {/* Description */}
                    <p
                      style={{
                        color: C.textS,
                        fontSize: 14,
                        lineHeight: 1.75,
                        marginBottom: 22,
                        opacity: 0.9
                      }}
                    >
                      {AMENITY_DETAILS[activeAmenity].desc}
                    </p>

                    {/* Divider (adds breathing space) */}
                    <div
                      style={{
                        height: 1,
                        background: "rgba(255,255,255,0.06)",
                        marginBottom: 18
                      }}
                    />

                    {/* Bullets */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {AMENITY_DETAILS[activeAmenity].bullets.map((b) => (
                        <div
                          key={b}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10
                          }}
                        >
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: gold,
                              marginTop: 6,
                              boxShadow: `0 0 6px ${gold}66`
                            }}
                          />
                          <span
                            style={{
                              color: C.textB,
                              fontSize: 13.5,
                              lineHeight: 1.7,
                              opacity: 0.95
                            }}
                          >
                            {b}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <p style={{ color: C.textXS, fontSize: 15, marginTop: 28 }}>All bookings require a 50% down payment. No refunds. Rescheduling subject to discussion.</p>
        </div>
      </div>

      {/* ── TESTIMONIALS — infinite marquee ── */}
      <div style={{ background: isDark ? "#080604" : "#f5f0e8", padding: mob ? "52px 0" : "88px 0", overflow: "hidden" }}>

        {/* Header */}
        <div ref={testimonyHeaderRef} className="sw-reveal" style={{ textAlign: "center", marginBottom: 48, padding: "0 20px" }}>
          <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10 }}>TESTIMONIALS</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 26 : 38, color: C.textH, marginBottom: 8 }}>What Our Guests Say</h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 0 }}>
            <Stars rating={Math.round(Number(avgRating))} size={18} />
            <span style={{ color: gold, fontSize: 16, fontWeight: 700 }}>{avgRating}</span>
          </div>
        </div>

        {/* Infinite scroll track — doubled for seamless loop */}
        <div style={{ position: "relative" }}>
          {/* Fade edges */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right,${isDark ? "#080604" : "#f5f0e8"},transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to left,${isDark ? "#080604" : "#f5f0e8"},transparent)`, zIndex: 2, pointerEvents: "none" }} />

          <div className="sw-marquee-track">
            {[...MARQUEE_REVIEWS, ...MARQUEE_REVIEWS].map((r, i) => (
              <div
                key={i}
                style={{
                  flexShrink: 0,
                  width: mob ? 260 : 300,
                  marginRight: 16,
                  background: isDark ? "#0e0c09" : "#fff",
                  border: `1px solid ${isDark ? "rgba(201,168,76,0.1)" : "rgba(201,168,76,0.15)"}`,
                  borderRadius: 12,
                  padding: "22px 20px",
                  boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.35)" : "0 4px 16px rgba(100,70,20,0.08)",
                }}
              >
                <Stars rating={r.rating} size={13} />
                <p style={{ color: C.textB, fontSize: 13, lineHeight: 1.8, margin: "10px 0 14px", fontStyle: "italic", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  &ldquo;{r.message}&rdquo;
                </p>
                <span style={{ color: gold, fontSize: 12, fontWeight: 700 }}>— {r.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
