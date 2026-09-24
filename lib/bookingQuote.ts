// ── Server-side booking quote
//
// SERVER ONLY — reads the database with the service-role key.
//
// Takes what the guest picked in Book Now (a "draft"), checks every field
// against the real data, and works out the price with the same function
// the browser used. /api/payment calls it to decide how much the QR
// charges; /api/bookings calls it again after payment to decide what is
// stored. Nothing the browser says about price, availability or labels
// is taken on trust.

import { getSupabaseAdmin, rowToBooking, rowToFacility, rowToPackage, rowToRoom } from "@/lib/supabase";
import {
  checkBookingAvailability,
  isRoomOpen,
  roomsTakenOn,
} from "@/lib/utils";
import { priceBooking, bookingLabel, pricingProblem, type PriceBreakdown } from "@/lib/pricing";
import {
  GUESTS_MIN, GUESTS_MAX, RESORT_MAX_CAPACITY,
  isValidEmail, isValidName, isValidPHNumber,
  sanitizeName, sanitizeContact, sanitizeNotes,
  isWithinBookingWindow, describeDateProblem,
} from "@/lib/validators";
import type { BookingRow, FacilityRow, PackageRow, RoomRow } from "@/types/database";
import type { BookingResource, BookingSlot, BookingTier } from "@/types/booking";

/** What Book Now sends. Every field is re-checked here. */
export interface BookingDraft {
  /** Set when booking a package; its price/guests/tier come from the DB. */
  packageCode?: string;
  resource: BookingResource;
  tier: BookingTier;
  /** Day, Night or WholeDay. A WholeDay package forces WholeDay. */
  slot: BookingSlot;
  guests: number;
  /** Always 0 from a guest: overtime is added by staff, not bought online. */
  overtime: number;
  rooms: number[];
  date: string;
  name: string;
  email: string;
  contact: string;
  notes: string;
}

export interface BookingQuote {
  draft: BookingDraft;
  packageLabel: string;
  price: PriceBreakdown;
  /** false when the date/pool/venue/room is no longer free. */
  available: boolean;
  unavailableReason?: string;
}

export type QuoteResult =
  | { ok: true; quote: BookingQuote }
  | { ok: false; status: number; error: string };

const RESOURCES: BookingResource[] = ["Pool", "Venue", "Pool+Venue"];
const TIERS: BookingTier[] = ["Shared", "Exclusive"];
const SLOTS_OK: BookingSlot[] = ["Day", "Night", "WholeDay"];

const bad = (error: string, status = 400): QuoteResult => ({ ok: false, status, error });

