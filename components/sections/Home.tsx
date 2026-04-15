"use client";

import { useState } from "react";
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

export function Home({ setPage, onBookWithDate, bookings, closedDates, reviews }: HomeProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;
  const [checkDate, setCheckDate] = useState("");
  const [showCal, setShowCal] = useState(false);
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
            <span style={{ color: gold, fontStyle: "italic", background: `linear-gradient(135deg,#c9a84c,#e8c97a,#c9a84c)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Meets the Woods
            </span>
          </h1>

          <div className="hero-sub" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 1, background: `linear-gradient(to right,transparent,${gold}66)` }} />
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: gold, opacity: 0.6 }} />
            <div style={{ width: 40, height: 1, background: `linear-gradient(to left,transparent,${gold}66)` }} />
          </div>

          <p className="hero-sub" style={{ color: "rgba(240,232,215,0.88)", fontSize: mob ? 15 : 17, maxWidth: 460, marginTop: 0, marginLeft: "auto", marginRight: "auto", marginBottom: mob ? 36 : 52, lineHeight: 1.9, fontWeight: 300, letterSpacing: "0.2px" }}>
            An exclusive private resort experience crafted for those who seek luxury, privacy, and nature.
          </p>

          {/* Booking card */}
          <div
            className="hero-card"
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
              <label style={{ color: gold, fontSize: 11, letterSpacing: 2, display: "block", marginBottom: 8, fontWeight: 600 }}>RESERVATION DATE</label>
              <div
                onClick={() => setShowCal((s) => !s)}
                style={{ background: "rgba(255,255,255,0.06)", color: checkDate ? "#f0ede6" : "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.1)", padding: "13px 16px", fontSize: 14, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none", transition: "border-color .2s,background .2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${gold}55`; e.currentTarget.style.background = "rgba(255,255,255,0.09)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              >
                <span>{fmtD(checkDate)}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </div>
            </div>
            <button className="sw-btn" onClick={() => checkDate ? onBookWithDate(checkDate) : setPage("Book Now")} style={{ ...goldBtn, padding: "14px 26px", whiteSpace: "nowrap", letterSpacing: 2, fontSize: 12, borderRadius: 7 }}>
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

          {/* Amenity pills */}
          <div className="hero-pills" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: mob ? 8 : 12, marginTop: mob ? 24 : 32, flexWrap: "wrap" }}>
            {[["🏊", "Private Pool"], ["🔥", "BBQ Area"], ["🎱", "Billiards"], ["🎤", "Videoke"]].map(([icon, label]) => (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.22)", borderRadius: 24, padding: "8px 16px", backdropFilter: "blur(8px)", transition: "background .2s,border-color .2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.15)"; e.currentTarget.style.borderColor = "rgba(201,168,76,0.4)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.08)"; e.currentTarget.style.borderColor = "rgba(201,168,76,0.22)"; }}
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
          <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10 }}>RATES & FACILITIES</p>
          <h2 className="sw-section-title" style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 26 : 38, color: C.textH, marginBottom: 12 }}>Pricing & Resort Amenities</h2>
          <p style={{ color: C.textS, fontSize: 13, marginBottom: 44, maxWidth: 500, margin: "0 auto 44px" }}>Everything included for your perfect day at StoneWood.</p>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 48, maxWidth: 900, margin: "0 auto 48px" }}>
            {PACKAGES.map((p) => (
              <div key={p.id} className="sw-card" style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: mob ? "22px 18px" : "28px 24px", textAlign: "left", boxShadow: C.shadowCard, display: "flex", flexDirection: "column" }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44, maxWidth: 1100, margin: "0 auto 44px" }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, whiteSpace: "nowrap" }}>INCLUDED AMENITIES</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : tab ? "repeat(3,1fr)" : "repeat(5,1fr)", gap: 14, maxWidth: 1100, margin: "0 auto" }}>
            {AMENITIES.map((a) => (
              <div key={a.name} className="sw-amenity" style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: mob ? "18px 12px" : "22px 16px", cursor: "default", boxShadow: C.shadowCard }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{a.icon}</div>
                <h4 style={{ color: gold, fontSize: mob ? 11 : 12, marginBottom: 6, fontWeight: 700 }}>{a.name}</h4>
                <p style={{ color: C.textS, fontSize: mob ? 10 : 11, lineHeight: 1.6, margin: 0 }}>{a.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ color: C.textXS, fontSize: 12, marginTop: 28 }}>All bookings require a 50% down payment. No refunds. Rescheduling subject to discussion.</p>
        </div>
      </div>

      {/* ── TESTIMONIALS ── */}
      <div style={{ background: isDark ? "#080604" : "#f5f0e8", padding: mob ? "52px 20px" : "88px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 10 }}>TESTIMONIALS</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 26 : 38, color: C.textH, marginBottom: 8 }}>What Our Guests Say</h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 36 }}>
            <Stars rating={Math.round(Number(avgRating))} size={20} />
            <span style={{ color: gold, fontSize: 18, fontWeight: 700 }}>{avgRating}</span>
            <span style={{ color: C.textS, fontSize: 13 }}>({reviews.length} reviews)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 16 }}>
            {reviews.map((r) => (
              <div key={r.id} className="sw-review-card" style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "24px 20px", textAlign: "left", boxShadow: C.shadowCard }}>
                <Stars rating={r.rating} size={14} />
                <p style={{ color: C.textB, fontSize: 14, lineHeight: 1.8, margin: "10px 0 14px", fontStyle: "italic" }}>"{r.message}"</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: gold, fontSize: 13, fontWeight: 700 }}>— {r.name}</span>
                  <span style={{ color: C.textXS, fontSize: 11 }}>{r.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
