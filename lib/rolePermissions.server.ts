// SERVER ONLY -- the super admin's choices of what Front desk and Caretaker
// may do (lib/permissions.ts), stored in site_content ("role_permissions").

import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRoleOverrides, validateRoleOverrides, type RoleOverrides } from "@/lib/permissions";

export const ROLE_PERMISSIONS_KEY = "role_permissions";
let cache: { at: number; overrides: RoleOverrides } | null = null;
const TTL = 20_000;

/** Load (at most every 20 seconds) and apply. Before the site_content
 *  table exists, the built-in defaults stand. */
export async function ensureRolePermissions(): Promise<RoleOverrides> {
  if (cache && Date.now() - cache.at < TTL) return cache.overrides;
  let overrides: RoleOverrides = {};
  try {
    const { data } = await getSupabaseAdmin().from("site_content").select("data").eq("key", ROLE_PERMISSIONS_KEY).maybeSingle();
    if (data) overrides = validateRoleOverrides((data as { data: unknown }).data);
  } catch { /* keep the defaults */ }
  applyRoleOverrides(overrides);
  cache = { at: Date.now(), overrides };
  return overrides;
}

export function forgetRolePermissions(): void { cache = null; }
