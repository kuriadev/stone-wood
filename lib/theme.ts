import type { CSSProperties } from "react";

export interface ThemeColors {
  bg: string;
  bgCard: string;
  bgCard2: string;
  border: string;
  borderLight: string;
  textH: string;
  textB: string;
  textS: string;
  textXS: string;
  goldInk: string;
  inp: CSSProperties;
  navBg: string;
  shadow: string;
  shadowCard: string;
}

export function T(isDark: boolean): ThemeColors {
  return {
    bg: isDark ? "#0c0b09" : "#faf7f2",
    bgCard: isDark ? "#131210" : "#ffffff",
    bgCard2: isDark ? "#0f0e0b" : "#f5f0e8",
    border: isDark ? "#242018" : "#e4ddd1",
    borderLight: isDark ? "#1a1814" : "#ede8df",
    textH: isDark ? "#f2ede6" : "#1a1614",
    textB: isDark ? "#c4b99a" : "#3d3229",
    // Dark was #7a6e5e at 3.95:1 on the near-black background -- just under
    // the 4.5:1 body text needs. #9b8e79 is the same hue at 6.13:1.
    textS: isDark ? "#9b8e79" : "#6b5d4f",
    // Light was #a8998a, which sits at 2.59:1 on the cream background --
    // under the 4.5:1 a caption needs. #7d7062 is the same hue at 4.50:1.
    textXS: isDark ? "#847866" : "#7d7062",
    /**
     * Gold for TEXT and ICONS, as opposed to gold as a surface.
     *
     * The brand gold #c9a84c reads well on the near-black dark theme (8.61:1)
     * but collapses to 2.14:1 on the cream light theme, where it is used for
     * every label, meta line and inline icon. This is the same gold darkened
     * until it clears 4.5:1 (4.58:1) while staying in the same hue family.
     *
     * `gold` from lib/styles.ts is unchanged and stays the SURFACE colour --
     * the Book Now button is still bright gold with dark text on it, which
     * was never the problem.
     */
    goldInk: isDark ? "#c9a84c" : "#8a6d20",
    inp: {
      background: isDark ? "#0f0e0b" : "#ffffff",
      color: isDark ? "#f2ede6" : "#1a1614",
      border: `1px solid ${isDark ? "#2e2820" : "#d6cfc4"}`,
      padding: "11px 14px",
      fontSize: 13,
      borderRadius: 6,
      width: "100%",
      boxSizing: "border-box",
      boxShadow: isDark ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
    },
    navBg: isDark ? "rgba(10,9,7,0.97)" : "rgba(250,247,242,0.97)",
    shadow: isDark ? "0 4px 24px rgba(0,0,0,0.55)" : "0 4px 24px rgba(80,55,20,0.10)",
    shadowCard: isDark ? "0 2px 16px rgba(0,0,0,0.4)" : "0 2px 16px rgba(80,55,20,0.08)",
  };
}
