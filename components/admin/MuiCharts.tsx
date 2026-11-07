"use client";

// The MUI X charts and their theme, in a module of their own so the admin
// loads them only once a chart is on screen (charts.tsx imports this lazily).
// MUI and its styling engine are most of the admin's JavaScript; the
// dashboard's figures and lists show without waiting for them.

import { BarChart } from "@mui/x-charts/BarChart";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { ChartTheme } from "@/components/admin/ChartTheme";
import type { ComponentProps } from "react";

export function MuiSpark(props: ComponentProps<typeof SparkLineChart>) {
  return <ChartTheme><SparkLineChart {...props} /></ChartTheme>;
}

export function MuiBar(props: ComponentProps<typeof BarChart>) {
  return <ChartTheme><BarChart {...props} /></ChartTheme>;
}
