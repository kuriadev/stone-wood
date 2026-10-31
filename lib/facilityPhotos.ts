// ── The photo each Resort Facility shows on Home
//
// Clicking a facility on Home opens its photo with the name and description
// over it. Staff set the photo in Facility Management (the amenity's edit
// window); it is stored in site_content, one row per facility, and served
// from /api/site-content/facility-photo so the page only downloads the one
// a guest opens. Until one is set, a stock photo picked from the name.
//
// Pure: no React, no Supabase. Tested in tests/unit/facilityPhotos.test.ts.

const UNSPLASH = (id: string) => `https://images.unsplash.com/photo-${id}?w=1400&q=80`;

/** Stock photos by what the name mentions, first match wins. */
const DEFAULTS: { test: RegExp; src: string }[] = [
  { test: /pool|swim/i, src: UNSPLASH("1582268611958-ebfd161ef9cf") },
  { test: /bbq|grill|barbecue/i, src: UNSPLASH("1555939594-58d7cb561ad1") },
  { test: /billiard|pool table|snooker/i, src: UNSPLASH("1761591847985-2184afaab747") },
  { test: /videoke|karaoke|sing/i, src: UNSPLASH("1516280440614-37939bbacd81") },
  { test: /park/i, src: UNSPLASH("1506521781263-d8422e82f27a") },
  { test: /event|venue|hall|function/i, src: UNSPLASH("1519167758481-83f550bb49b3") },
];
/** For a facility none of the above describes: the resort at dusk. */
const FALLBACK = UNSPLASH("1540541338287-41700207dee6");

/** The stock photo for a facility with no photo of its own. */
export function defaultFacilityPhoto(name: string): string {
  // "Billiards" before "pool": a "Pool Table" is not the swimming pool.
  const billiards = DEFAULTS[2];
  if (billiards.test.test(name)) return billiards.src;
  return DEFAULTS.find((d) => d.test.test(name))?.src ?? FALLBACK;
}

/** The site_content row a facility's photo lives in. */
export const facilityPhotoKey = (id: number) => `facility_photo:${id}`;
export const FACILITY_PHOTO_PREFIX = "facility_photo:";

/** The id back out of a row key, or null for a key that isn't one. */
export function facilityIdFromKey(key: string): number | null {
  if (!key.startsWith(FACILITY_PHOTO_PREFIX)) return null;
  const n = Number(key.slice(FACILITY_PHOTO_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Where the page loads a saved photo from. `v` changes with every save,
 *  so the browser may cache each version for good. */
export const facilityPhotoUrl = (id: number, updatedAt: string) =>
  `/api/site-content/facility-photo?id=${id}&v=${encodeURIComponent(String(Date.parse(updatedAt) || 0))}`;

/** Splits a base64 data URL into its type and bytes, or null. */
export function parseImageDataUrl(src: string): { type: string; base64: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/.exec(src);
  return m ? { type: m[1], base64: m[2] } : null;
}
