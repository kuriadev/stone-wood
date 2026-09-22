"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Icon, type IconName } from "@/components/admin/Icon";

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
  const pts = data.length >= 2 ? data : [0, 0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);

  const coords = pts.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}-${pts.length}`;

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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

  const rawMax = Math.max(...data.map((d) => d.value), 0);
  // Round the top of the scale up to something readable so the ticks are
  // whole numbers rather than arbitrary fractions of the tallest bar.
  const niceMax = (() => {
    if (rawMax <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
    return Math.ceil(rawMax / mag) * mag;
  })();

  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const plot = height - 26; // leave room for the month labels
  const fmt = formatValue ?? ((v: number) => String(v));
  const axisW = mob ? 30 : 44;

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* y-axis */}
      <div
        style={{
          width: axisW,
          height: plot,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        {ticks.map((t) => (
          <span key={t} style={{ color: C.textXS, fontSize: mob ? 9.5 : 10.5, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {fmt(Math.round(niceMax * t))}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: "relative", height: plot }}>
          {/* gridlines, aligned to the ticks above */}
          {ticks.map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${(1 - t) * 100}%`,
                borderTop: `1px ${t === 0 ? "solid" : "dashed"} ${s.grid}`,
              }}
            />
          ))}

          {/* bars */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: mob ? 3 : 7 }}>
            {data.map((d, i) => {
              const h = niceMax > 0 ? (d.value / niceMax) * plot : 0;
              return (
                <div
                  key={i}
                  title={`${d.label}: ${fmt(d.value)}`}
                  style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", minWidth: 0 }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: Math.max(0, h),
                      minHeight: d.value > 0 ? 3 : 0,
                      background: d.value > 0 ? color : "transparent",
                      opacity: d.value > 0 ? 0.9 : 0,
                      borderRadius: "5px 5px 2px 2px",
                      transition: "height .45s cubic-bezier(.22,1,.36,1)",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* x labels */}
        <div style={{ display: "flex", gap: mob ? 3 : 7, marginTop: 8 }}>
          {data.map((d, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                color: C.textXS,
                fontSize: mob ? 9.5 : 11,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
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
