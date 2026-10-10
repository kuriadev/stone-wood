import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "About",
  description: "StoneWood is a family-run private resort in Angono, Rizal — where stone meets the woods.",
  path: "/about",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
