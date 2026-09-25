"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { useDbCollection } from "@/hooks/useDbCollection";
import { usePublicAvailability } from "@/hooks/usePublicAvailability";
import { useMaintenance } from "@/hooks/useMaintenance";
import type { MaintenanceState } from "@/types/maintenance";
import { COLLECTIONS } from "@/lib/collections";
import {
  INIT_BOOKINGS,
  INIT_ROOMS,
  INIT_GALLERY,
  INIT_FACILITIES,
  INIT_INVENTORY,
  INIT_PACKAGES,
} from "@/lib/constants";

import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { CustomerMessage } from "@/types/admin";
import type { Facility } from "@/types/facility";
import type { InventoryItem } from "@/types/inventory";
import type { ResortPackage } from "@/types/package";

interface AppState {
  /** Signed-in admin: every booking, editable.
   *  Guest: the real bookings with personal details stripped, read-only —
   *  enough for calendars and capacity checks. Guests create and cancel
   *  bookings through the API, never through setBookings. */
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  /** Reload the guest-side availability (e.g. right after booking). */
  refreshAvailability: () => Promise<void>;
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  galleryImgs: string[];
  setGalleryImgs: React.Dispatch<React.SetStateAction<string[]>>;
  closedDates: string[];
  setClosedDates: React.Dispatch<React.SetStateAction<string[]>>;
  customerMessages: CustomerMessage[];
  setCustomerMessages: React.Dispatch<React.SetStateAction<CustomerMessage[]>>;
  adminAuth: boolean;
  setAdminAuth: React.Dispatch<React.SetStateAction<boolean>>;
  facilities: Facility[];
  setFacilities: React.Dispatch<React.SetStateAction<Facility[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
  /** Per-collection first-fetch state, so a page can show a skeleton while
   *  its data is genuinely in flight rather than rendering the hardcoded
   *  INIT_* constants as if they were real. Each flag settles on success or
   *  failure — an unreachable API falls back to cache, it does not hang. */
  loading: {
    rooms: boolean;
    packages: boolean;
    gallery: boolean;
    availability: boolean;
    /** True while any public-facing collection is still on its first fetch.
     *  Drives the top progress bar, which should span the whole wait. */
    content: boolean;
  };
  /**
   * Whether a page should show a skeleton instead of its content.
   *
   * Deliberately narrower than `loading`: it is true only while a collection
   * is in flight AND has nothing real to show yet. Keying a skeleton on
   * `loading` alone would show it on every visit, including the common one
   * where the localStorage cache is warm and the page could paint real rooms
   * straight away. Measured with the cache warm and the network throttled to
   * 900ms latency: one frame of skeleton (~60ms, the render before the cache
   * effect runs) versus ~3.4s cold. The cache cannot be read during render
   * without a hydration mismatch — see useDbCollection — so that one frame is
   * the floor, not a bug.
   */
  skeleton: {
    rooms: boolean;
    packages: boolean;
    gallery: boolean;
  };
  /** Whether the public site is closed, and why. Polled, so a visitor who
   *  is already on the site sees the switch flip without refreshing. */
  maintenance: MaintenanceState;
  /** Push a just-saved state in immediately rather than waiting out the
   *  poll — used by the admin's Maintenance tab after it writes. */
  applyMaintenance: (next: MaintenanceState) => void;
  refreshMaintenance: () => Promise<void>;
}

const AppCtx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Not persisted on purpose — admin login should require signing in again
  // each session rather than silently staying authenticated forever.
  const [adminAuth, setAdminAuth] = useState(false);

  // Every collection now reads from Supabase through the API routes, with
  // localStorage kept only as a first-paint cache. The setters behave exactly
  // like useState, so nothing downstream changed: useDbCollection diffs each
  // new array against the last one the server confirmed and pushes only the
  // difference. See lib/collections.ts for the per-collection rules.
  //
  // The INIT_* constants stay as the offline fallback for a browser that has
  // never loaded the site and cannot reach the API.
  const [adminBookings, setBookings] = useDbCollection<Booking>(COLLECTIONS.bookings, INIT_BOOKINGS, adminAuth);
  const publicAvailability = usePublicAvailability(!adminAuth);
  const { maintenance, refreshMaintenance, applyMaintenance } = useMaintenance();
  const bookings = adminAuth ? adminBookings : publicAvailability.bookings;
  const [rooms, setRooms, roomsMeta] = useDbCollection<Room>(COLLECTIONS.rooms, INIT_ROOMS);
  const [galleryImgs, setGalleryImgs, galleryMeta] = useDbCollection<string>(COLLECTIONS.gallery, INIT_GALLERY);
  const [closedDates, setClosedDates] = useDbCollection<string>(COLLECTIONS.closedDates, []);
  const [customerMessages, setCustomerMessages] = useDbCollection<CustomerMessage>(COLLECTIONS.customerMessages, [], adminAuth);
  const [adminFacilities, setFacilities] = useDbCollection<Facility>(COLLECTIONS.facilities, INIT_FACILITIES, adminAuth);
  // Same split as bookings above: the full facility rows are admin-only
  // (they carry caretaker notes and the last guest's name), so a guest
  // reads statuses from /api/availability instead. Without this their
  // copy was INIT_FACILITIES, where everything is hardcoded "Available",
  // and a room set to Under Maintenance was still bookable publicly.
  const facilities = adminAuth ? adminFacilities : publicAvailability.facilities;
  const [inventory, setInventory] = useDbCollection<InventoryItem>(COLLECTIONS.inventory, INIT_INVENTORY, adminAuth);
  const [packages, setPackages, packagesMeta] = useDbCollection<ResortPackage>(COLLECTIONS.packages, INIT_PACKAGES);

  return (
    <AppCtx.Provider value={{
      bookings, setBookings,
      refreshAvailability: publicAvailability.refresh,
      rooms, setRooms,
      galleryImgs, setGalleryImgs,
      closedDates, setClosedDates,
      customerMessages, setCustomerMessages,
      adminAuth, setAdminAuth,
      facilities, setFacilities,
      inventory, setInventory,
      packages, setPackages,
      loading: {
        rooms: roomsMeta.loading,
        packages: packagesMeta.loading,
        gallery: galleryMeta.loading,
        availability: publicAvailability.loading,
        content: roomsMeta.loading || packagesMeta.loading || galleryMeta.loading,
      },
      maintenance,
      applyMaintenance,
      refreshMaintenance,
      skeleton: {
        rooms: roomsMeta.loading && !roomsMeta.hydrated,
        packages: packagesMeta.loading && !packagesMeta.hydrated,
        gallery: galleryMeta.loading && !galleryMeta.hydrated,
      },
    }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
