"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
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
  // Every admin-editable collection is persisted the same way `bookings`
  // always was — otherwise a change made in /admin (marking food out,
  // closing a date, editing a room) only ever lived in that one tab's
  // memory and vanished the moment a guest opened /book or /menu fresh.
  const [bookings, setBookings] = usePersistedState<Booking[]>("sw_bookings", INIT_BOOKINGS);
  const [rooms, setRooms] = usePersistedState<Room[]>("sw_rooms", INIT_ROOMS);
  const [galleryImgs, setGalleryImgs] = usePersistedState<string[]>("sw_gallery", INIT_GALLERY);
  const [closedDates, setClosedDates] = usePersistedState<string[]>("sw_closed_dates", []);
  const [customerMessages, setCustomerMessages] = usePersistedState<CustomerMessage[]>("sw_customer_messages", []);
  // Not persisted on purpose — admin login should require signing in again
  // each session rather than silently staying authenticated forever.
  const [adminAuth, setAdminAuth] = useState(false);
  const [menuItems, setMenuItems] = usePersistedState<MenuItem[]>("sw_menu_items", INIT_MENU);
  const [facilities, setFacilities] = usePersistedState<Facility[]>("sw_facilities", INIT_FACILITIES);
  const [inventory, setInventory] = usePersistedState<InventoryItem[]>("sw_inventory", INIT_INVENTORY);
  const [packages, setPackages] = usePersistedState<ResortPackage[]>("sw_packages", INIT_PACKAGES);

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
