"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Home } from "@/components/sections/Home";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function HomePage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { bookings, closedDates, reviews } = useApp();

  const nav = (p: string) => {
    const routes: Record<string, string> = {
      Home: "/",
      Rooms: "/rooms",
      Gallery: "/gallery",
      "About Us": "/about",
      "Book Now": "/book",
      AdminLogin: "/login",
      "Customer Service": "/customer",
      "Cancel Booking": "/cancelbooking",
    };
    router.push(routes[p] ?? "/");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Navbar page="Home" setPage={nav} />
      <Home
        setPage={nav}
        onBookWithDate={(d) => router.push(`/book?date=${d}`)}
        bookings={bookings}
        closedDates={closedDates}
        reviews={reviews}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
