"use client";

// ── Rates & Settings, live in every open page
//
// The server renders each page with the settings of that moment
// (SettingsBoot). This keeps them current afterwards, without a reload:
//   • saving in Rates & Settings tells every other tab in this browser at
//     once (BroadcastChannel);
//   • any page re-reads /api/settings when it is shown again and once a
//     minute while it is open, which reaches other phones and computers.
// When the numbers actually change, `version` goes up; ClientShell keys the
// page on it so prices, hours and contact details redraw (pages with a form
// in progress get a notice instead -- see ClientShell).

import { applySettings, type BusinessSettings } from "@/lib/settings";

const CHANNEL = "sw-settings";
let current = "";
let version = 0;
const listeners = new Set<() => void>();

export const subscribeSettingsVersion = (on: () => void) => { listeners.add(on); return () => { listeners.delete(on); }; };
export const getSettingsVersion = () => version;

/** Use these settings; bumps the version only when something changed. */
function liveApply(s: BusinessSettings): void {
  const key = JSON.stringify(s);
  if (key === current) return;
  const first = current === "";
  current = key;
  applySettings(s);
  if (!first) {
    version++;
    listeners.forEach((l) => l());
  }
}

let bootKey = "";
/** From SettingsBoot on every render: applies the server's settings when
 *  they are new to this page, never an older copy over a live update. */
export function bootSettings(s: BusinessSettings): void {
  const key = JSON.stringify(s);
  if (key === bootKey) return;
  bootKey = key;
  liveApply(s);
}

/** After Rates & Settings saves: here at once, and in every other tab. */
export function announceSettings(s: BusinessSettings): void {
  liveApply(s);
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(s);
    ch.close();
  } catch { /* an old browser: the other tabs catch up within a minute */ }
}

async function refetch(): Promise<void> {
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const j = (await res.json()) as { success?: boolean; settings?: BusinessSettings };
    if (j.success && j.settings) liveApply(j.settings);
  } catch { /* offline: keep what is showing */ }
}

let started = false;
/** Once per page load (SettingsBoot). */
export function startSettingsSync(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => { if (e.data && typeof e.data === "object") liveApply(e.data as BusinessSettings); };
  } catch { /* polling below still works */ }
  const onShow = () => { if (document.visibilityState === "visible") void refetch(); };
  document.addEventListener("visibilitychange", onShow);
  window.addEventListener("focus", onShow);
  const tick = window.setInterval(onShow, 60_000);
  return () => {
    started = false;
    ch?.close();
    document.removeEventListener("visibilitychange", onShow);
    window.removeEventListener("focus", onShow);
    clearInterval(tick);
  };
}
