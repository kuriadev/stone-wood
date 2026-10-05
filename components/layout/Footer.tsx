"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { NAV } from "@/lib/constants";
import { SLOTS } from "@/lib/resort";

interface FooterProps {
  setPage: (p: string) => void;
}

export function Footer({ setPage }: FooterProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  return (
    <footer
      style={{
        /* Dark in both themes on purpose, so the text colours below are
           single literals rather than isDark branches. They are contrast-
           checked against #1a1410, the lighter of the two. */
        background: isDark ? "#080706" : "#1a1410",
        borderTop: `1px solid ${isDark ? "#2a2a2a" : "#1a1410"}`,
        padding: mob ? "48px 20px 28px" : "64px 24px 32px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(to right,transparent,${gold}44,transparent)`,
        }}
      />
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : "2fr 1fr 1fr 1.4fr",
          gap: mob ? 32 : 48,
          marginBottom: 36,
        }}
      >
        {/* Brand */}
        <div>
          <div
            style={{
              color: C.goldInk,
              fontFamily: "'Satoshi',system-ui,sans-serif",
              fontSize: 24,
              letterSpacing: 4,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            STONEWOOD
          </div>
          <p style={{ color: "#9a8d7a", fontSize: 14.5, lineHeight: 2, maxWidth: 300 }}>
            A private resort experience in Angono, Rizal. Exclusive, intimate, and unforgettable.
          </p>
        </div>

        {/* Navigation */}
        <div>
          <div style={{ color: "rgba(201,168,76,0.85)", fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>
            NAVIGATION
          </div>
          {[...NAV, "Book Now"].map((l) => (
            <div
              key={l}
              onClick={() => setPage(l)}
              style={{ color: "#9a8d7a", fontSize: 14.5, marginBottom: 8, cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = gold)}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9a8d7a")}
            >
              {l}
            </div>
          ))}
        </div>

        {/* Support */}
        <div>
          <div style={{ color: "rgba(201,168,76,0.85)", fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>
            SUPPORT
          </div>
          {[
            { label: "Customer Service", action: () => setPage("Customer Service") },
            { label: "Manage Booking", action: () => router.push("/cancelbooking") },
          ].map(({ label, action }) => (
            <div
              key={label}
              onClick={action}
              style={{ color: "#9a8d7a", fontSize: 14.5, marginBottom: 8, cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = gold)}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9a8d7a")}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div>
          <div style={{ color: "rgba(201,168,76,0.85)", fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>
            CONTACT
          </div>
          {["22 Yakal cor. Ipil St. Doña Justa Village Phase, 2nd St, Angono, Rizal", "+63 912 345 6789", "stonewoodresort.ph@gmail.com", `Day ${SLOTS.Day.hours} · Night ${SLOTS.Night.hours}`].map(
            (c) => (
              <div key={c} style={{ color: "#9a8d7a", fontSize: 14.5, marginBottom: 8 }}>
                {c}
              </div>
            )
          )}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(201,168,76,0.08)",
          paddingTop: 24,
          textAlign: "center",
          color: "#8a7d6a",
          fontSize: 12.5,
          letterSpacing: 1,
        }}
      >
        © 2026 StoneWood Private Resort · Angono, Rizal
      </div>
    </footer>
  );
}
