import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Rooms",
  description: "Rooms at StoneWood Private Resort in Angono, Rizal — rented per Day or Night slot, with photos, capacity and rates.",
  path: "/rooms",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
