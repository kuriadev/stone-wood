"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { fmt, isMenuItemSellable } from "@/lib/utils";
import type { MenuItem, MenuCategory } from "@/types/menu";
import type { InventoryItem } from "@/types/inventory";
import { srcSetFor, SIZES } from "@/lib/img";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface MenuProps {
  menuItems: MenuItem[];
  inventory?: InventoryItem[];
  onBookNow?: () => void;
}

const CATEGORIES: MenuCategory[] = ["Combo", "Grilled & BBQ", "Rice Meals", "Snacks", "Drinks", "Desserts"];

export function Menu({ menuItems, inventory = [], onBookNow }: MenuProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.
  useScrollReveal();

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const [filterCat, setFilterCat] = useState<"All" | MenuCategory>("All");

  // Every item shows here, sellable or not — a guest sees "Unavailable"
  // instead of the item just silently disappearing from the menu.
  const filtered = filterCat === "All" ? menuItems : menuItems.filter((m) => m.category === filterCat);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "48px 20px" : "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <p className="sw-reveal" style={{ color: gold, letterSpacing: 4, fontSize: 12.5, marginBottom: 10, textAlign: "center" }}>FOOD & DRINKS</p>
        <h2 className="sw-reveal" style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 28 : 42, color: C.textH, textAlign: "center", marginBottom: 8 }}>Resort Menu</h2>
        <p style={{ color: C.textS, fontSize: 14.5, textAlign: "center", marginBottom: 32, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          Browse what's on offer, then pre-order food & drinks during Book Now so it's ready when you arrive — or order on-site.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap", justifyContent: "center" }}>
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              style={{
                padding: "8px 16px", fontSize: 12.5, letterSpacing: 1, borderRadius: 20, cursor: "pointer",
                background: filterCat === c ? `${gold}18` : "transparent",
                color: filterCat === c ? gold : C.textS,
                border: `1px solid ${filterCat === c ? gold + "55" : C.border}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
          {filtered.map((m) => {
            const sellable = isMenuItemSellable(m, inventory);
            // No sw-reveal on this card: it sets opacity inline to dim an
            // unavailable dish, and an inline opacity outranks both
            // .sw-reveal (0) and .sw-reveal-in (1) — the card would freeze at
            // 0.55 and never animate. The dimming matters more, so it wins.
            return (
            <div key={m.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: C.shadowCard, opacity: sellable ? 1 : 0.55, position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={m.img} srcSet={srcSetFor(m.img)} sizes={SIZES.card} alt={m.name} style={{ width: "100%", height: 160, objectFit: "cover", display: "block", filter: sellable ? "none" : "grayscale(60%)" }} />
              {!sellable && (
                <span style={{ position: "absolute", top: 10, right: 10, background: "rgba(20,10,5,0.85)", color: "#e55", fontSize: 11.5, fontWeight: 700, letterSpacing: 1, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(229,85,85,0.4)" }}>
                  UNAVAILABLE
                </span>
              )}
              <div style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <h4 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, margin: 0 }}>{m.name}</h4>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", marginLeft: 10 }}>{fmt(m.price)}</span>
                </div>
                <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{m.desc}</p>
              </div>
            </div>
            );
          })}
          {filtered.length === 0 && (
            <p style={{ color: C.textXS, fontSize: 14.5, gridColumn: "1/-1", textAlign: "center", padding: "40px 0" }}>Nothing in this category right now — check back soon.</p>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <button onClick={onBookNow} style={{ ...goldBtn, padding: "14px 36px", fontSize: 13.5, letterSpacing: 2, borderRadius: 6 }}>PRE-ORDER WITH A BOOKING →</button>
        </div>
      </div>
    </div>
  );
}
