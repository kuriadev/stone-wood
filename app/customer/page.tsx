"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { CustomerService } from "@/components/sections/CustomerService";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function CustomerRoute() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { setCustomerMessages } = useApp();

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
      <Navbar page="Customer Service" setPage={nav} />
      <CustomerService
        onSubmitMessage={(msg) => setCustomerMessages((prev) => [...prev, msg])}
      />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
