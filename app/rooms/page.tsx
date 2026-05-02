"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { RoomsPage } from "@/components/sections/RoomsPage";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function RoomsRoute() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { rooms } = useApp();

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
      <Navbar page="Rooms" setPage={nav} />
      <RoomsPage
        setPage={nav}
        rooms={rooms}
        onAddToBooking={(id) => router.push(`/book?room=${id}`)}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
