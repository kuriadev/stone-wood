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
    reviews,
    customerMessages,
    setCustomerMessages,
    adminAuth,
    setAdminAuth,
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
      reviews={reviews}
      onLogout={() => {
        setAdminAuth(false);
        router.push("/");
      }}
      customerMessages={customerMessages}
      setCustomerMessages={setCustomerMessages}
    />
  );
}
