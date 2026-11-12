import type { Metadata, Viewport } from "next";
import { THEME_BOOT_SCRIPT } from "@/lib/themeBoot";
import localFont from "next/font/local";
import "./globals.css";
import "./intro.css";
import { Providers } from "@/components/layout/Providers";
import { ClientShell } from "@/components/layout/ClientShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE, resortJsonLd } from "@/lib/seo";
import { SettingsBoot } from "@/components/layout/SettingsBoot";
import { IntroSplash } from "@/components/layout/IntroSplash";
import { ensureSettings } from "@/lib/settings.server";

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
  keywords: ["resort", "private resort", "Angono", "Rizal", "swimming pool", "day stay", "events venue", "Philippines"],
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

/* Pages are pre-built, and the layout reads the owner's Rates & Settings.
   Rebuilt at most a minute after a change — and at once when the owner
   saves, which revalidates the whole site (app/api/settings). */
export const revalidate = 60;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The keyboard shrinks the page instead of sliding over it, so the field
  // being typed in stays in view (Android Chrome and in-app browsers).
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The owner's rates, limits, hours and contacts (Rates & Settings), read
  // here once per request (cached a minute) and handed to the browser so
  // both render the same numbers.
  const settings = await ensureSettings();
  return (
    /* `sw-dark` is set here, in the server HTML, because dark is the default
       theme. It used to be added by an effect after hydration, so the first
       paint used the LIGHT palette under a dark body and then flipped.
       ThemeContext still toggles it from there; suppressHydrationWarning
       covers this element's own attributes only. */
    <html lang="en" className={`${satoshi.variable} sw-dark`} suppressHydrationWarning>
      <head>
        {/* Light or dark like the device, before the first paint
            (lib/themeBoot.ts), so the page never flashes the other theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* Every page shows Unsplash photos. The home page's hero preload is
            in app/page.tsx, so other pages don't download it. */}
        <link rel="preconnect" href="https://images.unsplash.com" />
      </head>
      <body>
        {/* The first-load intro: in the HTML, so it is the first paint. */}
        <IntroSplash />
        <JsonLd data={resortJsonLd()} />
        <SettingsBoot settings={settings}>
          <Providers>
            <ClientShell>{children}</ClientShell>
          </Providers>
        </SettingsBoot>
      </body>
    </html>
  );
}
