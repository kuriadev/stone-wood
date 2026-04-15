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
    textS: isDark ? "#7a6e5e" : "#6b5d4f",
    textXS: isDark ? "#4a4035" : "#a8998a",
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
