"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { CustomerService } from "@/components/sections/CustomerService";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { CustomerMessage } from "@/types/admin";

export default function CustomerPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = T(isDark);
  const { setCustomerMessages } = useApp();

  const nav = (p: string) => {
    const routes: Record<string, string> = {
      "Home": "/",
      "Rooms": "/rooms",
      "Gallery": "/gallery",
      "About Us": "/about",
      "Book Now": "/book",
      "AdminLogin": "/login",
      "Customer Service": "/customer",
      "Cancel Booking": "/cancelbooking",
    };
    router.push(routes[p] ?? "/");
  };

  // ── This is the key connection: pushes the message into AppContext ──────────
  const handleSubmitMessage = (msg: CustomerMessage) => {
    setCustomerMessages((prev) => [...prev, msg]);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Navbar page="Customer Service" setPage={nav} />
      <CustomerService onSubmitMessage={handleSubmitMessage} />
      <Footer setPage={nav} />
      <ThemeToggle />
    </div>
  );
}
