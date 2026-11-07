// The hero background staff set, read on the server so the home page's HTML
// already names the right photo (and preloads it). Null for the built-in
// photo, before the site_content table exists, or if the read fails: the
// page then falls back to the built-in photo and the client checks again.

import { getSupabaseAdmin } from "@/lib/supabase";
import { HERO_MEDIA_KEY, validateHeroMedia, type HeroMedia } from "@/lib/heroMedia";

export async function loadHeroMedia(): Promise<HeroMedia | null | undefined> {
  try {
    const { data, error } = await getSupabaseAdmin().from("site_content").select("data").eq("key", HERO_MEDIA_KEY).maybeSingle();
    if (error) return undefined;
    const v = data ? validateHeroMedia((data as { data: unknown }).data) : null;
    return v && v.ok ? v.media : null;
  } catch {
    return undefined;
  }
}
