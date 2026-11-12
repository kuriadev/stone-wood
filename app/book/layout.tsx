import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Book Now",
  description: "Check live availability and book Stonewood Garden Private Resort online: pay half by GCash, upload your receipt, and our staff confirm it.",
  path: "/book",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
