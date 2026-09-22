// ── Supabase row shapes
//
// Hand-written to match supabase/migrations/. If you later install the
// Supabase CLI you can regenerate this file instead:
//   npx supabase gen types typescript --project-id <id> > types/database.ts
//
// Note the two places the DB deliberately differs from the UI types:
//   rooms.description  ←→  Room.desc        (`desc` is reserved in SQL)
//   *_at / *_qty       ←→  camelCase        (Postgres convention)
// lib/supabase.ts exports mappers that translate both directions.

import type { BookingStatus } from "./booking";
import type { InventoryCategory } from "./inventory";

export interface RoomRow {
  id: number;
  name: string;
  beds: string;
  capacity: number;
  price: number;
  description: string;
  img: string;
  created_at: string;
}

export interface BookingRow {
  id: string;
  name: string;
  contact: string;
  email: string;
  date: string;
  guests: number;
  package: string;
  rooms: number[];
  overtime: number;
  total: number;
  downpayment: number;
  status: BookingStatus;
  payment_proof: boolean;
  notes: string;
  cancel_reason: string | null;
  created_at: string;
}

export interface InventoryRow {
  id: number;
  category: InventoryCategory;
  name: string;
  qty: number;
  unit: string;
  min_qty: number;
  notes: string;
  deleted_at: string | null;
  created_at: string;
}

export interface CustomerMessageRow {
  id: number;
  name: string;
  email: string;
  type: string;
  message: string;
  date: string;
  archived_at: string | null;
  created_at: string;
}

export interface ClosedDateRow {
  date: string;
  reason: string;
}

export interface GalleryRow {
  id: number;
  url: string;
  sort_order: number;
  created_at: string;
}
