import type { Metadata } from "next";
import { RESORT_CONTACT } from "@/lib/resort";
import { publicOrigin } from "@/lib/siteUrl";

/* ── SEO: one place for titles, canonicals, social cards and schema ──────
 *
 * Every route page is a Client Component, and a Client Component cannot
 * export `metadata`. So each public route gets a tiny server `layout.tsx`
 * that calls pageMetadata() — the page itself stays exactly as it is.
 *
 * NEXT_PUBLIC_SITE_URL should be the production origin. Without it, the
 * Vercel production domain is used, and off Vercel, localhost.
 */

export const SITE = {
  name: "Stonewood Garden Private Resort",
  shortName: "Stonewood Garden",
  url: publicOrigin(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "en_PH",
  description:
    "A family-run private resort in Angono, Rizal. Book a Day Stay, Night Stay or a 1–3 day Staycation, with a shared or private pool, rooms and an events venue. Free BBQ area, billiards, videoke and parking.",
  /** The link preview's photo (Messenger, Facebook, Viber …): the resort's
   *  own pool, 1200×630. A new file name, so apps that kept the old preview
   *  fetch this one. */
  image: "/images/og-cover.jpg",
} as const;

/** Flip to true once RESORT_CONTACT holds the owner's real number and email.
 *  Until then they are left out of the structured data: publishing a
 *  placeholder phone number to search engines is worse than publishing none. */
export const CONTACT_VERIFIED = false;

interface PageSeo {
  /** Short page name; the root layout's template appends " · Stonewood Garden Private Resort". */
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
    image: [`${SITE.url}${SITE.image}`],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Angono",
      addressRegion: "Rizal",
      addressCountry: "PH",
    },
    ...(CONTACT_VERIFIED ? { telephone: RESORT_CONTACT.phone, email: RESORT_CONTACT.email } : {}),
    amenityFeature: ["Swimming pool (shared or private)", "Events venue", "Rooms", "BBQ / grilling area", "Videoke", "Billiards", "Free parking"].map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
  };
}
