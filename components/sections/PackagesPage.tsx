"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import type { ResortPackage } from "@/types/package";
import type { BookingResource, BookingTier } from "@/types/booking";
import { Reveal } from "@/components/common/Reveal";
import { PackageShowcase } from "@/components/sections/PackageShowcase";

interface PackagesPageProps {
  setPage: (p: string) => void;
  packages: ResortPackage[];
  onBookPackage: (pkg: ResortPackage, resource: BookingResource, tier: BookingTier) => void;
}

export function PackagesPage({ setPage, packages, onBookPackage }: PackagesPageProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;


  const visible = packages.filter((p) => p.active);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "52px 20px" : "88px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        {/* HEADER — one reveal for the trio so they rise together. */}
        <Reveal>
        <p style={{ color: C.goldInk, letterSpacing: 4, fontSize: 12.5, textAlign: "center" }}>
          RESORT PACKAGES
        </p>
        <h2 style={{
          fontFamily: "'Cormorant Garamond',Georgia,serif",
          fontSize: mob ? 28 : 46,
          color: C.textH,
          textAlign: "center",
          marginBottom: 10,
        }}>
          Choose Your Kind of Escape
        </h2>
        <p style={{ color: C.textS, textAlign: "center", marginBottom: 48, fontSize: 14.5 }}>
          From relaxed group days to private celebrations, find the experience that feels made for you.
        </p>
        </Reveal>

        {/* The grid grew a row for every package the admin added, and none of
            the cards had room for the inclusions, so comparing anything meant
            opening a modal. PackageShowcase shows one full offer at a time,
            grouped by tier -- see components/sections/PackageShowcase.tsx. */}
        {visible.length === 0 ? (
          <p style={{ color: C.textS, fontSize: 14.5, textAlign: "center", padding: "32px 0" }}>
            No packages available right now.
          </p>
        ) : (
          <PackageShowcase
            packages={visible}
            tierStyle="card"
            showTierIntro
            onBookPackage={(lite, resource, status) => {
              const full = visible.find((x) => x.code === lite.code);
              if (full) onBookPackage(full, resource, status);
            }}
            onFallbackBook={() => setPage("Book Now")}
          />
        )}
      </div>
    </div>
  );
}
