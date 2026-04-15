"use client";

import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
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
        border: `1px solid ${isDark ? "#3a3020" : "#e2d9c8"}`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        boxShadow: isDark
          ? "0 4px 24px rgba(0,0,0,0.7),0 0 0 1px rgba(201,168,76,0.08)"
          : "0 4px 24px rgba(100,70,10,0.18),0 1px 4px rgba(0,0,0,0.06)",
        transition: "all .3s cubic-bezier(.22,1,.36,1)",
      }}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
