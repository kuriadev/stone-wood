// ── Responsive image helpers
//
// Every photo in this app is a remote Unsplash URL rendered through a plain
// <img>. Unsplash resizes on demand via the `w` query parameter, so the same
// source can serve a 400px phone crop or a 1600px desktop one — the app was
// previously asking every device for the same large file.
//
// These helpers only touch images.unsplash.com URLs. Anything else (an
// uploaded data: URI, a PayMongo QR, a local file) is passed through
// unchanged, so callers can use them unconditionally.

const UNSPLASH = "images.unsplash.com";

/** The resort's own photos, stored as files (lib/mediaStore.server.ts).
 *  Saved full size, so they are resized by Next.js's image optimizer
 *  (/_next/image), which also serves WebP/AVIF and caches the result. */
const OWN_PHOTO = "/storage/v1/object/public/site-media/";

/** The widths /_next/image accepts: next.config.ts images.deviceSizes and
 *  imageSizes, together. A width in between is rounded up to the next. */
export const OPTIMIZER_WIDTHS = [96, 160, 240, 400, 600, 800, 1000, 1200, 1600, 1920] as const;

const isOwnPhoto = (url: string) => typeof url === "string" && url.startsWith("https://") && url.includes(".supabase.co" + OWN_PHOTO);

/** True when this URL supports on-the-fly resizing. */
export function isResizable(url: string): boolean {
  return typeof url === "string" && (url.includes(UNSPLASH) || isOwnPhoto(url));
}

/** The same image at a given pixel width. */
export function imageAt(url: string, width: number): string {
  if (!isResizable(url)) return url;
  if (isOwnPhoto(url)) {
    const w = OPTIMIZER_WIDTHS.find((x) => x >= width) ?? OPTIMIZER_WIDTHS[OPTIMIZER_WIDTHS.length - 1];
    return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
  }
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(width));
    // Never above 72: the sources ask for q=85, which on a 3x phone screen
    // fetched 300 KB photos that look the same at 72 (WebP/AVIF, below).
    const q = Number(u.searchParams.get("q") || 75);
    u.searchParams.set("q", String(Math.min(q, 72)));
    // auto=format lets Unsplash serve WebP/AVIF to browsers that accept it,
    // which is a large saving over JPEG at identical visual quality.
    u.searchParams.set("auto", "format");
    u.searchParams.set("fit", "crop");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * A srcSet across the widths that actually matter for this layout.
 * The browser then picks the smallest file that still fills the slot at the
 * device's pixel density — a 390px phone takes the 400w file instead of the
 * 800w one, roughly a quarter of the bytes.
 */
export function srcSetFor(
  url: string,
  widths: number[] = [400, 600, 800, 1200, 1600]
): string | undefined {
  if (!isResizable(url)) return undefined;
  return widths.map((w) => `${imageAt(url, w)} ${w}w`).join(", ");
}

/**
 * Common `sizes` hints. Without one the browser assumes the image spans the
 * full viewport and over-fetches, which defeats the srcSet entirely.
 */
export const SIZES = {
  /** Three-up card grid that collapses to one column on phones. */
  card: "(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 380px",
  /** Two-up grid. */
  half: "(max-width: 640px) 92vw, 50vw",
  /** Small square thumbnail in a table or list row. */
  thumb: "120px",
  /** Full-width media inside a modal. */
  modal: "(max-width: 768px) 96vw, 720px",
  /** Gallery tile. */
  tile: "(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 300px",
} as const;
