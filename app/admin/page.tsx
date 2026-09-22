"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { Admin } from "@/components/sections/Admin";

export default function AdminPage() {
  const router = useRouter();
  const {
    bookings,
    setBookings,
    rooms,
    setRooms,
    galleryImgs,
    setGalleryImgs,
    closedDates,
    setClosedDates,
    customerMessages,
    setCustomerMessages,
    adminAuth,
    setAdminAuth,
    menuItems,
    setMenuItems,
    facilities,
    setFacilities,
    inventory,
    setInventory,
    packages,
    setPackages,
  } = useApp();

  // Guard: redirect to login if not authenticated
  useEffect(() => {
    if (!adminAuth) {
      router.replace("/login");
    }
  }, [adminAuth, router]);

  // Don't render Admin UI while redirecting
  if (!adminAuth) return null;

  return (
    <Admin
      bookings={bookings}
      setBookings={setBookings}
      rooms={rooms}
      setRooms={setRooms}
      galleryImgs={galleryImgs}
      setGalleryImgs={setGalleryImgs}
      closedDates={closedDates}
      setClosedDates={setClosedDates}

      onLogout={() => {
        // The session cookie is httpOnly, so clearing the React flag alone
        // would leave a working session behind. Only the server can expire it.
        void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        setAdminAuth(false);
        router.push("/");
      }}
      customerMessages={customerMessages}
      setCustomerMessages={setCustomerMessages}
      menuItems={menuItems}
      setMenuItems={setMenuItems}
      facilities={facilities}
      setFacilities={setFacilities}
      inventory={inventory}
      setInventory={setInventory}
      packages={packages}
      setPackages={setPackages}
    />
  );
}
