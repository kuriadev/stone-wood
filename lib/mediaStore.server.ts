// ── Photos as files, not as text in the database (server only)
//
// The admin uploads a photo as a compressed data: URL (lib/image.ts
// compressImage). Kept like that inside a room, a package or the gallery,
// every one of them rode along in /api/rooms, /api/packages and
// /api/gallery: about 20 MB that every visitor downloaded before a single
// photo could show, and that the browser could not keep (localStorage holds
// about 5 MB), so it came down again on every visit and after every save.
//
// Now each photo is stored once as a file in the public "site-media" bucket
// (the one the home page's hero already uses) and the record keeps only its
// link. The file's name is a hash of its bytes, so the same photo is stored
// once however often it is saved, and the browser can cache it for good.
//
// Anything that isn't a data: URL (an https link the admin pasted, a photo
// already moved) is left as it is. If storage can't be reached the data:
// URL is kept, so a save never fails because of this.

import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SITE_MEDIA_BUCKET, HERO_UPLOAD } from "@/lib/heroMedia";

const DATA_URL = /^data:(image\/(jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

let bucketReady: Promise<boolean> | null = null;

/** Make the public bucket the first time it is needed (as /api/site-content/hero does). */
function ensureBucket(): Promise<boolean> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const storage = getSupabaseAdmin().storage;
      const got = await storage.getBucket(SITE_MEDIA_BUCKET);
      if (!got.error) return true;
      const made = await storage.createBucket(SITE_MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: HERO_UPLOAD.video.maxBytes,
        allowedMimeTypes: [...HERO_UPLOAD.image.types, "image/gif", "image/avif", ...HERO_UPLOAD.video.types],
      });
      return !made.error || /exists/i.test(made.error.message);
    })().catch(() => {
      bucketReady = null;
      return false;
    });
  }
  return bucketReady;
}

/** True for a photo still stored as text. */
export const isDataImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

/** One photo: a data: URL becomes a stored file's public link; anything
 *  else comes back unchanged. `folder` groups them ("rooms", "packages"…). */
export async function storeImage(ref: string, folder: string): Promise<string> {
  const m = typeof ref === "string" ? DATA_URL.exec(ref) : null;
  if (!m) return ref;
  try {
    if (!(await ensureBucket())) return ref;
    const type = m[1];
    const bytes = Buffer.from(m[3], "base64");
    const path = `${folder}/${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${EXT[type]}`;
    const storage = getSupabaseAdmin().storage.from(SITE_MEDIA_BUCKET);
    const up = await storage.upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
    // Already there: the same photo was stored before.
    if (up.error && !/exists|duplicate/i.test(up.error.message)) {
      console.warn("[mediaStore] upload failed, keeping the photo inline:", up.error.message);
      return ref;
    }
    return storage.getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn("[mediaStore] keeping the photo inline:", err instanceof Error ? err.message : err);
    return ref;
  }
}

/** A list of photos, in order. */
export async function storeImages(refs: string[], folder: string): Promise<string[]> {
  return Promise.all(refs.map((r) => storeImage(r, folder)));
}
