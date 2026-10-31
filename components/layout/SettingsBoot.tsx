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

import { useEffect, type ReactNode } from "react";
import { type BusinessSettings } from "@/lib/settings";
import { bootSettings, startSettingsSync } from "@/lib/settingsLive";

export function SettingsBoot({ settings, children }: { settings: BusinessSettings; children: ReactNode }) {
  // The server's settings, applied before anything renders. bootSettings
  // never puts an older copy back over a live update (lib/settingsLive.ts).
  bootSettings(settings);
  // From here on, changes the admin saves reach this page without a reload.
  useEffect(() => startSettingsSync(), []);
  return <>{children}</>;
}
