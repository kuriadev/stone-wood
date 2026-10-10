import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Packages",
  description: "Day Tour, Night Tour and Whole Day packages at StoneWood Private Resort — pool, events venue, or both, with what each includes.",
  path: "/packages",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
