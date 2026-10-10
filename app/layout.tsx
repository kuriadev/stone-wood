import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { ClientShell } from "@/components/layout/ClientShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { HERO_BG } from "@/lib/constants";
import { imageAt } from "@/lib/img";
import { SITE, resortJsonLd } from "@/lib/seo";

/* Satoshi, self-hosted. It used to come from a Fontshare stylesheet: a
   render-blocking request to a third origin, then a second hop for the files,
   and upright cuts only — so the italic "Meets the Woods" in the hero was
   synthesised by the browser.

   next/font serves the files from this origin, preloads them, sets
   font-display: swap, and generates a metric-matched fallback face
   (adjustFontFallback) so the swap from fallback to Satoshi does not move
   any text — that is the CLS fix.

   The two variable files cover every weight (300–900) in one request each.
   Download them from fontshare.com/fonts/satoshi (Download family → the
   `Fonts/WEB/fonts` folder) into app/fonts/. */
const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Variable.woff2", weight: "300 900", style: "normal" },
    { path: "./fonts/Satoshi-VariableItalic.woff2", weight: "300 900", style: "italic" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} – Angono, Rizal`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: ["resort", "private resort", "Angono", "Rizal", "swimming pool", "day tour", "events venue", "Philippines"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    url: "/",
    title: `${SITE.name} – Angono, Rizal`,
    description: SITE.description,
    images: [{ url: SITE.image, width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description, images: [SITE.image] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `sw-dark` is set here, in the server HTML, because dark is the default
       theme. It used to be added by an effect after hydration, so the first
       paint used the LIGHT palette under a dark body and then flipped.
       ThemeContext still toggles it from there; suppressHydrationWarning
       covers this element's own attributes only. */
    <html lang="en" className={`${satoshi.variable} sw-dark`} suppressHydrationWarning>
      <head>
        {/* The hero photo is the LCP element on the home page. It is a CSS
            background, so the browser cannot discover it until the stylesheet
            has parsed — preloading starts the download immediately instead.
            Two links with matching media queries mirror the .sw-hero-photo
            rule in globals.css, so a phone only ever fetches the smaller crop. */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="preload" as="image" media="(max-width: 900px)" href={imageAt(HERO_BG, 1000)} fetchPriority="high" />
        <link rel="preload" as="image" media="(min-width: 901px)" href={HERO_BG} fetchPriority="high" />
      </head>
      <body>
        <JsonLd data={resortJsonLd()} />
        <Providers>
          <ClientShell>{children}</ClientShell>
        </Providers>
      </body>
    </html>
  );
}
