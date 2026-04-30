"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { NAV } from "@/lib/constants";

interface NavbarProps {
  page: string;
  setPage: (p: string) => void;
}

export function Navbar({ page, setPage }: NavbarProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const [open, setOpen] = useState(false);

  return (
    <nav
      style={{
        background: C.navBg,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: isDark
          ? "0 1px 0 rgba(201,168,76,0.06)"
          : "0 1px 0 rgba(201,168,76,0.12),0 2px 16px rgba(80,55,10,0.06)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
        }}
      >
        <span
          onClick={() => { setPage("Home"); setOpen(false); }}
          style={{
            cursor: "pointer",
            fontFamily: "'Cormorant Garamond',Georgia,serif",
            fontSize: mob ? 20 : 24,
            color: gold,
            letterSpacing: 4,
            fontWeight: 600,
          }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}>
          STONEWOOD
        </span>

        {mob ? (
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              color: C.textB,
              fontSize: 18,
              cursor: "pointer",
              padding: "5px 9px",
              borderRadius: 6,
              transition: "border-color .2s",
            }}
          >
            {open ? "✕" : "☰"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            {NAV.map((l) => (
              <span
                key={l}
                onClick={() => setPage(l)}
                className="sw-nav-link"
                style={{
                cursor: "pointer",
                color: page === l ? gold : C.textS,
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: page === l ? 600 : 400,
                position: "relative",
                paddingBottom: 6,
                transition: "color .25s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = gold;
              }}
              onMouseLeave={(e) => {
                if (page !== l) e.currentTarget.style.color = C.textS;
              }}
              >
                <div
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                height: 1,
                width: page === l ? "100%" : "0%",
                background: gold,
                transition: "width 0.3s ease",
              }}
            />
                {l.toUpperCase()}
              </span>
            ))}
            <button
              className="sw-btn"
              onClick={() => setPage("Book Now")}
              style={{
              ...goldBtn,
              padding: "9px 20px",
              fontSize: 11,
              letterSpacing: 1.5,
              borderRadius: 8,
              transition: "all .25s cubic-bezier(.22,1,.36,1)",
              boxShadow: "0 4px 18px rgba(201,168,76,0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 28px rgba(201,168,76,0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 18px rgba(201,168,76,0.25)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.96)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            >
              BOOK NOW
            </button>

          </div>
        )}
      </div>

      {mob && open && (
        <div
          style={{
            background: isDark ? "#0f0e0b" : "#fdf9f4",
            borderTop: `1px solid ${C.border}`,
            padding: "12px 0 20px",
            boxShadow: isDark ? "none" : "0 8px 32px rgba(80,55,10,0.08)",
          }}
        >
          {NAV.map((l) => (
            <div
              key={l}
              onClick={() => { setPage(l); setOpen(false); }}
              style={{
              padding: "14px 24px",
              color: page === l ? gold : C.textB,
              fontSize: 14,
              cursor: "pointer",
              borderLeft: page === l ? `3px solid ${gold}` : "3px solid transparent",
              transition: "all .2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(201,168,76,0.08)";
              e.currentTarget.style.paddingLeft = "28px";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.paddingLeft = "24px";
            }}
            >
              {l}
            </div>
          ))}
          <div 
            style={{         
            background: isDark ? "#0f0e0b" : "#fdf9f4",
            borderTop: `1px solid ${C.border}`,
            padding: "12px 0 20px",
            boxShadow: isDark ? "none" : "0 8px 32px rgba(80,55,10,0.08)",
            animation: "navFadeSlide 0.35s ease",
            
          }}>
            <button
              onClick={() => { setPage("Book Now"); setOpen(false); }}
              style={{ ...goldBtn, width: "100%", padding: 13 }}
            >
              BOOK NOW
            </button>
        
          </div>
        </div>
      )}
    </nav>
  );
}
