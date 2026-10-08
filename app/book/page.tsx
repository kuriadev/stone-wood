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
import type { ResortPackage } from "@/types/package";
import { isEventPackage } from "@/lib/packages";
import { buildPackageBookingUrl } from "@/lib/utils";
import { packageValue } from "@/lib/pricing";

export default function BookPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { bookings, refreshAvailability, rooms, closedDates, facilities, packages } = useApp();

  // Support ?room=1 and ?date=2026-05-10 from Rooms page / Home calendar
  const preselectedRoom = params.get("room")
    ? Number(params.get("room"))
    : null;
  const preselectedDate = params.get("date") ?? "";
  // ?slot=Day|Night|WholeDay&guests=N — set by the home page reservation card.
  const slotParam = params.get("slot");
  const initialSlot =
    slotParam === "Day" || slotParam === "Night" || slotParam === "WholeDay" ? slotParam : undefined;
  const guestsParam = Number(params.get("guests"));
  const initialGuests = Number.isFinite(guestsParam) && guestsParam > 0 ? guestsParam : undefined;
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
  // what switches Book Now into "date only" mode (see BookNow.tsx's
  // isPackage flag).
  const pkgCode = params.get("pkgCode");
  const pkgTitle = params.get("pkgTitle");
  const pkgPrice = params.get("pkgPrice");
  const pkgCapacity = params.get("pkgCapacity");
  const pkgListPrice = params.get("pkgListPrice");
  const pkgRequiresRoom = params.get("pkgRequiresRoom") === "1";
  const pkgSlotMode = params.get("pkgSlotMode") === "WholeDay" ? "WholeDay" : "Single";
  const initialPackage: PackageDeepLink | undefined =
    pkgCode && pkgTitle && pkgPrice && pkgCapacity
      ? {
          code: pkgCode,
          title: pkgTitle,
          price: Number(pkgPrice),
          capacity: Number(pkgCapacity),
          listPrice: pkgListPrice ? Number(pkgListPrice) : undefined,
          requiresRoom: pkgRequiresRoom || undefined,
          slotMode: pkgSlotMode,
        }
      : undefined;

  /* Packages offered inside step 1, split by the same rule as the Packages
     page's EVENTS tab: hall packages under the venue choices, pool-only ones
     under "Resort visit". Inactive ones never reach a guest. */
  const eventPackages = packages.filter((p) => p.active && isEventPackage(p));
  const resortPackages = packages.filter((p) => p.active && !isEventPackage(p));

  /* Booking one is the same deep link the Packages page builds, so Book Now
     reopens in package mode with the package's resource, tier, slot and
     capacity — no second code path, and the server quote is unchanged. */
  const bookPackage = (pkg: ResortPackage) => {
    router.push(
      buildPackageBookingUrl(
        {
          code: pkg.code,
          title: pkg.title,
          price: pkg.price,
          listPrice: packageValue(pkg).compare,
          capacity: pkg.capacity,
          requiresRoom: pkg.requiresRoom,
          slotMode: pkg.slotMode,
        },
        pkg.resource,
        pkg.status,
      ),
    );
  };

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

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Navbar page="Book Now" setPage={nav} />
      <BookNow
        /* Keyed on the deep-linked package so picking one REMOUNTS Book Now.
           Navigating to /book?pkg... from inside /book is a client-side
           navigation: the props change but the component stays mounted, so
           every useState initialiser below keeps its old value — the guest
           stayed on step 1 instead of landing on the date step, and the
           slot, guest count, tier and resource stayed on whatever the
           custom visit had rather than what the package dictates. */
        key={initialPackage?.code ?? "custom"}
        bookings={bookings}
        onBooked={() => void refreshAvailability()}
        rooms={rooms}
        closedDates={closedDates}
        facilities={facilities}
        preselectedRoom={preselectedRoom}
        clearPreselected={() => router.replace("/book")}
        preselectedDate={preselectedDate}
        clearPreselectedDate={() => router.replace("/book")}
        onGoHome={() => router.push("/")}
        initialResource={initialResource}
        initialSlot={initialSlot}
        initialGuests={initialGuests}
        initialTier={initialTier}
        initialPackage={initialPackage}
        eventPackages={eventPackages}
        resortPackages={resortPackages}
        onBookPackage={bookPackage}
        onClearPackage={() => router.replace("/book")}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
