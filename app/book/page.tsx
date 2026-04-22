"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { BookNow } from "@/components/sections/BookNow";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function BookPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { bookings, setBookings, rooms, closedDates } = useApp();

  // Support ?room=1 and ?date=2026-05-10 from Rooms page / Home calendar
  const preselectedRoom = params.get("room")
    ? Number(params.get("room"))
    : null;
  const preselectedDate = params.get("date") ?? "";

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
      <Navbar page="Book Now" setPage={nav} />
      <BookNow
        bookings={bookings}
        setBookings={setBookings}
        rooms={rooms}
        closedDates={closedDates}
        preselectedRoom={preselectedRoom}
        clearPreselected={() => router.replace("/book")}
        preselectedDate={preselectedDate}
        clearPreselectedDate={() => router.replace("/book")}
        onGoHome={() => router.push("/")}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
