"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Home } from "@/components/sections/Home";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useState } from "react";
import { buildPackageBookingUrl } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { bookings, closedDates, packages, skeleton } = useApp();
  const [selectedDate, setSelectedDate] = useState("");
  const [page, setPage] = useState("Home");
  
const nav = (p: string) => {
  const routes: Record<string, string> = {
    Home: "/",
    Rooms: "/rooms",
    Packages: "/packages",
    Gallery: "/gallery",
    "About Us": "/about",
    "Book Now": "/book",
    AdminLogin: "/login",
    "Customer Service": "/customer",
    "Cancel Booking": "/cancelbooking",
  };

    const target = routes[p] ?? "/";

    const loader = (globalThis as any).loader?.current;

    if (!loader) {
      router.push(target);
      return;
    }


      // Start the bar and navigate immediately. This used to tick a
      // `progress` variable nothing ever read, then wait a fixed 500ms
      // before pushing — half a second of dead time on every internal
      // link — and it called finish() *before* navigating, so the bar
      // completed while the next page had not begun. ClientShell now
      // finishes it when the new route has actually rendered.
      loader.start();
      router.push(target);
  };

  // The gold wash behind the whole home page. Its second colour stop was
  // hardcoded to #0b0a07, so it stayed dark under a light theme — and
  // because it spans the full page height and sits under the transparent
  // Navbar, light mode showed a black band across the header. About.tsx
  // already does this effect per theme; this now matches it.
  return (
    <div
      style={{
        background: isDark
          ? `radial-gradient(circle at center, rgba(201,168,76,0.15), ${C.bg})`
          : `radial-gradient(circle at center, rgba(201,168,76,0.18), ${C.bg})`,
      }}
    >
      <Navbar page="Home" setPage={nav} />
      <Home
        setPage={nav}
        onBookWithDate={(d) => router.push(`/book?date=${d}`)}
        onBookPackage={(pkg, resource, tier) => router.push(buildPackageBookingUrl(pkg, resource, tier))}
        bookings={bookings}
        closedDates={closedDates}
        packages={packages}
        packagesLoading={skeleton.packages}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}