import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Rooms",
  description: "Rooms at Stonewood Garden Private Resort in Angono, Rizal — add one to your Day Stay, Night Stay or Staycation. Photos, capacity and rates.",
  path: "/rooms",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
