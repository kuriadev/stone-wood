// ── Loading the owner's settings (server only)
//
// SERVER ONLY.
//
// Reads the business_settings row (cached for a minute, so the many routes
// that price or check capacity don't each hit the database), merges it over
// the defaults, and applies it (lib/settings.ts) to this server's copy of
// the rates and hours. Every route that prices, checks capacity or builds a
// guest email calls ensureSettings() first.
//
// Before 20261012140000_business_settings.sql there is no table: the
// defaults apply, which are exactly the numbers the code always had.

import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_SETTINGS, applySettings, validateSettings, type BusinessSettings } from "@/lib/settings";

const TTL_MS = 60_000;
let cache: { at: number; settings: BusinessSettings; updatedAt: string | null; updatedBy: string | null; enabled: boolean } | null = null;

export async function loadSettings(): Promise<{ settings: BusinessSettings; updatedAt: string | null; updatedBy: string | null; enabled: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  let settings = DEFAULT_SETTINGS;
  let updatedAt: string | null = null;
  let updatedBy: string | null = null;
  let enabled = true;
  try {
    const { data, error } = await getSupabaseAdmin().from("business_settings").select("data, updated_at, updated_by_name").eq("id", 1).maybeSingle();
    if (error) {
      enabled = false;
      if (!/business_settings/.test(error.message)) console.error("[settings] could not load:", error.message);
    } else if (data) {
      const row = data as { data: unknown; updated_at: string; updated_by_name: string | null };
      const v = validateSettings(row.data);
      // A stored record that no longer validates (hand-edited, say) must not
      // take the booking flow down: fall back to the defaults and say so.
      if (v.ok) settings = v.settings;
      else console.error("[settings] stored settings are invalid, using defaults:", v.error);
      updatedAt = row.updated_at;
      updatedBy = row.updated_by_name;
    }
  } catch (err) {
    console.error("[settings] could not load:", err);
  }
  cache = { at: Date.now(), settings, updatedAt, updatedBy, enabled };
  return cache;
}

/** Load (cached) and apply. Call before pricing, capacity or guest email. */
export async function ensureSettings(): Promise<BusinessSettings> {
  const { settings } = await loadSettings();
  applySettings(settings);
  return settings;
}

/** After the owner saves: the next read goes to the database. */
export function forgetSettings(): void {
  cache = null;
}
