// SERVER ONLY -- staff photo links (lib/staffPhotos.ts).

import { getSupabaseAdmin } from "@/lib/supabase";
import { STAFF_PHOTO_PREFIX, staffIdFromKey, staffPhotoUrl } from "@/lib/staffPhotos";

/** id → versioned photo link, for everyone who has one. Empty before the
 *  site_content table exists. */
export async function staffPhotoUrls(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await getSupabaseAdmin().from("site_content").select("key, updated_at").like("key", `${STAFF_PHOTO_PREFIX}%`);
  for (const r of (data ?? []) as { key: string; updated_at: string }[]) {
    const id = staffIdFromKey(r.key);
    if (id) out.set(id, staffPhotoUrl(id, r.updated_at));
  }
  return out;
}
