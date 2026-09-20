// ── Supabase clients and row mappers
//
// Nothing in the app imports this yet — the existing API routes still
// return their placeholder responses. Wire routes over one at a time.
//
// Two clients, and the difference matters:
//   supabase          browser-safe, anon key, constrained by RLS
//   getSupabaseAdmin  server-only, service role key, BYPASSES RLS
//
// Never import getSupabaseAdmin into a "use client" component. The
// guard below throws rather than letting the key reach the bundle.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Room } from "@/types/room";
import type { Booking } from "@/types/booking";
import type { InventoryItem } from "@/types/inventory";
import type { CustomerMessage } from "@/types/admin";
import type {
  RoomRow,
  BookingRow,
  InventoryRow,
  CustomerMessageRow,
} from "@/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** A leftover template placeholder is not a configuration.
 *  Without this check the values ship as non-empty strings, callers
 *  believe Supabase is ready, and requests go to a host that does not
 *  exist. Treat anything still wearing template text as unset. */
const isPlaceholder = (v: string): boolean =>
  !v || v.includes("your-project-ref") || v.startsWith("your-");

/** True once both public env vars hold real values, so callers can fall
 *  back to the hardcoded constants while the migration is in progress. */
export const isSupabaseConfigured =
  !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);

function missing(name: string): never {
  throw new Error(
    `${name} is not set or still holds a placeholder. Set it in ` +
      `.env.local (Supabase dashboard → Project Settings → API).`
  );
}

/** Browser-safe client. Subject to the RLS policies in supabase/schema.sql.
 *  Falls back to harmless placeholders so importing this file can never
 *  break a build that has not been configured yet. */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_ANON_KEY || "public-anon-key-not-set"
);

/** Server-only client. Bypasses RLS — use it exclusively inside route
 *  handlers, never in a component. */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabaseAdmin() was called in the browser. The service role key " +
        "must never reach the client — use the `supabase` export instead."
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  // Placeholders count as unset here too, so a half-filled .env.local
  // fails loudly at the call site instead of timing out against a
  // hostname that was never real.
  if (isPlaceholder(url)) missing("NEXT_PUBLIC_SUPABASE_URL");
  if (isPlaceholder(key)) missing("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ════════════════════════════════════════════════════════════════════
// MAPPERS
// The DB uses snake_case and `description`; the UI types use camelCase
// and `desc`. Translating here means components keep their existing
// shapes and nothing downstream has to change during the migration.
// ════════════════════════════════════════════════════════════════════

export const rowToRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  beds: r.beds,
  capacity: r.capacity,
  price: Number(r.price),
  desc: r.description,
  img: r.img,
});

export const roomToRow = (r: Room): Omit<RoomRow, "id" | "created_at"> => ({
  name: r.name,
  beds: r.beds,
  capacity: r.capacity,
  price: r.price,
  description: r.desc,
  img: r.img,
});

export const rowToBooking = (b: BookingRow): Booking => ({
  id: b.id,
  name: b.name,
  contact: b.contact,
  email: b.email,
  date: b.date,
  guests: b.guests,
  package: b.package,
  rooms: b.rooms ?? [],
  overtime: b.overtime,
  total: Number(b.total),
  downpayment: Number(b.downpayment),
  status: b.status,
  paymentProof: b.payment_proof,
  notes: b.notes,
  createdAt: b.created_at ? new Date(b.created_at).getTime() : undefined,
  cancelReason: b.cancel_reason,
});

export const bookingToRow = (b: Booking): Omit<BookingRow, "created_at"> => ({
  id: b.id,
  name: b.name,
  contact: b.contact,
  email: b.email,
  date: b.date,
  guests: b.guests,
  package: b.package,
  rooms: b.rooms,
  overtime: b.overtime,
  total: b.total,
  downpayment: b.downpayment,
  status: b.status,
  payment_proof: b.paymentProof,
  notes: b.notes,
  cancel_reason: b.cancelReason ?? null,
});

export const rowToInventoryItem = (i: InventoryRow): InventoryItem => ({
  id: i.id,
  category: i.category,
  name: i.name,
  qty: i.qty,
  unit: i.unit,
  minQty: i.min_qty,
  notes: i.notes,
  deletedAt: i.deleted_at ?? undefined,
});

export const rowToCustomerMessage = (m: CustomerMessageRow): CustomerMessage => ({
  id: m.id,
  name: m.name,
  email: m.email,
  type: m.type,
  message: m.message,
  date: m.date,
  createdAt: m.created_at,
  archivedAt: m.archived_at ?? undefined,
});
