"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { useDbCollection } from "@/hooks/useDbCollection";
import { COLLECTIONS } from "@/lib/collections";
import {
  INIT_BOOKINGS,
  INIT_ROOMS,
  INIT_GALLERY,
  INIT_MENU,
  INIT_FACILITIES,
  INIT_INVENTORY,
  INIT_PACKAGES,
} from "@/lib/constants";

import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { CustomerMessage } from "@/types/admin";
import type { MenuItem } from "@/types/menu";
import type { Facility } from "@/types/facility";
import type { InventoryItem } from "@/types/inventory";
import type { ResortPackage } from "@/types/package";

interface AppState {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
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
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  facilities: Facility[];
  setFacilities: React.Dispatch<React.SetStateAction<Facility[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
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
  const [bookings, setBookings] = useDbCollection<Booking>(COLLECTIONS.bookings, INIT_BOOKINGS, adminAuth);
  const [rooms, setRooms] = useDbCollection<Room>(COLLECTIONS.rooms, INIT_ROOMS);
  const [galleryImgs, setGalleryImgs] = useDbCollection<string>(COLLECTIONS.gallery, INIT_GALLERY);
  const [closedDates, setClosedDates] = useDbCollection<string>(COLLECTIONS.closedDates, []);
  const [customerMessages, setCustomerMessages] = useDbCollection<CustomerMessage>(COLLECTIONS.customerMessages, [], adminAuth);
  const [menuItems, setMenuItems] = useDbCollection<MenuItem>(COLLECTIONS.menuItems, INIT_MENU);
  const [facilities, setFacilities] = useDbCollection<Facility>(COLLECTIONS.facilities, INIT_FACILITIES, adminAuth);
  const [inventory, setInventory] = useDbCollection<InventoryItem>(COLLECTIONS.inventory, INIT_INVENTORY, adminAuth);
  const [packages, setPackages] = useDbCollection<ResortPackage>(COLLECTIONS.packages, INIT_PACKAGES);

  return (
    <AppCtx.Provider value={{
      bookings, setBookings,
      rooms, setRooms,
      galleryImgs, setGalleryImgs,
      closedDates, setClosedDates,
      customerMessages, setCustomerMessages,
      adminAuth, setAdminAuth,
      menuItems, setMenuItems,
      facilities, setFacilities,
      inventory, setInventory,
      packages, setPackages,
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
