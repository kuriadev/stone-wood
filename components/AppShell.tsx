"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { INIT_BOOKINGS, INIT_ROOMS, INIT_GALLERY, INIT_REVIEWS } from "@/lib/constants";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { CustomerMessage } from "@/types/admin";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

import { Home } from "@/components/sections/Home";
import { RoomsPage } from "@/components/sections/RoomsPage";
import { Gallery } from "@/components/sections/Gallery";
import { About } from "@/components/sections/About";
import { BookNow } from "@/components/sections/BookNow";
import { CustomerService } from "@/components/sections/CustomerService";
import { ManageBooking } from "@/components/sections/CancelBooking";
import { AdminLogin } from "@/components/sections/AdminLogin";
import { Admin } from "@/components/sections/Admin";

export function AppShell() {
  const { isDark } = useTheme();
  const C = T(isDark);

  const [page, setPage] = useState("Home");
  const [bookings, setBookings] = useState<Booking[]>(INIT_BOOKINGS);
  const [rooms, setRooms] = useState<Room[]>(INIT_ROOMS);
  const [galleryImgs, setGalleryImgs] = useState<string[]>(INIT_GALLERY);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [reviews] = useState(INIT_REVIEWS);
  const [adminAuth, setAdminAuth] = useState(false);
  const [preselectedRoom, setPreselectedRoom] = useState<number | null>(null);
  const [preselectedDate, setPreselectedDate] = useState("");
  const [customerMessages, setCustomerMessages] = useState<CustomerMessage[]>([]);

  const handleNewMessage = (msg: CustomerMessage) =>
    setCustomerMessages((p) => [...p, msg]);

  const goPage = (p: string) => {
    if (p === "AdminLogin") {
      adminAuth ? setPage("Admin") : setPage("AdminLogin");
    } else {
      setPage(p);
    }
    window.scrollTo(0, 0);
  };

  const goBookWithRoom = (id: number) => {
    setPreselectedRoom(id);
    setPage("Book Now");
    window.scrollTo(0, 0);
  };

  const goBookWithDate = (d: string) => {
    setPreselectedDate(d);
    setPage("Book Now");
    window.scrollTo(0, 0);
  };

  const handleLogin = () => {
    setAdminAuth(true);
    setPage("Admin");
  };

  const handleLogout = () => {
    setAdminAuth(false);
    setPage("Home");
  };

  const isAdmin = page === "Admin";
  const isLogin = page === "AdminLogin";

  return (
    <div
      className={isDark ? "sw-dark" : "sw-light"}
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'Jost',system-ui,sans-serif",
        transition: "background .35s ease,color .35s ease",
      }}
    >
      {!isAdmin && !isLogin && <Navbar page={page} setPage={goPage} />}

      {page === "Home" && (
        <Home
          setPage={goPage}
          onBookWithDate={goBookWithDate}
          bookings={bookings}
          closedDates={closedDates}
          reviews={reviews}
        />
      )}
      {page === "Rooms" && (
        <RoomsPage setPage={goPage} rooms={rooms} onAddToBooking={goBookWithRoom} />
      )}
      {page === "Gallery" && <Gallery galleryImgs={galleryImgs} />}
      {page === "About Us" && <About />}
      {page === "Book Now" && (
        <BookNow
          bookings={bookings}
          setBookings={setBookings}
          rooms={rooms}
          closedDates={closedDates}
          preselectedRoom={preselectedRoom}
          clearPreselected={() => setPreselectedRoom(null)}
          preselectedDate={preselectedDate}
          clearPreselectedDate={() => setPreselectedDate("")}
          onGoHome={() => goPage("Home")}
        />
      )}
      {page === "Customer Service" && (
        <CustomerService onSubmitMessage={handleNewMessage} />
      )}
      {(page === "Manage Booking" || page === "Cancel Booking") && (
        <ManageBooking bookings={bookings} setBookings={setBookings} />
      )}
      {page === "AdminLogin" && (
        <AdminLogin onLogin={handleLogin} onGoHome={() => goPage("Home")} />
      )}
      {page === "Admin" && adminAuth && (
        <Admin
          bookings={bookings}
          setBookings={setBookings}
          rooms={rooms}
          setRooms={setRooms}
          galleryImgs={galleryImgs}
          setGalleryImgs={setGalleryImgs}
          closedDates={closedDates}
          setClosedDates={setClosedDates}
          reviews={reviews}
          onLogout={handleLogout}
          customerMessages={customerMessages}
          setCustomerMessages={setCustomerMessages}
        />
      )}

      {!isAdmin && !isLogin && <Footer setPage={goPage} />}
      {!isAdmin && !isLogin && <ThemeToggle />}
    </div>
  );
}
