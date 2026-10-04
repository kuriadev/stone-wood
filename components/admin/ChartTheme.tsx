"use client";

import { useMemo } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useTheme } from "@/contexts/ThemeContext";
import { THEME_VARS, resolveVar } from "@/lib/theme";
import type { ReactNode } from "react";

/**
 * Bridges MUI X Charts to this app's own theme.
 *
 * MUI ships its own light palette and knows nothing about `lib/theme.ts`.
 * Dropped in unthemed, a chart renders light grey axes and Material blue
 * bars on the admin's near-black panels — it reads as pasted in from a
 * different product.
 *
 * This is deliberately scoped to the charts rather than wrapped around the
 * app. `@mui/material` is installed only because `@mui/x-charts` requires
 * it; the rest of the interface is bespoke and must not start inheriting
 * Material's typography or spacing by accident.
 */
export function ChartTheme({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();

  /* MUI is the one consumer that needs real colour VALUES: it runs its own
     alpha() and darken() over the palette, and cannot do that to a
     `var(--sw-*)` reference. So the variables are resolved from the
     document here rather than keeping a private copy of the hex values —
     the palette is still authored once, in globals.css.

     Re-resolved whenever the theme flips, because that is when the
     variables under <html> change. The fallbacks only apply during the
     server render, where there is no computed style to read. */
  const C = useMemo(() => ({
    bgCard: resolveVar(THEME_VARS.bgCard, isDark ? "#1f1f1f" : "#ffffff"),
    bg: resolveVar(THEME_VARS.bg, isDark ? "#121212" : "#faf7f2"),
    textH: resolveVar(THEME_VARS.textH, isDark ? "#f2ede6" : "#1a1614"),
    textS: resolveVar(THEME_VARS.textS, isDark ? "#9b8e79" : "#6b5d4f"),
    border: resolveVar(THEME_VARS.border, isDark ? "#2a2a2a" : "#e4ddd1"),
  }), [isDark]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDark ? "dark" : "light",
          background: { paper: C.bgCard, default: C.bg },
          text: { primary: C.textH, secondary: C.textS },
          divider: C.border,
        },
        // Charts must not introduce Roboto — the rest of the admin is Satoshi.
        typography: {
          fontFamily: "'Satoshi', system-ui, sans-serif",
          fontSize: 12,
        },
      }),
    [isDark, C.bgCard, C.bg, C.textH, C.textS, C.border],
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
