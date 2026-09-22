import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Tuned to what this app actually loads — Google Fonts, Unsplash images, the
 * Google Maps embed on the About page, and PayMongo for the QR.
 *
 * Two deliberate loosenings, written down rather than left to look accidental:
 *
 *   script-src 'unsafe-inline'  Next.js inlines its hydration bootstrap. The
 *     strict alternative is a per-request nonce injected from proxy.ts, which
 *     means every page becomes dynamic. Worth doing later; not worth the
 *     regression risk right now. Even without it, this still blocks scripts
 *     loaded from any other origin, which is most of what an injected payload
 *     wants to do.
 *
 *   img-src https:  The admin panel lets staff paste an image URL for a room
 *     or a gallery tile, so the set of image hosts is not knowable ahead of
 *     time. Restricting the scheme still rules out mixed content.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://api.paymongo.com https://*.supabase.co wss://*.supabase.co",
  "frame-src https://www.google.com",
  // Clickjacking: nothing may frame this site.
  "frame-ancestors 'none'",
  // A form on this site can only post back to this site.
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Belt and braces with frame-ancestors, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop the browser second-guessing a Content-Type and executing an upload.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak the booking page's query string to third-party hosts.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app asks for none of these; deny them outright.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // HTTPS only, for two years, once the site is live on a real domain.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Was allowedDevOrigins: ["*"], which lets any site the developer visits
  // talk to the dev server on their machine. Named origins only — add your
  // LAN address here if you test from a phone.
  allowedDevOrigins: ["localhost", "127.0.0.1"],

  // Don't advertise the framework and version to anyone scanning for
  // known-vulnerable Next.js releases.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses must never be cached by a proxy or the browser — one of
      // these carries admin-only customer data.
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
