// ── The home page's hero background: a photo or a video
//
// Staff choose it in Website Photos. Stored in site_content ("hero_media");
// the file itself lives in the public "site-media" storage bucket (or is any
// https link). No row means the built-in photo (HERO_BG). Pure; tested in
// tests/unit/heroMedia.test.ts.

export type HeroMedia = { kind: "image" | "video"; src: string };

export const HERO_MEDIA_KEY = "hero_media";
export const SITE_MEDIA_BUCKET = "site-media";

/** The home page backgrounds staff can change in Website Photos: the hero
 *  at the top (photo or video), and the closing band at the bottom ("Your
 *  day at Stonewood Garden", a photo). Each is its own site_content row. */
export type SiteMediaSlot = "hero" | "closing";
export const SITE_MEDIA_SLOTS: Record<SiteMediaSlot, { key: string; video: boolean; label: string }> = {
  hero: { key: HERO_MEDIA_KEY, video: true, label: "hero background" },
  closing: { key: "closing_media", video: false, label: "closing background" },
};
/** ?slot= from a request; anything else is the hero. */
export const slotOf = (raw: string | null | undefined): SiteMediaSlot => (raw === "closing" ? "closing" : "hero");

/** What may be uploaded, and how big. A hero video should be short and
 *  compressed: it plays for every visitor, phones included. */
export const HERO_UPLOAD = {
  image: { types: ["image/png", "image/jpeg", "image/webp"], maxBytes: 10 * 1024 * 1024, label: "PNG, JPG or WebP, up to 10 MB" },
  video: { types: ["video/mp4"], maxBytes: 50 * 1024 * 1024, label: "MP4, up to 50 MB" },
} as const;

export type HeroCheck = { ok: true; media: HeroMedia } | { ok: false; error: string };

export function validateHeroMedia(raw: unknown): HeroCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== "image" && kind !== "video") return { ok: false, error: "Choose a photo or a video." };
  const src = String(r.src ?? "").trim();
  if (!/^https:\/\/\S+$/i.test(src) || src.length > 2000) return { ok: false, error: "The file's address should be an https:// link." };
  return { ok: true, media: { kind, src } };
}

/** Problem with a file about to be uploaded, or null. */
export function heroUploadProblem(kind: HeroMedia["kind"], type: string, bytes: number): string | null {
  const rule = HERO_UPLOAD[kind];
  if (!(rule.types as readonly string[]).includes(type)) return `That file isn't allowed here: ${rule.label}.`;
  if (!Number.isFinite(bytes) || bytes <= 0) return "That file is empty.";
  if (bytes > rule.maxBytes) return `That file is too large (${(bytes / 1024 / 1024).toFixed(1)} MB): ${rule.label}.`;
  return null;
}

/** Where an upload is stored: one folder, a fresh name each time so a new
 *  hero never shows a browser's cached copy of the old one. */
export function heroUploadPath(kind: HeroMedia["kind"], type: string, stamp: number, slot: SiteMediaSlot = "hero"): string {
  const ext = type === "video/mp4" ? "mp4" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `${slot}/${kind}-${stamp}.${ext}`;
}
