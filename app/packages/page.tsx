"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { PackagesPage } from "@/components/sections/PackagesPage";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { buildPackageBookingUrl } from "@/lib/utils";

export default function PackagesRoute() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { packages } = useApp();

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
      <Navbar page="Packages" setPage={nav} />
      <PackagesPage
        setPage={nav}
        packages={packages}
        onBookPackage={(pkg, resource, tier) =>
          router.push(
            buildPackageBookingUrl(
              {
                code: pkg.code,
                title: pkg.title,
                price: pkg.price,
                listPrice: pkg.listPrice,
                capacity: pkg.capacity,
                requiresRoom: pkg.requiresRoom,
                slotMode: pkg.slotMode,
              },
              resource,
              tier
            )
          )
        }
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
