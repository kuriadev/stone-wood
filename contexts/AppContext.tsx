"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import {
  INIT_BOOKINGS,
  INIT_ROOMS,
  INIT_GALLERY,
  INIT_REVIEWS,
} from "@/lib/constants";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { Review } from "@/types/review";
import type { CustomerMessage } from "@/types/admin";

interface AppState {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  galleryImgs: string[];
  setGalleryImgs: React.Dispatch<React.SetStateAction<string[]>>;
  closedDates: string[];
  setClosedDates: React.Dispatch<React.SetStateAction<string[]>>;
  reviews: Review[];
  customerMessages: CustomerMessage[];
  setCustomerMessages: React.Dispatch<React.SetStateAction<CustomerMessage[]>>;
  adminAuth: boolean;
  setAdminAuth: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppCtx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>(INIT_BOOKINGS);
  const [rooms, setRooms] = useState<Room[]>(INIT_ROOMS);
  const [galleryImgs, setGalleryImgs] = useState<string[]>(INIT_GALLERY);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [reviews] = useState(INIT_REVIEWS);
  const [customerMessages, setCustomerMessages] = useState<CustomerMessage[]>([]);
  const [adminAuth, setAdminAuth] = useState(false);

  return (
    <AppCtx.Provider value={{
      bookings, setBookings,
      rooms, setRooms,
      galleryImgs, setGalleryImgs,
      closedDates, setClosedDates,
      reviews,
      customerMessages, setCustomerMessages,
      adminAuth, setAdminAuth,
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
