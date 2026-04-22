"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";

export function About() {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {/* Hero Banner */}
      <div style={{ position: "relative", height: mob ? 300 : 420, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        {isDark && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#070604 0%,#0e0b06 50%,#080603 100%)" }} />
            <div style={{ position: "absolute", top: "-20%", left: "25%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(201,168,76,0.13) 0%,rgba(180,140,50,0.05) 50%,transparent 72%)", animation: "heroOrb1 14s ease-in-out infinite", filter: "blur(2px)" }} />
            <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(160,110,30,0.11) 0%,transparent 65%)", animation: "heroOrb2 18s ease-in-out infinite", filter: "blur(4px)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top,rgba(4,3,2,0.8),transparent)" }} />
          </>
        )}
        {!isDark && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1c1308 0%,#2e1e0a 45%,#160e05 100%)" }} />
            <div style={{ position: "absolute", top: "-20%", left: "25%", width: 540, height: 540, borderRadius: "50%", background: "radial-gradient(circle,rgba(220,180,80,0.2) 0%,rgba(200,155,55,0.07) 50%,transparent 70%)", animation: "heroOrb1 14s ease-in-out infinite", filter: "blur(2px)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(to top,rgba(12,8,2,0.7),transparent)" }} />
          </>
        )}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent 0%,${gold}88 30%,${gold} 50%,${gold}88 70%,transparent 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}33,transparent)` }} />
        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <div className="hero-tag" style={{ display: "inline-flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 28, height: 1, background: `linear-gradient(to right,transparent,${gold})`, opacity: 0.9 }} />
            <span style={{ color: gold, letterSpacing: mob ? 3 : 5, fontSize: mob ? 10 : 11, fontWeight: 500, textTransform: "uppercase" }}>Our Story</span>
            <div style={{ width: 28, height: 1, background: `linear-gradient(to left,transparent,${gold})`, opacity: 0.9 }} />
          </div>
          <h2 className="hero-title" style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 36 : 54, fontWeight: 400, lineHeight: 1.1, margin: "0 0 16px", color: "#f8f4ee", letterSpacing: "-0.3px" }}>
            About{" "}
            <span style={{ fontStyle: "italic", background: `linear-gradient(135deg,#c9a84c,#e8c97a,#c9a84c)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>StoneWood</span>
          </h2>
          <div className="hero-sub" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 32, height: 1, background: `linear-gradient(to right,transparent,${gold}66)` }} />
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: gold, opacity: 0.6 }} />
            <div style={{ width: 32, height: 1, background: `linear-gradient(to left,transparent,${gold}66)` }} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: mob ? "40px 20px" : "72px 24px" }}>
        <p style={{ color: C.textB, lineHeight: 1.9, fontSize: 15, marginBottom: 20 }}>StoneWood Private Resort is nestled in the heart of Angono, Rizal — a sanctuary where nature and privacy come together.</p>
        <p style={{ color: C.textB, lineHeight: 1.9, fontSize: 15, marginBottom: 20 }}>Our resort features a private pool, BBQ areas, billiards, videoke entertainment, and secure parking — all within a lush, intimate setting.</p>
        <p style={{ color: C.textB, lineHeight: 1.9, fontSize: 15, marginBottom: 48 }}>Currently undergoing exciting renovations to expand our facilities and bring even more experiences to our guests.</p>

        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 16, marginBottom: 40 }}>
          {[["₱6,000", "Base Day Rate"], ["30", "Base Guest Cap."], ["Angono", "Rizal, PH"]].map(([v, l]) => (
            <div key={l} style={{ position: "relative", overflow: "hidden", background: C.bgCard, border: `1px solid ${C.border}`, padding: "32px 18px", borderRadius: 12, textAlign: "center", boxShadow: C.shadowCard, transition: "transform .25s,box-shadow .25s" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = isDark ? "0 16px 40px rgba(0,0,0,0.5)" : "0 16px 40px rgba(100,70,10,0.13)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = C.shadowCard; }}
            >
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent,${gold}66,transparent)` }} />
              <div style={{ color: gold, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 34, marginBottom: 8, fontWeight: 600, background: `linear-gradient(135deg,#c9a84c,#e8c97a)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{v}</div>
              <div style={{ color: C.textS, fontSize: 10, letterSpacing: 2 }}>{l.toUpperCase()}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "relative", overflow: "hidden", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 28px", boxShadow: C.shadowCard }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent,${gold}55,transparent)` }} />
          <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 20, fontWeight: 400 }}>Contact Us</h3>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12 }}>
            {[["📍", "Location", "Angono, Rizal, Philippines"], ["📞", "Phone", "+63 912 345 6789"], ["✉️", "Email", "hello@stonewoodresort.ph"], ["🕗", "Hours", "8:00 AM – 5:00 PM"]].map(([icon, label, val]) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", background: isDark ? "rgba(201,168,76,0.03)" : "rgba(201,168,76,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, transition: "border-color .2s,background .2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${gold}44`; e.currentTarget.style.background = isDark ? "rgba(201,168,76,0.07)" : "rgba(201,168,76,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = isDark ? "rgba(201,168,76,0.03)" : "rgba(201,168,76,0.04)"; }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div>
                  <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 3 }}>{label.toUpperCase()}</div>
                  <div style={{ color: C.textH, fontSize: 14, fontWeight: 500 }}>{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}