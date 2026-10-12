"use client";

/* Applies the owner's Rates & Settings in the browser before anything
 * renders.
 *
 * The root layout reads the settings on the server and passes them here, so
 * the server-rendered HTML and the browser's first render use the same
 * prices, limits and hours — no flash of the old numbers, and no hydration
 * mismatch. applySettings is idempotent, so calling it during render is
 * safe (lib/settings.ts).
 */

import type { ReactNode } from "react";
import { applySettings, type BusinessSettings } from "@/lib/settings";

export function SettingsBoot({ settings, children }: { settings: BusinessSettings; children: ReactNode }) {
  applySettings(settings);
  return <>{children}</>;
}
