import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Book Now",
  description: "Check live availability and reserve StoneWood Private Resort online with a QR down payment.",
  path: "/book",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
