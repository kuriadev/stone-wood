import type { CSSProperties } from "react";

export const gold = "#c9a84c";

export const goldBtn: CSSProperties = {
  background: "linear-gradient(135deg,#c9a84c,#e8c56a)",
  color: "#1a1000",
  border: "none",
  padding: "12px 28px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  borderRadius: 6,
  letterSpacing: 1,
  boxShadow: "0 2px 12px rgba(201,168,76,0.3)",
};

export const outBtn: CSSProperties = {
  background: "transparent",
  color: gold,
  border: `1px solid ${gold}`,
  padding: "11px 22px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  borderRadius: 6,
  letterSpacing: 1,
};
