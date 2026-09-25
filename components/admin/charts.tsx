"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Icon, type IconName } from "@/components/common/Icon";
import { BarChart as MuiBarChart } from "@mui/x-charts/BarChart";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { ChartTheme } from "@/components/admin/ChartTheme";

/**
 * Presentation primitives for the Reports and Analytics pages.
 *
 * These exist so both pages share one visual language instead of each
 * re-declaring card padding, radii and bar maths inline. Nothing here holds
 * business logic — callers pass finished numbers and labels in, so changing
 * the look never risks changing what is displayed.
 */

function surface(isDark: boolean) {
  return {
    bg: isDark ? "#0b0a08" : "#ffffff",
    border: isDark ? "#1e1a14" : "#ebe5db",
    grid: isDark ? "#191510" : "#f0ebe2",
  };
}

// ── PANEL ────────────────────────────────────────────────────────────
// A titled card. `action` is the right-hand slot the reference dashboards
// use for a filter or range control.

export function Panel({
  title,
  action,
  children,
  padding = "22px 24px",
  style,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  padding?: string;
  style?: React.CSSProperties;
}) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const s = surface(isDark);

  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 14,
        padding,
        // A single soft shadow rather than the heavier card shadow — the
        // border already separates the card from the page.
        boxShadow: isDark
          ? "0 1px 2px rgba(0,0,0,0.30)"
          : "0 1px 2px rgba(60,50,30,0.05), 0 8px 24px -16px rgba(60,50,30,0.12)",
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {title && (
            <h3
              style={{
                color: C.textH,
                fontSize: 13.5,
                fontWeight: 600,
                letterSpacing: 0.8,
                margin: 0,
              }}
            >
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── SPARKLINE ────────────────────────────────────────────────────────
// The small trend curve beside each figure in the reference. Purely
// decorative context — it never carries a number of its own.

export function Sparkline({
  data,
  color,
  width = 78,
  height = 32,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  // Two points minimum, or there is no line to draw.
  const pts = data.length >= 2 ? data : [0, 0];

  return (
    <ChartTheme>
      <SparkLineChart
        data={pts}
        width={width}
        height={height}
        color={color}
        area
        showHighlight={false}
        showTooltip={false}
        margin={{ top: 2, bottom: 2, left: 0, right: 0 }}
      />
    </ChartTheme>
  );
}

// ── STAT CARD ────────────────────────────────────────────────────────
// Icon chip and label on one row, the figure beneath, trend on the right.

export function StatCard({
  icon,
  label,
  value,
  color,
  series,
  mob = false,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  color: string;
  series?: number[];
  mob?: boolean;
}) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const s = surface(isDark);

  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 14,
        padding: mob ? "14px 14px" : "18px 20px",
        boxShadow: isDark
          ? "0 1px 2px rgba(0,0,0,0.30)"
          : "0 1px 2px rgba(60,50,30,0.05), 0 8px 24px -16px rgba(60,50,30,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: mob ? 10 : 14 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: `${color}14`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={15} />
        </div>
        <span
          style={{
            color: C.textS,
            fontSize: mob ? 11.5 : 13,
            fontWeight: 500,
            letterSpacing: 0.2,
            lineHeight: 1.25,
          }}
        >
          {label}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        {/* Tabular numerals keep figures the same width, so columns of
            numbers line up instead of shifting as digits change. */}
        <span
          style={{
            color: C.textH,
            fontSize: mob ? 20 : 26,
            fontWeight: 700,
            letterSpacing: -0.5,
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {series && series.length > 1 && !mob && <Sparkline data={series} color={color} />}
      </div>
    </div>
  );
}

// ── BAR CHART ────────────────────────────────────────────────────────
// Adds what the old charts lacked: a labelled y-axis and gridlines, so two
// bars can actually be compared rather than guessed at.

export function BarChart({
  data,
  color,
  formatValue,
  height = 190,
  mob = false,
}: {
  data: { label: string; value: number }[];
  color: string;
  formatValue?: (v: number) => string;
  height?: number;
  mob?: boolean;
}) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const s = surface(isDark);
  const fmt = formatValue ?? ((v: number) => String(v));

  // The signature is unchanged on purpose: three call sites pass
  // {label,value} pairs and a colour, and none of them had to change when
  // the hand-drawn SVG underneath became MUI X. The y-axis rounding, tick
  // maths and bar geometry that used to live here are the library's job now.
  return (
    <ChartTheme>
      <MuiBarChart
        height={height}
        series={[
          {
            data: data.map((d) => d.value),
            color,
            valueFormatter: (v) => fmt(Number(v ?? 0)),
          },
        ]}
        xAxis={[
          {
            data: data.map((d) => d.label),
            scaleType: "band",
            tickLabelStyle: { fill: C.textXS, fontSize: mob ? 9.5 : 11 },
          },
        ]}
        yAxis={[
          {
            valueFormatter: (v: number) => fmt(v),
            tickLabelStyle: { fill: C.textXS, fontSize: mob ? 9.5 : 11 },
          },
        ]}
        grid={{ horizontal: true }}
        margin={{ top: 10, right: 8, bottom: 4, left: 4 }}
        sx={{
          // Axis lines and gridlines follow the panel's own palette rather
          // than Material's greys.
          "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: s.border },
          "& .MuiChartsGrid-line": { stroke: s.grid },
        }}
      />
    </ChartTheme>
  );
}

// ── PROGRESS ROW ─────────────────────────────────────────────────────
// Label, figure and a track — used by Status Breakdown and Package
// Breakdown, which previously duplicated the same markup.

export function ProgressRow({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string | number;
  pct: number;
  color: string;
}) {
  const { isDark } = useTheme();
  const C = T(isDark);

  return (
    <div style={{ marginBottom: 15 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ color: C.textB, fontSize: 14 }}>{label}</span>
        <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color, fontWeight: 700 }}>{value}</span>{" "}
          <span style={{ color: C.textXS }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ background: isDark ? "#17130f" : "#f1ece3", borderRadius: 999, height: 5, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            background: color,
            height: "100%",
            borderRadius: 999,
            transition: "width .6s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </div>
    </div>
  );
}
