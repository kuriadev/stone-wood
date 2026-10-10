import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Contact Us",
  description: "Questions about a booking or a visit? Send StoneWood Private Resort a message.",
  path: "/customer",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
