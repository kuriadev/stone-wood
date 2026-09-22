import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { ClientShell } from "@/components/layout/ClientShell"; 
import { HERO_BG } from "@/lib/constants";
import { imageAt } from "@/lib/img";

export const metadata: Metadata = {
  title: "StoneWood Private Resort – Angono, Rizal",
  description:
    "An exclusive private resort experience crafted for those who seek luxury, privacy, and nature. Located in Angono, Rizal, Philippines.",
  keywords:
    "resort, private resort, Angono, Rizal, swimming pool, day tour, Philippines",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Weights trimmed to what the app actually renders, audited against
            every style object in the tree:
              • Cormorant italic (2 files, 76 KB) had ZERO usages.
              • Cormorant 300 (37 KB) had ZERO usages.
              • Cormorant 700 IS used 8 times but was never loaded, so those
                headings were being synthesised as faux-bold from 400.
            Net: 113 KB less font data AND the 700 headings now render in the
            real cut rather than a browser-stretched approximation. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* The hero photo is the LCP element on the home page. It is a CSS
            background, so the browser cannot discover it until the stylesheet
            has parsed — preloading starts the download immediately instead.
            Two links with matching media queries mirror the .sw-hero-photo
            rule in globals.css, so a phone only ever fetches the smaller crop
            and never pays for both. */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link
          rel="preload"
          as="image"
          media="(max-width: 900px)"
          href={imageAt(HERO_BG, 1000)}
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="image"
          media="(min-width: 901px)"
          href={HERO_BG}
          fetchPriority="high"
        />
      </head>
      <body>
        <Providers>
          <ClientShell>
            {children}
          </ClientShell>
        </Providers>
      </body>
    </html>
  );
}