export async function quoteBooking(raw: unknown): Promise<QuoteResult> {
  if (!raw || typeof raw !== "object") return bad("Booking details are missing.");
  const d = raw as Record<string, unknown>;

  // ── Guest details ───────────────────────────────────────────────
  const name = sanitizeName(String(d.name ?? "")).trim();
  const email = String(d.email ?? "").trim().toLowerCase();
  const contact = sanitizeContact(String(d.contact ?? ""));
  const notes = sanitizeNotes(String(d.notes ?? ""));
  if (!isValidName(name)) return bad("A valid name is required.");
  if (!isValidEmail(email)) return bad("A valid email address is required.");
  if (!isValidPHNumber(contact)) return bad("A valid PH mobile number (09XXXXXXXXX) is required.");

  // ── Date ────────────────────────────────────────────────────────
  const date = String(d.date ?? "");
  if (!isWithinBookingWindow(date)) return bad(describeDateProblem(date) ?? "That date can't be booked.");

  const db = getSupabaseAdmin();

  const { data: closed, error: closedErr } = await db
    .from("closed_dates").select("date").eq("date", date).maybeSingle();
  if (closedErr) throw new Error(closedErr.message);
  if (closed) return bad("The resort is closed on that date.", 409);

  // ── What is being booked ────────────────────────────────────────
  // Older pages sent tourType ("Night Tour"); newer ones send slot.
  let slot: BookingSlot = SLOTS_OK.includes(d.slot as BookingSlot)
    ? (d.slot as BookingSlot)
    : d.tourType === "Night Tour" ? "Night" : "Day";
  const roomIds = Array.isArray(d.rooms)
    ? [...new Set(d.rooms.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  let resource: BookingResource;
  let tier: BookingTier;
  let guests: number;
  // Guests can't buy overtime online any more — staff add it at the resort
  // when the Night slot is free. Anything sent here is ignored.
  const overtime = 0;
  let pkg: { title: string; price: number; requiresRoom: boolean; code: string } | null = null;

  const packageCode = typeof d.packageCode === "string" && d.packageCode ? d.packageCode : undefined;

  if (packageCode) {
    // A package fixes its own price, capacity, tier and resource. Whatever
    // the browser sent for those is ignored.
    const { data, error } = await db
      .from("packages").select("*").eq("code", packageCode).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return bad("That package no longer exists.", 409);
    const p = rowToPackage(data as PackageRow);
    if (!p.active) return bad("That package is no longer offered.", 409);

    pkg = { title: p.title, price: p.price, requiresRoom: !!p.requiresRoom, code: p.code };
    resource = p.resource;
    tier = p.status;
    guests = p.capacity;
    // Whole Day packages are both slots; a single-slot package takes the
    // Day or Night the guest picked (never Whole Day).
    if (p.slotMode === "WholeDay") slot = "WholeDay";
    else if (slot === "WholeDay") return bad("Pick the Day or Night for this package.");

    if (pkg.requiresRoom && roomIds.length !== 1) return bad("This package needs exactly one room.");
    if (!pkg.requiresRoom && roomIds.length > 0) return bad("This package doesn't include a room.");
  } else {
    if (!RESOURCES.includes(d.resource as BookingResource)) return bad("Unknown booking type.");
    resource = d.resource as BookingResource;

    // Same rules as Book Now: the venue is always exclusive, and an
    // exclusive pool buyout is for the resort's full capacity.
    tier = resource === "Venue"
      ? "Exclusive"
      : TIERS.includes(d.tier as BookingTier) ? (d.tier as BookingTier) : "Shared";

    guests = Math.round(Number(d.guests));
    if (!Number.isFinite(guests) || guests < GUESTS_MIN || guests > GUESTS_MAX) {
      return bad(`Guests must be between ${GUESTS_MIN} and ${GUESTS_MAX}.`);
    }
    if (resource !== "Venue" && tier === "Exclusive") guests = RESORT_MAX_CAPACITY;

    const notOffered = pricingProblem(resource, tier, slot);
    if (notOffered) return bad(notOffered);
    if (resource === "Venue" && roomIds.length > 0) return bad("Rooms can't be added to a venue-only booking.");
  }

  // ── Rooms, facilities and the date's other bookings ─────────────
  const [roomsRes, facRes, bookedRes] = await Promise.all([
    roomIds.length
      ? db.from("rooms").select("*").in("id", roomIds)
      : Promise.resolve({ data: [] as RoomRow[], error: null }),
    db.from("facilities").select("*"),
    db.from("bookings").select("*").eq("date", date).neq("status", "Cancelled"),
  ]);
  if (roomsRes.error) throw new Error(roomsRes.error.message);
  if (facRes.error) throw new Error(facRes.error.message);
  if (bookedRes.error) throw new Error(bookedRes.error.message);

  const rooms = (roomsRes.data as RoomRow[]).map(rowToRoom);
  if (rooms.length !== roomIds.length) return bad("One of the chosen rooms no longer exists.", 409);

  const facilities = (facRes.data as FacilityRow[]).map(rowToFacility);
  const sameDay = (bookedRes.data as BookingRow[]).map(rowToBooking);

  // ── Availability ────────────────────────────────────────────────
  let available = true;
  let unavailableReason: string | undefined;

  const capacity = checkBookingAvailability(date, slot, guests, tier, resource, sameDay, facilities, overtime);
  if (!capacity.ok) {
    available = false;
    unavailableReason = capacity.reason;
  }
  const taken = roomsTakenOn(date, slot, sameDay, overtime);
  const clash = rooms.find((r) => taken.has(r.id));
  const closedRoom = rooms.find((r) => !isRoomOpen(r.id, facilities));
  if (available && clash) {
    available = false;
    unavailableReason = `${clash.name} is already booked that date.`;
  } else if (available && closedRoom) {
    available = false;
    unavailableReason = `${closedRoom.name} is closed for maintenance.`;
  }

  // ── Price ───────────────────────────────────────────────────────
  const price = priceBooking({
    pkg,
    resource,
    tier,
    slot,
    guests,
    overtime,
    roomPrices: rooms.map((r) => r.price),
  });

  const packageLabel = bookingLabel({
    packageTitle: pkg?.title,
    resource,
    slot,
    hasRoom: rooms.length > 0,
  });

  return {
    ok: true,
    quote: {
      draft: {
        packageCode: pkg?.code,
        resource, tier, slot, guests, overtime,
        rooms: rooms.map((r) => r.id),
        date, name, email, contact, notes,
      },
      packageLabel,
      price,
      available,
      unavailableReason,
    },
  };
}
