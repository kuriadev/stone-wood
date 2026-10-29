"use client";

import { useTheme, nextTheme, THEME_LABEL, type ThemeMode } from "@/contexts/ThemeContext";
import { Icon, type IconName } from "@/components/common/Icon";

/** The glyph of the theme a tap switches TO. */
const NEXT_ICON: Record<ThemeMode, IconName> = { light: "sun", dark: "moon" };

/** Flips between Light and Dark. */
export function ThemeToggle() {
  const { isDark, mode, toggle } = useTheme();
  const next = nextTheme(mode);
  return (
    <button
      onClick={toggle}
      title={`${THEME_LABEL[mode]} theme · switch to ${THEME_LABEL[next]}`}
      aria-label={`Switch to the ${THEME_LABEL[next].toLowerCase()} theme`}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 1000,
        width: 52,
        height: 52,
        borderRadius: "50%",
        background: isDark
          ? "linear-gradient(135deg,#1e1c18,#2a2620)"
          : "linear-gradient(135deg,#fff,#faf5ec)",
        // Brighter border in dark mode so the button has an edge against a
        // near-black page, not just a slightly-less-black disc.
        border: `1px solid ${isDark ? "rgba(201,168,76,0.38)" : "#e2d9c8"}`,
        // The glyph is stroked with currentColor. Without this the button
        // fell back to the browser's default button text colour — a dark
        // stroke on a #1e1c18 background, which is why the sun all but
        // vanished in dark mode once it stopped being a colour emoji.
        color: isDark ? "#f2d98b" : "#2a2620",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: isDark
          ? "0 4px 24px rgba(0,0,0,0.7),0 0 0 1px rgba(201,168,76,0.08)"
          : "0 4px 24px rgba(100,70,10,0.18),0 1px 4px rgba(0,0,0,0.06)",
        // Named properties, not `all`: during a theme switch `all` also
        // tried to animate the gradient and the shadow, which cannot be
        // interpolated and only cost work in the frames that mattered.
        transition: "border-color .3s ease, color .3s ease",
      }}
    >
      {/* 20px in a 52px disc: the old 17px emoji had a solid colour fill to
          carry it, a 1.75-weight outline at that size does not. */}
      <Icon name={NEXT_ICON[next]} size={20} strokeWidth={2} />
    </button>
  );
}
