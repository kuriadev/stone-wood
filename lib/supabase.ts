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
import type { Facility } from "@/types/facility";
import type { ResortPackage } from "@/types/package";
import type {
  RoomRow,
  BookingRow,
  InventoryRow,
  CustomerMessageRow,
  FacilityRow,
  PackageRow,
  GalleryRow,
  PaymentRow,
  ExpenseRow,
  DailyClosingRow,
  DamageRateRow,
  InspectionRow,
  DamageRecordRow,
} from "@/types/database";
import type { Payment, Expense, DailyClosing, DamageRate, Inspection, DamageRecord } from "@/types/finance";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Supabase renamed the browser-safe key: the dashboard now emits
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) where it used to
// emit NEXT_PUBLIC_SUPABASE_ANON_KEY (a long eyJ… JWT). Both are read, newest
// first, so a copy-paste from either era of the dashboard works instead of
// landing in a variable nothing looks at.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

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

/** Browser-safe client. Subject to the RLS policies in supabase/migrations/.
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
  source: b.source ?? "Online",
  resource: b.resource ?? undefined,
  tier: b.tier ?? undefined,
  archived: b.archived || undefined,
  archivedAt: b.archived_at ?? undefined,
  paymentIntentId: b.payment_intent_id ?? undefined,
  slot: b.slot ?? undefined,
  arrivalTime: b.arrival_time ?? undefined,
});

/** `id` is left out: the database assigns it (see booking_ref_seq). */
export const bookingToRow = (b: Booking): Omit<BookingRow, "created_at" | "id"> => ({
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
  source: b.source ?? "Online",
  resource: b.resource ?? null,
  tier: b.tier ?? null,
  archived: !!b.archived,
  archived_at: b.archivedAt ?? null,
  payment_intent_id: b.paymentIntentId ?? null,
  slot: b.slot ?? null,
  arrival_time: b.arrivalTime && /^\d{2}:\d{2}$/.test(b.arrivalTime) ? b.arrivalTime : null,
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

// ── Facilities / packages, added with the second migration ───

export const rowToFacility = (f: FacilityRow): Facility => ({
  id: f.id,
  category: f.category,
  name: f.name,
  icon: f.icon,
  status: f.status,
  roomId: f.room_id ?? undefined,
  lastUsedBookingId: f.last_used_booking_id,
  lastUsedGuestName: f.last_used_guest_name,
  lastCheckedAt: f.last_checked_at,
  notes: f.notes,
  // undefined, not []: FacilitiesTab falls back to a category default
  // checklist when these are unset, and an empty array would suppress it.
  beforeUseChecklist: f.before_use_checklist ?? undefined,
  afterUseChecklist: f.after_use_checklist ?? undefined,
});

export const facilityToRow = (f: Facility): Omit<FacilityRow, "id" | "created_at"> => ({
  category: f.category,
  name: f.name,
  icon: f.icon,
  status: f.status,
  room_id: f.roomId ?? null,
  last_used_booking_id: f.lastUsedBookingId ?? null,
  last_used_guest_name: f.lastUsedGuestName ?? null,
  last_checked_at: f.lastCheckedAt ?? null,
  notes: f.notes,
  before_use_checklist: f.beforeUseChecklist ?? null,
  after_use_checklist: f.afterUseChecklist ?? null,
});

export const rowToPackage = (p: PackageRow): ResortPackage => ({
  id: p.id,
  code: p.code,
  title: p.title,
  resource: p.resource,
  status: p.status,
  price: Number(p.price),
  listPrice: p.list_price === null ? undefined : Number(p.list_price),
  capacity: p.capacity,
  requiresRoom: p.requires_room || undefined,
  slotMode: p.slot_mode ?? "Single",
  cover: p.cover,
  gallery: p.gallery ?? [],
  blurb: p.blurb,
  includes: p.includes ?? [],
  note: p.note ?? undefined,
  active: p.active,
});

export const packageToRow = (p: ResortPackage): Omit<PackageRow, "id" | "created_at"> => ({
  code: p.code,
  title: p.title,
  resource: p.resource,
  status: p.status,
  price: p.price,
  list_price: p.listPrice ?? null,
  capacity: p.capacity,
  requires_room: !!p.requiresRoom,
  slot_mode: p.slotMode ?? "Single",
  cover: p.cover,
  gallery: p.gallery ?? [],
  blurb: p.blurb,
  includes: p.includes ?? [],
  note: p.note ?? null,
  active: p.active,
});

/** Gallery is a plain list of URLs in the UI but a table with sort order
 *  in the DB, so ordering has to be preserved explicitly on the way out. */
export const rowsToGalleryUrls = (rows: GalleryRow[]): string[] =>
  [...rows].sort((a, b) => a.sort_order - b.sort_order).map((r) => r.url);

// ── Sales ledger and facility operations ─────────────────────────────

export const rowToPayment = (p: PaymentRow): Payment => ({
  id: p.id,
  bookingId: p.booking_id,
  guestName: p.guest_name,
  type: p.type,
  method: p.method,
  amount: Number(p.amount),
  reference: p.reference ?? "",
  notes: p.notes ?? "",
  receivedAt: p.received_at,
  voided: p.voided,
  voidReason: p.void_reason ?? undefined,
  voidedAt: p.voided_at ?? undefined,
});

export const rowToExpense = (e: ExpenseRow): Expense => ({
  id: e.id,
  category: e.category,
  description: e.description,
  amount: Number(e.amount),
  method: e.method,
  spentOn: e.spent_on,
  voided: e.voided,
  voidReason: e.void_reason ?? undefined,
});

export const rowToClosing = (c: DailyClosingRow): DailyClosing => ({
  closingDate: c.closing_date,
  openingFloat: Number(c.opening_float),
  cashIn: Number(c.cash_in),
  cashOut: Number(c.cash_out),
  expectedCash: Number(c.expected_cash),
  countedCash: Number(c.counted_cash),
  difference: Number(c.difference),
  totalCollected: Number(c.total_collected),
  totalExpenses: Number(c.total_expenses),
  notes: c.notes ?? "",
  closedAt: c.closed_at,
});

export const rowToDamageRate = (r: DamageRateRow): DamageRate => ({
  id: r.id,
  name: r.name,
  category: r.category,
  unit: r.unit,
  rate: Number(r.rate),
  active: r.active,
});

export const rowToInspection = (i: InspectionRow): Inspection => ({
  id: i.id,
  bookingId: i.booking_id,
  stage: i.stage,
  items: Array.isArray(i.items) ? i.items : [],
  notes: i.notes ?? "",
  inspectedAt: i.inspected_at,
});

export const rowToDamage = (d: DamageRecordRow): DamageRecord => ({
  id: d.id,
  bookingId: d.booking_id,
  inspectionId: d.inspection_id,
  facilityName: d.facility_name,
  rateId: d.rate_id,
  itemName: d.item_name,
  quantity: d.quantity,
  unitRate: Number(d.unit_rate),
  adjustment: Number(d.adjustment),
  adjustmentReason: d.adjustment_reason ?? "",
  amount: Number(d.amount),
  description: d.description ?? "",
  voided: d.voided,
});
