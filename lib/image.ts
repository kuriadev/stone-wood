// ── Photos: how they are shrunk, and what the server will accept
//
// Photos in this app are stored INLINE, as `data:` URLs in a text column —
// there is no object store. That is fine for the handful of pictures a
// resort website has, but it means an image is just a very long string, and
// a string field with a modest length cap will quietly destroy one.
//
// That is exactly what used to happen: /api/rooms cut `img` to 2000
// characters. A 2000-character data URL is about 1.4 KB of image, so every
// uploaded room photo was saved as a corrupt fragment while the request
// returned 200 OK. The cover looked fine until the page was reloaded.
//
// Two rules now keep that from recurring:
//
//   1. The browser SHRINKS a photo before sending it (compressImage), so a
//      phone snapshot arrives as a few hundred KB rather than several MB.
//   2. The server VALIDATES rather than truncates (cleanImageRef). An
//      oversized photo is refused with a message the admin can act on. A
//      silent half-save is never the answer — a rejected upload is annoying,
//      a corrupted one is invisible.

/** The longest image string the server stores, in characters.
 *  A data URL is ~4/3 the size of the file, so this is roughly 1.35 MB of
 *  image — far more than compressImage produces, and small enough that a
 *  row stays sane to read back. */
export const MAX_IMAGE_CHARS = 1_800_000;

/** A plain link (Unsplash, /public, a CDN) needs nothing like that much. */
export const MAX_URL_CHARS = 2000;

/** The raster types a browser renders safely inside <img>. SVG is left out
 *  deliberately: it is a document, not a bitmap, and there is no reason for
 *  a room photo to be one. */
const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/;

export type ImageCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validate one stored image reference — a `data:` URL or an ordinary link.
 * SERVER SIDE. Returns the value to store, or the reason it was refused.
 * It never shortens what it is given.
 */
export function cleanImageRef(raw: unknown, what = "photo"): ImageCheck {
  const v = String(raw ?? "").trim();
  if (!v) return { ok: true, value: "" };

  if (v.startsWith("data:")) {
    if (!DATA_IMAGE.test(v)) {
      return { ok: false, error: `That ${what} isn't a PNG, JPEG, WebP, GIF or AVIF image.` };
    }
    if (v.length > MAX_IMAGE_CHARS) {
      return {
        ok: false,
        error: `That ${what} is too large (about ${Math.round((v.length * 3) / 4 / 1024 / 1024 * 10) / 10} MB). Please use a smaller picture.`,
      };
    }
    return { ok: true, value: v };
  }

  if (v.length > MAX_URL_CHARS) return { ok: false, error: `That ${what} link is too long.` };
  return { ok: true, value: v };
}

/** The same check across a list, stopping at the first bad one. */
export function cleanImageList(raw: unknown[], what = "photo"): { ok: true; value: string[] } | { ok: false; error: string } {
  const out: string[] = [];
  for (const item of raw) {
    const r = cleanImageRef(item, what);
    if (!r.ok) return r;
    if (r.value) out.push(r.value);
  }
  return { ok: true, value: out };
}

/**
 * Shrink a chosen file to a modest JPEG data URL. BROWSER ONLY — it uses a
 * canvas.
 *
 * `maxDim` bounds the longest edge; quality steps down until the result fits
 * under MAX_IMAGE_CHARS, so even a 12 MP phone photo comes back storable.
 */
export async function compressImage(file: File, maxDim = 1600): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result));
    rd.onerror = () => reject(new Error("Couldn't read that file."));
    rd.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file isn't a picture."));
    i.src = url;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_IMAGE_CHARS && quality > 0.3) {
    quality -= 0.15;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}
