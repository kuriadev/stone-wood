/* ── The site's public address, for links that leave the app ─────────────
 *
 * Email buttons, texted links, canonicals and the sitemap need an absolute
 * URL. The explicit variable wins. When it is missing on Vercel, the
 * project's production domain (a system variable Vercel always sets) fills
 * in; before, it fell straight to http://localhost:3000, so a guest who
 * booked on the live site got an email button that only opened on the
 * developer's laptop.
 *
 * Callers pass process.env.NEXT_PUBLIC_* written out in full, so Next.js
 * can still inline it at build time.
 */
export function publicOrigin(explicit: string | undefined): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}
