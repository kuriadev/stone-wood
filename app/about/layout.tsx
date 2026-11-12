import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "About",
  description: "Stonewood Garden is a family-run private resort in Angono, Rizal: hours, rates, what's included with your stay, and answers to common questions.",
  path: "/about",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
