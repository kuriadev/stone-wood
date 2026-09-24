"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { ManageBooking } from "@/components/sections/CancelBooking";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function ManageBookingPage() {
    const router = useRouter();
    const { isDark } = useTheme();
    const C = T(isDark);

    const nav = (p: string) => {
        const routes: Record<string, string> = {
            "Home": "/", "Rooms": "/rooms", "Packages": "/packages", "Gallery": "/gallery",
            "About Us": "/about", "Book Now": "/book",
            "AdminLogin": "/login", "Customer Service": "/customer",
            "Cancel Booking": "/cancelbooking",
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
            <Navbar page="Cancel Booking" setPage={nav} />
            <ManageBooking
                onGoHome={() => router.push("/")}
            />
            <Footer setPage={nav} />
            <ThemeToggle />
        </div>
    );
}
