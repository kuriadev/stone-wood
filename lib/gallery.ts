import { GALLERY_MAX } from "@/lib/validators";

/**
 * The shape of the public gallery mosaic.
 *
 * These two live here rather than inside `components/sections/Gallery.tsx`
 * because the admin Gallery tab draws the SAME grid as a preview. If the two
 * kept their own copies, the preview would quietly stop matching the page it
 * claims to show, which is the one thing that preview must never do.
 */

/** Column spans for the mosaic, on a repeating cycle over a 12-column grid.
 *  A row that cannot fit the next span ends early -- the gaps down the
 *  right-hand side are the layout, not a bug. */
export const GALLERY_SPANS = [7, 5, 4, 5, 7, 7, 4, 3, 4, 7];

/** Photos are stamped with a time of day, spread evenly across the resort's
 *  seventeen open hours (07:00 to 23:00) however many photos the admin has
 *  uploaded -- hence "Seventeen hours, told in order".
 *
 *  `i` is the index within the mosaic, i.e. AFTER the hero has been sliced
 *  off the front of the gallery array. */
export function galleryHourLabel(i: number, total: number): string {
  const span = 16; // 07:00 -> 23:00
  const hour = total <= 1 ? 7 : 7 + Math.round((i * span) / (total - 1));
  return `${String(hour).padStart(2, "0")}:00`;
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
  return srcs.slice(0, GALLERY_MAX).map((src, i) => ({
    src,
    label: i === 0 ? room.name : room.name + " \u2014 photo " + (i + 1),
  }));
}
