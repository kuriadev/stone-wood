"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { About } from "@/components/sections/About";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function AboutRoute() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);

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
    router.push(routes[p] ?? "/");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Navbar page="About Us" setPage={nav} />
      <About />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
