"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { BookNow } from "@/components/sections/BookNow";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { PackageDeepLink } from "@/types/booking";

export default function BookPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { bookings, setBookings, rooms, closedDates, menuItems, inventory, setInventory, facilities } = useApp();

  // Support ?room=1 and ?date=2026-05-10 from Rooms page / Home calendar
  const preselectedRoom = params.get("room")
    ? Number(params.get("room"))
    : null;
  const preselectedDate = params.get("date") ?? "";
  // Support ?resource=Venue&tier=Exclusive from a Home page package card —
  // lets a package deep-link straight into the matching Book Now setup
  // instead of a separate checkout flow.
  const resourceParam = params.get("resource");
  const initialResource =
    resourceParam === "Venue" || resourceParam === "Pool+Venue" || resourceParam === "Pool"
      ? resourceParam
      : undefined;
  const tierParam = params.get("tier");
  const initialTier = tierParam === "Shared" || tierParam === "Exclusive" ? tierParam : undefined;

  // Support the fuller ?pkgCode=...&pkgTitle=...&pkgPrice=...&pkgCapacity=...
  // (&pkgListPrice=... optional) set when a Home page package card is
  // clicked. A package is a fixed, one-time purchase — its presence here is
  // what switches Book Now into "date + food only" mode (see BookNow.tsx's
  // isPackage flag).
  const pkgCode = params.get("pkgCode");
  const pkgTitle = params.get("pkgTitle");
  const pkgPrice = params.get("pkgPrice");
  const pkgCapacity = params.get("pkgCapacity");
  const pkgListPrice = params.get("pkgListPrice");
  const pkgRequiresRoom = params.get("pkgRequiresRoom") === "1";
  const pkgFoodDiscountPct = params.get("pkgFoodDiscountPct");
  const initialPackage: PackageDeepLink | undefined =
    pkgCode && pkgTitle && pkgPrice && pkgCapacity
      ? {
          code: pkgCode,
          title: pkgTitle,
          price: Number(pkgPrice),
          capacity: Number(pkgCapacity),
          listPrice: pkgListPrice ? Number(pkgListPrice) : undefined,
          requiresRoom: pkgRequiresRoom || undefined,
          foodDiscountPct: pkgFoodDiscountPct ? Number(pkgFoodDiscountPct) : undefined,
        }
      : undefined;

  const nav = (p: string) => {
    const routes: Record<string, string> = {
      Home: "/",
      Rooms: "/rooms",
      Packages: "/packages",
      Menu: "/menu",
      Gallery: "/gallery",
      "About Us": "/about",
      "Book Now": "/book",
      AdminLogin: "/login",
      "Customer Service": "/customer",
    };
    const target = routes[p] ?? "/";

    const loader = (globalThis as any).loader?.current;

    if (!loader) {
      router.push(target);
      return;
    }


    loader.start();


    let progress = 20;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 90) clearInterval(interval);
    }, 120);


    setTimeout(() => {
      loader.finish();
      router.push(target);
    }, 500); 
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Navbar page="Book Now" setPage={nav} />
      <BookNow
        bookings={bookings}
        setBookings={setBookings}
        rooms={rooms}
        menuItems={menuItems}
        inventory={inventory}
        setInventory={setInventory}
        closedDates={closedDates}
        facilities={facilities}
        preselectedRoom={preselectedRoom}
        clearPreselected={() => router.replace("/book")}
        preselectedDate={preselectedDate}
        clearPreselectedDate={() => router.replace("/book")}
        onGoHome={() => router.push("/")}
        initialResource={initialResource}
        initialTier={initialTier}
        initialPackage={initialPackage}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
