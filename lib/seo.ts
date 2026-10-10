import type { Metadata } from "next";
import { HERO_BG } from "@/lib/constants";
import { RESORT_CONTACT } from "@/lib/resort";

/* ── SEO: one place for titles, canonicals, social cards and schema ──────
 *
 * Every route page is a Client Component, and a Client Component cannot
 * export `metadata`. So each public route gets a tiny server `layout.tsx`
 * that calls pageMetadata() — the page itself stays exactly as it is.
 *
 * NEXT_PUBLIC_SITE_URL must be the production origin (no trailing slash).
 * Without it, canonicals and OG URLs point at localhost.
 */

export const SITE = {
  name: "StoneWood Private Resort",
  shortName: "StoneWood",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  locale: "en_PH",
  description:
    "An exclusive private resort experience crafted for those who seek luxury, privacy, and nature. Located in Angono, Rizal, Philippines.",
  image: HERO_BG,
} as const;

/** Flip to true once RESORT_CONTACT holds the owner's real number and email.
 *  Until then they are left out of the structured data: publishing a
 *  placeholder phone number to search engines is worse than publishing none. */
export const CONTACT_VERIFIED = false;

interface PageSeo {
  /** Short page name; the root layout's template appends " · StoneWood Private Resort". */
  title: string;
  description: string;
  /** Route path, e.g. "/rooms". Becomes the canonical URL. */
  path: string;
  /** Absolute image URL for the social card. Defaults to the hero photo. */
  image?: string;
  /** Utility and private routes: kept out of the index, links still followed. */
  noindex?: boolean;
}

export function pageMetadata({ title, description, path, image = SITE.image, noindex = false }: PageSeo): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: SITE.locale,
      url: path,
      title: `${title} · ${SITE.name}`,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE.name}`, description, images: [image] },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

/** Schema.org `Resort` (a LodgingBusiness) for the home page. */
export function resortJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Resort",
    "@id": `${SITE.url}/#resort`,
    name: SITE.name,
    description: SITE.description,
    url: SITE.url,
    image: [SITE.image],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Angono",
      addressRegion: "Rizal",
      addressCountry: "PH",
    },
    ...(CONTACT_VERIFIED ? { telephone: RESORT_CONTACT.phone, email: RESORT_CONTACT.email } : {}),
    amenityFeature: ["Private swimming pool", "Events venue", "Rooms", "Videoke", "Billiards", "Parking"].map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
  };
}
