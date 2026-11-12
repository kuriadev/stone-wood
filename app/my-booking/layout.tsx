import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// Server layout so this Client Component route can still declare its metadata.
export const metadata = pageMetadata({
  title: "Manage Booking",
  description: "Look up your Stonewood Garden booking, check your payment, or move it to another date.",
  path: "/my-booking",
  noindex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
