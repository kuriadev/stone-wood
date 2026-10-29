import { GALLERY_MAX } from "@/lib/validators";
import { srcSetFor, imageAt } from "@/lib/img";
import type { MasonryItem } from "@/components/common/Masonry";

/**
 * Gallery helpers shared by the public /gallery page and the admin Gallery
 * tab's preview of it, so the preview cannot drift from the page.
 */

/** One gallery photo and the words a guest sees on it. */
export interface GalleryPhoto {
  url: string;
  /** Short name of what the photo shows, e.g. "Deluxe Room". May be blank. */
  title: string;
  /** One optional line under the title. */
  description: string;
}

export const GALLERY_TITLE_MAX = 60;
export const GALLERY_TEXT_MAX = 160;

/** A bare url as a photo with no words on it. */
export const toGalleryPhoto = (url: string): GalleryPhoto => ({ url, title: "", description: "" });

/** Trimmed, single-spaced, without control characters, and cut to length:
 *  what the server stores and the admin form previews. */
export function cleanCaption(text: unknown, max: number): string {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** How many masonry columns at each width. Shared with the admin preview,
 *  so it lays the photos out exactly as guests will see them. */
export function galleryColumns(w: number): number {
  return w < 768 ? 2 : w < 1024 ? 3 : 4;
}

/** The photos after the hero, as masonry tiles carrying the title and
 *  text staff wrote for them. */
export function galleryTiles(photos: GalleryPhoto[], columns: number): MasonryItem[] {
  const rest = photos.slice(1);
  const vw = Math.round(100 / columns);
  return rest.map((p, i) => {
    return {
      // Index first: the admin can upload the same photo twice.
      id: `${i}-${p.url}`,
      img: imageAt(p.url, 800),
      srcSet: srcSetFor(p.url),
      sizes: `${vw}vw`,
      full: imageAt(p.url, 1600),
      title: p.title || undefined,
      description: p.description || undefined,
      alt: p.title ? `${p.title}${p.description ? `. ${p.description}` : ""}` : `StoneWood Resort, photo ${i + 1} of ${rest.length}`,
    };
  });
}

/** A room's photos as gallery frames, cover first.
 *
 * `gallery` is the full set and `img` is the cover. A room saved before
 * galleries existed has only `img`, so that becomes a one-frame gallery and
 * MediaGallery hides its arrows and thumbnails on its own. Capped at
 * GALLERY_MAX so a hand-written API call cannot hand the guest fifty frames.
 */
export function roomShots(room: { name: string; img: string; gallery?: string[] }): { src: string; label: string }[] {
  const srcs = room.gallery?.length ? room.gallery : room.img ? [room.img] : [];
  // No caption. Every place that shows these frames already shows the room's
  // name beside them, so labelling each frame printed the name twice.
  return srcs.slice(0, GALLERY_MAX).map((src) => ({ src, label: "" }));
}
