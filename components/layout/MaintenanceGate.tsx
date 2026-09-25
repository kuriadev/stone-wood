"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { MAINTENANCE_REASONS } from "@/types/maintenance";

/**
 * Closes the public site.
 *
 * The page underneath still renders — that is the point, the visitor sees
 * StoneWood behind the notice rather than a blank error — but it is blurred
 * and made `inert`, so it cannot be clicked, tabbed into, or read out as
 * interactive by a screen reader. `pointer-events: none` alone would stop
 * the mouse and leave the keyboard free to tab straight through it.
 *
 * ── Routes that are never gated ──────────────────────────────────────
 * /login and /admin are always reachable. The switch lives in the admin
 * panel, so gating those two would make maintenance mode a one-way door:
 * turn it on and the only way back would be editing the database by hand.
 * A signed-in admin is also never gated anywhere, so they can check the
 * public pages while the site is closed to everyone else.
 */
const ALWAYS_OPEN = ["/login", "/admin"];

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { maintenance, adminAuth } = useApp();

  const exempt = ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const gated = maintenance.active && !exempt && !adminAuth;

  // Lock the page while the notice is up. Without this the blurred site
  // still scrolls behind the overlay, which lets a visitor drag the resort
  // around under a notice saying it is closed.
  useEffect(() => {
    if (!gated) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [gated]);

  if (!gated) return <>{children}</>;

  const copy = MAINTENANCE_REASONS[maintenance.reason];

  return (
    // `overflow: hidden` belongs HERE, on the ancestor, not on the scaled
    // element itself: an element's own overflow does not clip its own
    // transform, so scaling the blurred page inside it pushed the viewport
    // wide and produced scrollbars over the notice.
    <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      {/* The real site, still there but out of reach. */}
      <div
        inert
        aria-hidden="true"
        style={{
          filter: "blur(14px) saturate(0.8)",
          transform: "scale(1.06)",       // hides the soft edge blur leaves at the viewport rim
          transformOrigin: "center top",
          pointerEvents: "none",
          userSelect: "none",
          height: "100vh",
        }}
      >
        {children}
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 5000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "40px 24px",
          // Lighter in the middle so the resort still reads through behind
          // the words, heavier at the edges so the text never fights the
          // photo for contrast.
          background: isDark
            ? "radial-gradient(circle at 50% 42%, rgba(12,11,9,0.55), rgba(8,7,5,0.9))"
            : "radial-gradient(circle at 50% 42%, rgba(250,247,242,0.6), rgba(245,240,232,0.92))",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <p
          style={{
            color: gold,
            fontSize: 11.5,
            letterSpacing: 4,
            margin: "0 0 22px",
            fontFamily: "'Cormorant Garamond',Georgia,serif",
          }}
        >
          STONEWOOD PRIVATE RESORT
        </p>

        {/* Headline + the pulsing dot. Wrapped in an inline-flex row so the
            dot sits on the text's own baseline band at every size instead of
            being knocked onto its own line when the title wraps. */}
        <h1
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 18,
            margin: 0,
            color: C.textH,
            fontFamily: "'Cormorant Garamond',Georgia,serif",
            fontWeight: 400,
            lineHeight: 1.15,
            // Scales with the viewport so the headline stays big and legible
            // on a phone without overflowing it.
            fontSize: "clamp(30px, 6.5vw, 62px)",
            letterSpacing: 0.5,
            maxWidth: 900,
          }}
        >
          {copy.title}
          <span className="sw-pulse-dot" aria-hidden="true" />
        </h1>

        <p
          style={{
            color: C.textS,
            fontSize: "clamp(14px, 1.9vw, 17px)",
            lineHeight: 1.7,
            maxWidth: 560,
            margin: "22px 0 0",
          }}
        >
          {copy.body}
        </p>

        {maintenance.message && (
          <p
            style={{
              color: C.textH,
              fontSize: "clamp(14px, 1.9vw, 17px)",
              lineHeight: 1.7,
              maxWidth: 560,
              margin: "14px 0 0",
              padding: "12px 20px",
              border: `1px solid ${gold}44`,
              borderRadius: 10,
              background: isDark ? "rgba(201,168,76,0.07)" : "rgba(201,168,76,0.09)",
            }}
          >
            {maintenance.message}
          </p>
        )}

        <div style={{ height: 1, width: 64, background: `${gold}55`, margin: "34px 0 18px" }} />

        <p style={{ color: C.textXS, fontSize: 12.5, letterSpacing: 1.5, margin: 0 }}>
          Angono, Rizal · This page updates by itself when we reopen.
        </p>
      </div>
    </div>
  );
}
