import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Refund Request",
  description: "Request a refund for a StoneWood booking.",
  path: "/customer/refund",
  noindex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
