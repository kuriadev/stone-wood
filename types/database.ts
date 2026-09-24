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

import type { BookingStatus, BookingResource, BookingTier, BookingSource, BookingSlot, PackageSlotMode } from "./booking";
import type { InventoryCategory } from "./inventory";
import type { FacilityCategory, FacilityStatus } from "./facility";

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
  // ── Added by 20260923140000_booking_integrity.sql ──
  source: BookingSource;
  /** NULL on rows written before the column existed ⇒ treated as "Pool". */
  resource: BookingResource | null;
  /** NULL on older rows ⇒ derived from the guest count. */
  tier: BookingTier | null;
  archived: boolean;
  archived_at: string | null;
  /** The PayMongo payment intent that paid for an online booking. */
  payment_intent_id: string | null;
  /** Added by 20260924090000_slots_and_packages.sql. NULL on rows that
   *  predate it; the app reads those from the package label. */
  slot: BookingSlot | null;
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

// ── Added by 20260923090000_menu_facilities_packages.sql ────────────
// (menu_items and the food columns were dropped again by
// 20260923130000_remove_food.sql)

export interface FacilityRow {
  id: number;
  category: FacilityCategory;
  name: string;
  icon: string;
  status: FacilityStatus;
  room_id: number | null;
  last_used_booking_id: string | null;
  last_used_guest_name: string | null;
  last_checked_at: string | null;
  notes: string;
  before_use_checklist: string[] | null;
  after_use_checklist: string[] | null;
  created_at: string;
}

export interface PackageRow {
  id: number;
  code: string;
  title: string;
  resource: BookingResource;
  status: BookingTier;
  price: number;
  list_price: number | null;
  capacity: number;
  requires_room: boolean;
  /** Added by 20260924090000_slots_and_packages.sql. */
  slot_mode: PackageSlotMode;
  cover: string;
  gallery: { label: string; src: string; kind: string }[];
  blurb: string;
  includes: string[];
  note: string | null;
  active: boolean;
  created_at: string;
}
