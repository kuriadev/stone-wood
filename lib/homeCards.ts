// ── The "Stays & Room Rates" cards on Home, as staff edit them
//
// Until staff save their own, the cards are AUTOMATIC: built from the
// rates, hours and rooms in Rates & Settings (rateCards in lib/constants),
// so a price change reaches them by itself. Once staff edit them in
// Packages & Prices, the saved cards are shown exactly as written, and
// "Reset to automatic" goes back to the live ones.
//
// Pure: the API validates with it and both the page and the editor read it.

import type { IconName } from "@/components/common/Icon";
import { rateCards } from "@/lib/constants";
import { MAX_STAY_DAYS } from "@/lib/validators";

/** Where a card's button can take a guest: the site's own pages. */
export const HOME_CARD_LINKS = ["Rooms", "Packages", "Gallery", "Book Now", "About Us"] as const;
export type HomeCardLink = (typeof HOME_CARD_LINKS)[number];

/** The icons a card can wear: the ones that mean something at a resort. */
export const HOME_CARD_ICONS = [
  "sun", "moon", "clock", "sun-moon", "bed", "pool", "flame", "star", "gift",
  "utensils", "users", "car", "calendar-clock", "leaf", "palm", "mic", "billiards",
] as const satisfies readonly IconName[];
export type HomeCardIcon = (typeof HOME_CARD_ICONS)[number];

export interface HomeCard {
  id: string;
  icon: HomeCardIcon;
  title: string;
  description: string;
  /** As guests read it, e.g. "from ₱200". Typed, so it does not follow
   *  Rates & Settings once saved. */
  price: string;
  /** Small text after the price, e.g. "/guest". */
  unit: string;
  /** The checked lines under the price. */
  details: string[];
  /** An optional button to another page. */
  button: { label: string; link: HomeCardLink } | null;
}

export const HOME_CARDS_MAX = 8;
export const HOME_CARD_LIMITS = { title: 40, description: 160, price: 30, unit: 20, detail: 100, details: 6, buttonLabel: 30 } as const;

const peso = (n: number) => `₱${n.toLocaleString()}`;

/** The automatic cards: what Home shows until staff save their own. */
export function automaticHomeCards(rooms: { price: number }[]): HomeCard[] {
  return rateCards(rooms).map((c) => ({
    id: c.id,
    icon: (HOME_CARD_ICONS as readonly string[]).includes(c.icon) ? (c.icon as HomeCardIcon) : "star",
    title: c.label,
    description: c.desc,
    price: `${c.id === "wholeday" ? "" : "from "}${peso(c.base)}`,
    unit: c.unit,
    details: c.details,
    button: c.id === "room" ? { label: "VIEW ROOMS", link: "Rooms" } : null,
  }));
}

/** One line of card text: no control characters or angle brackets, single
 *  spaces, trimmed and cut to length. */
const line = (v: unknown, max: number) =>
  freshenCardText(String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max);

/** Cards saved before the renames (2026-11-12) read with today's words:
 *  "Day Tour" is "Day Stay", "Exclusive" is "Private pool", "Shared" is
 *  "Shared pool". Saving them again in the editor keeps the new words. */
export function freshenCardText(t: string): string {
  return t
    .replace(/\bDay Tours\b/g, "Day Stays").replace(/\bNight Tours\b/g, "Night Stays")
    .replace(/\bDay Tour\b/g, "Day Stay").replace(/\bNight Tour\b/g, "Night Stay")
    .replace(/\bTours\b/g, "Stays").replace(/\btours\b/g, "stays")
    .replace(/\/tour\b/g, "/stay").replace(/\bper tour\b/g, "per stay")
    .replace(/\bExclusive pool\b/g, "Private pool").replace(/\bExclusive\b/g, "Private pool")
    .replace(/\bShared:/g, "Shared pool:");
}

/** How many days a card's stay covers, for the tag beside its title:
 *  "1 day" for a Day or Night Stay, "1–3 days" for a Staycation, nothing
 *  for anything else (a room follows the stay it's added to). Read from the
 *  card's id or title, so saved cards get it too. */
export function homeCardDays(c: Pick<HomeCard, "id" | "title">): string | null {
  const t = `${c.id} ${c.title}`.toLowerCase();
  if (/staycation|wholeday|whole day/.test(t)) return `1–${MAX_STAY_DAYS} days`;
  if (/day stay|night stay|\b(day|night)\b/.test(t) && !/room/.test(t)) return "1 day";
  return null;
}

export type HomeCardsResult = { ok: true; cards: HomeCard[] } | { ok: false; error: string };

/** A clean list of cards from anything (the stored row, the editor). */
export function validateHomeCards(raw: unknown): HomeCardsResult {
  if (!Array.isArray(raw)) return { ok: false, error: "Cards must be a list." };
  if (raw.length === 0) return { ok: false, error: "Keep at least one card, or use Reset to automatic." };
  if (raw.length > HOME_CARDS_MAX) return { ok: false, error: `At most ${HOME_CARDS_MAX} cards.` };
  const L = HOME_CARD_LIMITS;
  const cards: HomeCard[] = [];
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const c = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const n = i + 1;
    const title = line(c.title, L.title);
    if (!title) return { ok: false, error: `Card ${n} needs a title.` };
    let id = line(c.id, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `card-${n}`;
    while (seen.has(id)) id = `${id}-${n}`;
    seen.add(id);
    const icon = (HOME_CARD_ICONS as readonly string[]).includes(String(c.icon)) ? (c.icon as HomeCardIcon) : "star";
    const details = (Array.isArray(c.details) ? c.details : [])
      .map((d) => line(d, L.detail))
      .filter(Boolean);
    if (details.length > L.details) return { ok: false, error: `Card ${n} ("${title}") can list at most ${L.details} lines.` };
    let button: HomeCard["button"] = null;
    const b = c.button as Record<string, unknown> | null | undefined;
    if (b && typeof b === "object") {
      const label = line(b.label, L.buttonLabel);
      const link = String(b.link);
      if (label) {
        if (!(HOME_CARD_LINKS as readonly string[]).includes(link)) return { ok: false, error: `Card ${n} ("${title}"): choose where its button goes.` };
        button = { label, link: link as HomeCardLink };
      }
    }
    // How many days the card covers is shown as a tag beside its title
    // (homeCardDays), so the text itself is left as written.
    const description = line(c.description, L.description);
    cards.push({
      id, icon, title,
      description,
      price: line(c.price, L.price),
      unit: line(c.unit, L.unit),
      details,
      button,
    });
  }
  return { ok: true, cards };
}
