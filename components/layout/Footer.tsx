"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { NAV } from "@/lib/constants";

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
        background: isDark ? "#080706" : "#1a1410",
        borderTop: `1px solid ${isDark ? "#1a1714" : "#1a1410"}`,
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
              color: gold,
              fontFamily: "'Cormorant Garamond',Georgia,serif",
              fontSize: 24,
              letterSpacing: 4,
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            STONEWOOD
          </div>
          <p style={{ color: "#6a5e4e", fontSize: 13, lineHeight: 2, maxWidth: 300 }}>
            A private resort experience in Angono, Rizal. Exclusive, intimate, and unforgettable.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            {["📍", "📞", "✉️"].map((icon, i) => (
              <div
                key={i}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "rgba(201,168,76,0.08)",
                  border: "1px solid rgba(201,168,76,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {icon}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div>
          <div style={{ color: "rgba(201,168,76,0.6)", fontSize: 9, letterSpacing: 3, marginBottom: 16 }}>
            NAVIGATION
          </div>
          {[...NAV, "Book Now"].map((l) => (
            <div
              key={l}
              onClick={() => setPage(l)}
              style={{ color: "#6a5e4e", fontSize: 13, marginBottom: 9, cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = gold)}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#6a5e4e")}
            >
              {l}
            </div>
          ))}
        </div>

        {/* Support */}
        <div>
          <div style={{ color: "rgba(201,168,76,0.6)", fontSize: 9, letterSpacing: 3, marginBottom: 16 }}>
            SUPPORT
          </div>
          {[
            { label: "Customer Service", action: () => setPage("Customer Service") },
            { label: "Cancel Booking", action: () => router.push("/cancelbooking") },
          ].map(({ label, action }) => (
            <div
              key={label}
              onClick={action}
              style={{ color: "#6a5e4e", fontSize: 13, marginBottom: 9, cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = gold)}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#6a5e4e")}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div>
          <div style={{ color: "rgba(201,168,76,0.6)", fontSize: 9, letterSpacing: 3, marginBottom: 16 }}>
            CONTACT
          </div>
          {["📍 Angono, Rizal", "📞 +63 912 345 6789", "✉️ hello@stonewoodresort.ph", "🕗 8AM – 5PM"].map(
            (c) => (
              <div key={c} style={{ color: "#6a5e4e", fontSize: 13, marginBottom: 9 }}>
                {c}
              </div>
            )
          )}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(201,168,76,0.08)",
          paddingTop: 22,
          textAlign: "center",
          color: "#4a4035",
          fontSize: 11,
          letterSpacing: 1,
        }}
      >
        © 2026 StoneWood Private Resort · Angono, Rizal
      </div>
    </footer>
  );
}
