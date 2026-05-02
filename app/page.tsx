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

export default function HomePage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { bookings, closedDates, reviews } = useApp();
  const [selectedDate, setSelectedDate] = useState("");
  const [page, setPage] = useState("Home");
  
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
    <div style={{ background: "radial-gradient(circle at center, rgba(201,168,76,0.15), #0b0a07)" }}>
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