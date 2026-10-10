import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Only the API is blocked. Admin, login and the booking-management
      // pages carry `noindex` instead: a crawler has to be ALLOWED to fetch a
      // page to read its noindex, and a disallowed URL can still be indexed
      // bare from links pointing at it.
      disallow: ["/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
