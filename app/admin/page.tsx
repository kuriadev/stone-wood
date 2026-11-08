"use client";

import { useEffect, useRef } from "react";
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

  // Guard. `adminAuth` lives in memory, so a reload starts it at false even
  // though the httpOnly session cookie is still valid. Before sending anyone
  // to /login, ask the server whether that cookie still names an active
  // account; it enforces the 8-hour and idle limits, so an expired session
  // still lands on the sign-in page.
  //
  // Only on first load: once this page has been signed in, a later false
  // (Log out, a deactivated account) must go straight to /login, not race
  // the logout request and quietly sign back in.
  const restoreTried = useRef(false);
  useEffect(() => {
    if (adminAuth) { restoreTried.current = true; return; }
    if (restoreTried.current) { router.replace("/login"); return; }
    restoreTried.current = true;
    let live = true;
    let answered = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => {
        if (!live) return;
        answered = true;
        if (res.ok) setAdminAuth(true);
        else router.replace("/login");
      })
      .catch(() => { if (live) { answered = true; router.replace("/login"); } });
    // Cancelled before an answer (e.g. dev StrictMode re-running effects):
    // let the next run ask again instead of treating it as signed out.
    return () => { live = false; if (!answered) restoreTried.current = false; };
  }, [adminAuth, router, setAdminAuth]);

  // Nothing renders while the session is checked or the redirect happens
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
