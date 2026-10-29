"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { Admin } from "@/components/sections/Admin";
import { OpsProvider } from "@/contexts/OpsContext";
import { StaffProvider, announceSignIn } from "@/contexts/StaffContext";

export default function AdminPage() {
  const router = useRouter();
  const {
    bookings,
    setBookings,
    rooms,
    setRooms,
    galleryPhotos,
    setGalleryPhotos,
    closedDates,
    setClosedDates,
    customerMessages,
    setCustomerMessages,
    adminAuth,
    setAdminAuth,
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
    <StaffProvider>
    <OpsProvider>
    <Admin
      bookings={bookings}
      setBookings={setBookings}
      rooms={rooms}
      setRooms={setRooms}
      galleryPhotos={galleryPhotos}
      setGalleryPhotos={setGalleryPhotos}
      closedDates={closedDates}
      setClosedDates={setClosedDates}

      onLogout={() => {
        // The session cookie is httpOnly, so clearing the React flag alone
        // would leave a working session behind. Only the server can expire it.
        void fetch("/api/auth/logout", { method: "POST" }).catch(() => {}).finally(announceSignIn);
        setAdminAuth(false);
        router.push("/");
      }}
      customerMessages={customerMessages}
      setCustomerMessages={setCustomerMessages}
      facilities={facilities}
      setFacilities={setFacilities}
      inventory={inventory}
      setInventory={setInventory}
      packages={packages}
      setPackages={setPackages}
    />
    </OpsProvider>
    </StaffProvider>
  );
}
