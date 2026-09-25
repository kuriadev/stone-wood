"use client";

import { useMemo } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
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
  const C = T(isDark);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDark ? "dark" : "light",
          background: { paper: C.bgCard, default: C.bg },
          text: { primary: C.textH, secondary: C.textS },
          divider: C.border,
        },
        // Charts must not introduce Roboto — the rest of the admin is Jost.
        typography: {
          fontFamily: "'Jost', system-ui, sans-serif",
          fontSize: 12,
        },
      }),
    [isDark, C.bgCard, C.bg, C.textH, C.textS, C.border],
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
