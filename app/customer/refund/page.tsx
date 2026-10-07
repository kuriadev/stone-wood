"use client";

/* /customer/refund — unlisted on purpose.
 *
 * A refund is only possible when the resort cancelled, so this page is
 * reached from the cancellation email and from the guest's own booking page,
 * never from the public nav. See components/sections/RefundRequest.tsx. */

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { RefundRequest } from "@/components/sections/RefundRequest";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function RefundPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);

  const nav = (p: string) => {
    const routes: Record<string, string> = {
      Home: "/", Rooms: "/rooms", Packages: "/packages", Gallery: "/gallery",
      "About Us": "/about", "Book Now": "/book", AdminLogin: "/login",
      "Customer Service": "/customer", "Cancel Booking": "/cancelbooking",
    };
    router.push(routes[p] ?? "/");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Navbar page="Customer Service" setPage={nav} />
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <RefundRequest setPage={nav} />
      </Suspense>
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
