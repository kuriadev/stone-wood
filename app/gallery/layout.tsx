import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Gallery",
  description: "Photos of the pool, rooms, events venue and grounds at StoneWood Private Resort, Angono, Rizal.",
  path: "/gallery",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
