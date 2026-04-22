"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
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
    const { bookings, setBookings } = useApp();

    const nav = (p: string) => {
        const routes: Record<string, string> = {
            "Home": "/", "Rooms": "/rooms", "Gallery": "/gallery",
            "About Us": "/about", "Book Now": "/book",
            "AdminLogin": "/login", "Customer Service": "/customer",
            "Cancel Booking": "/cancelbooking",
        };
        router.push(routes[p] ?? "/");
    };

    return (
        <div style={{ background: C.bg, minHeight: "100vh" }}>
            <Navbar page="Cancel Booking" setPage={nav} />
            <ManageBooking
                bookings={bookings}
                setBookings={setBookings}
                onGoHome={() => router.push("/")}
            />
            <Footer setPage={nav} />
            <ThemeToggle />
        </div>
    );
}
