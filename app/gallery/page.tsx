"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Gallery } from "@/components/sections/Gallery";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function GalleryRoute() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { galleryImgs } = useApp();

  const nav = (p: string) => {
    const routes: Record<string, string> = {
      Home: "/",
      Rooms: "/rooms",
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
      <Navbar page="Gallery" setPage={nav} />
      <Gallery galleryImgs={galleryImgs} />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
