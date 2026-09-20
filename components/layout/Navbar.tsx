"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";

interface NavbarProps {
  page: string;
  setPage: (p: string) => void;
}

const LINKS = ["Home", "Rooms", "Packages", "Menu", "Gallery", "About Us"];

export function Navbar({ page, setPage }: NavbarProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 900;

  // The bar starts transparent over the hero photo and solidifies on scroll,
  // so the hero reads as one uninterrupted image.
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Only the Home page has a photo hero to sit over.
  const overlay = page === "Home" && !solid;

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer on Escape, and lock scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Never leave the drawer open behind a route change.
  useEffect(() => { setOpen(false); }, [page]);

  const go = (p: string) => { setOpen(false); setPage(p); };

  const linkColor = overlay ? "rgba(255,255,255,0.78)" : C.textS;
  const linkActive = overlay ? "#fff" : C.textH;

  return (
    <>
      {/* Keyboard users can jump the nav entirely. */}
      <a
        href="#main"
        className="sw-skip"
        style={{
          /* `top` lives in globals.css (.sw-skip / .sw-skip:focus) — an
             inline value here would outrank the :focus rule. */
          position: "absolute", left: 16, zIndex: 300,
          background: gold, color: "#1a1000", padding: "10px 18px",
          borderRadius: 6, fontSize: 12, letterSpacing: 1.5, fontWeight: 600,
          textDecoration: "none",
        }}
      >
        SKIP TO CONTENT
      </a>

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 200,
          background: overlay ? "transparent" : (isDark ? "rgba(8,6,4,0.88)" : "rgba(253,251,247,0.9)"),
          backdropFilter: overlay ? "none" : "blur(16px)",
          WebkitBackdropFilter: overlay ? "none" : "blur(16px)",
          borderBottom: `1px solid ${overlay ? "transparent" : C.border}`,
          transition: "background .35s ease, border-color .35s ease",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: mob ? "0 20px" : "0 32px",
            height: solid ? 64 : 78,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            transition: "height .35s ease",
          }}
        >
          {/* Wordmark */}
          <button
            onClick={() => go("Home")}
            aria-label="StoneWood — go to home"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
            }}
          >
            <span
              style={{
                fontFamily: "'Cormorant Garamond',Georgia,serif",
                fontSize: mob ? 19 : 22,
                letterSpacing: 5,
                color: overlay ? "#fff" : C.textH,
                lineHeight: 1,
                transition: "color .35s ease",
              }}
            >
              STONEWOOD
            </span>
            <span
              style={{
                fontSize: 7.5,
                letterSpacing: 3.5,
                color: overlay ? "rgba(255,255,255,0.6)" : C.textXS,
                transition: "color .35s ease",
              }}
            >
              PRIVATE RESORT
            </span>
          </button>

          {/* Desktop links */}
          {!mob && (
            <nav aria-label="Main" style={{ display: "flex", alignItems: "center", gap: 36 }}>
              {LINKS.map((l) => {
                const active = page === l;
                return (
                  <button
                    key={l}
                    onClick={() => go(l)}
                    aria-current={active ? "page" : undefined}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: "6px 0", position: "relative",
                      fontSize: 11.5, letterSpacing: 2, fontWeight: 500,
                      color: active ? linkActive : linkColor,
                      transition: "color .2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = linkActive; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = linkColor; }}
                  >
                    {l.toUpperCase()}
                    {/* Underline grows from centre — marks position, not decoration. */}
                    <span
                      style={{
                        position: "absolute", left: 0, right: 0, bottom: 0, height: 1,
                        background: gold,
                        transform: active ? "scaleX(1)" : "scaleX(0)",
                        transformOrigin: "center",
                        transition: "transform .3s cubic-bezier(.22,1,.36,1)",
                      }}
                    />
                  </button>
                );
              })}
            </nav>
          )}

          {/* Right cluster */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!mob && (
              <button
                onClick={() => go("Book Now")}
                className="sw-btn"
                style={{ ...goldBtn, padding: "11px 24px", fontSize: 11, letterSpacing: 2, borderRadius: 7 }}
              >
                BOOK NOW
              </button>
            )}

            {mob && (
              <button
                onClick={() => setOpen((o) => !o)}
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  width: 40, height: 40, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 5, padding: 0,
                }}
              >
                {/* Hamburger morphs into a close mark. */}
                <span style={{ display: "block", width: 20, height: 1.5, background: overlay ? "#fff" : C.textH, transform: open ? "translateY(3.25px) rotate(45deg)" : "none", transition: "transform .3s cubic-bezier(.22,1,.36,1)" }} />
                <span style={{ display: "block", width: 20, height: 1.5, background: overlay ? "#fff" : C.textH, transform: open ? "translateY(-3.25px) rotate(-45deg)" : "none", transition: "transform .3s cubic-bezier(.22,1,.36,1)" }} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mob && (
        <div
          aria-hidden={!open}
          style={{
            position: "fixed", inset: 0, zIndex: 190,
            pointerEvents: open ? "auto" : "none",
          }}
        >
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "absolute", inset: 0,
              background: "rgba(4,3,2,0.6)",
              backdropFilter: open ? "blur(6px)" : "none",
              opacity: open ? 1 : 0,
              transition: "opacity .3s ease",
            }}
          />
          <div
            ref={panelRef}
            style={{
              position: "absolute", top: 0, right: 0, bottom: 0,
              width: "min(320px, 84vw)",
              background: isDark ? "#0b0907" : "#fdfbf7",
              borderLeft: `1px solid ${C.border}`,
              padding: "96px 28px 32px",
              transform: open ? "translateX(0)" : "translateX(100%)",
              transition: "transform .38s cubic-bezier(.22,1,.36,1)",
              display: "flex", flexDirection: "column",
            }}
          >
            <nav aria-label="Mobile" style={{ display: "flex", flexDirection: "column" }}>
              {LINKS.map((l, i) => {
                const active = page === l;
                return (
                  <button
                    key={l}
                    onClick={() => go(l)}
                    aria-current={active ? "page" : undefined}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      textAlign: "left", padding: "16px 0",
                      borderBottom: `1px solid ${C.borderLight}`,
                      fontFamily: "'Cormorant Garamond',Georgia,serif",
                      fontSize: 24, fontWeight: 400,
                      color: active ? gold : C.textH,
                      // Links stagger in behind the panel.
                      opacity: open ? 1 : 0,
                      transform: open ? "translateX(0)" : "translateX(16px)",
                      transition: `opacity .3s ease ${120 + i * 55}ms, transform .3s ease ${120 + i * 55}ms`,
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </nav>

            <button
              onClick={() => go("Book Now")}
              className="sw-btn"
              style={{ ...goldBtn, marginTop: 28, padding: "15px 24px", fontSize: 12, letterSpacing: 2, borderRadius: 8 }}
            >
              BOOK NOW
            </button>

            <div style={{ marginTop: "auto", paddingTop: 24, borderTop: `1px solid ${C.borderLight}` }}>
              <button
                onClick={() => go("Cancel Booking")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: C.textS, fontSize: 12, letterSpacing: 1 }}
              >
                Manage a reservation
              </button>
              <p style={{ color: C.textXS, fontSize: 11, marginTop: 10, lineHeight: 1.7 }}>
                Angono, Rizal · 7:00 AM – 5:00 PM
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}