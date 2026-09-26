import type { Room } from "@/types/room";
import type { Booking } from "@/types/booking";
import type { InventoryItem } from "@/types/inventory";
import type { Facility } from "@/types/facility";
import type { ResortPackage } from "@/types/package";
import {
  SHARED_PER_HEAD_RATE,
  EXCLUSIVE_FLAT_RATE,
  EXCLUSIVE_DISCOUNT_PCT,
  EVENT_VENUE_RATE,
  OVERTIME_MAX,
  OVERTIME_RATE,
  RESORT_MAX_CAPACITY,
} from "@/lib/validators";
import { standardPackagePrice } from "@/lib/pricing";
import { SLOTS, QUIET_HOURS_START } from "@/lib/resort";

// ADMIN_CREDS used to live here. This file is imported by client components,
// so the password shipped inside the JavaScript bundle where anyone could read
// it. Credentials are now ADMIN_USERNAME / ADMIN_PASSWORD in .env.local,
// compared server-side in lib/auth.ts and never sent to the browser.

export const NAV = ["Home", "Rooms", "Gallery", "About Us"] as const;

export const INIT_ROOMS: Room[] = [
  {
    id: 1,
    name: "Room 1 – Queen & Deck",
    beds: "2 Queen Beds + 2 Double Deck Beds",
    capacity: 8,
    price: 2500,
    desc: "Spacious room ideal for families or groups.",
    img: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=85",
  },
  {
    id: 2,
    name: "Room 2 – Deck Suite",
    beds: "6 Double Deck Beds",
    capacity: 12,
    price: 2500,
    desc: "Perfect for large friend groups.",
    img: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&q=85",
  },
  {
    id: 3,
    name: "Room 3 – Cozy Double",
    beds: "2 Double Deck Beds",
    capacity: 4,
    price: 2000,
    desc: "A cozy, intimate room for small groups.",
    img: "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&q=85",
  },
];

export const AMENITIES = [
  { icon: "pool", name: "Swimming Pool", desc: "Private pool for whole-day rental, up to 30 guests." },
  { icon: "flame", name: "BBQ / Grilling Area", desc: "Open-air grilling stations for group cookouts." },
  { icon: "billiards", name: "Billiards", desc: "Full-size billiards table available for all guests." },
  { icon: "mic", name: "Videoke", desc: "Full videoke setup for group entertainment." },
  { icon: "car", name: "Parking Area", desc: "Secure on-site parking for all guests." },
] as const;

// The "Tours & Room Add-ons" rate cards on Home. Built from the same
// constants the price is calculated from, so the cards can't drift from
// what Book Now charges.
const EXCLUSIVE_ONE_SLOT = Math.round(EXCLUSIVE_FLAT_RATE * (1 - EXCLUSIVE_DISCOUNT_PCT)); // ₱5,700
const peso = (n: number) => `₱${n.toLocaleString()}`;

export const PACKAGES = [
  {
    id: "day",
    label: SLOTS.Day.label,
    icon: "sun",
    desc: `Resort use ${SLOTS.Day.hours}.`,
    base: SHARED_PER_HEAD_RATE,
    unit: "/guest",
    details: [
      `Shared: ${peso(SHARED_PER_HEAD_RATE)} per guest`,
      `Exclusive (up to ${RESORT_MAX_CAPACITY}): ${peso(EXCLUSIVE_ONE_SLOT)}`,
      `Overtime on request: ${peso(OVERTIME_RATE)}/hr, up to ${OVERTIME_MAX} hrs`,
    ],
  },
  {
    id: "night",
    label: SLOTS.Night.label,
    icon: "moon",
    desc: `Resort use ${SLOTS.Night.hours}.`,
    base: SHARED_PER_HEAD_RATE,
    unit: "/guest",
    details: [
      `Shared: ${peso(SHARED_PER_HEAD_RATE)} per guest`,
      `Exclusive (up to ${RESORT_MAX_CAPACITY}): ${peso(EXCLUSIVE_ONE_SLOT)}`,
      `Quiet hours from ${QUIET_HOURS_START}`,
    ],
  },
  {
    id: "wholeday",
    label: SLOTS.WholeDay.label,
    icon: "clock",
    desc: `Exclusive, ${SLOTS.WholeDay.hours}.`,
    base: standardPackagePrice({ resource: "Pool", tier: "Exclusive", slotMode: "WholeDay", capacity: RESORT_MAX_CAPACITY }).price,
    unit: "",
    details: [
      `Up to ${RESORT_MAX_CAPACITY} guests, whole resort`,
      `Day + Night for 10% less (${peso(EXCLUSIVE_FLAT_RATE * 2)} regular)`,
      "No turnover — stay through the evening",
    ],
  },
  {
    id: "room",
    label: "Room Add-on",
    icon: "bed",
    desc: "Add a room to any booking.",
    base: 2000,
    unit: "/slot",
    details: [
      "₱2,000–₱2,500 per room, per slot",
      "3 room options available",
      "8% off when part of a package",
    ],
  },
] as const;

/** The events venue, for pages that quote it. */
export const VENUE_RATE_LABEL = `${peso(EVENT_VENUE_RATE)} per slot`;

export const INIT_GALLERY: string[] = [
  "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=85",
  "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&q=85",
  "https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=800&q=85",
  "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=85",
  "https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800&q=85",
  "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=800&q=85",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=85",
  "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=85",
  "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&q=85",
];


export const INIT_BOOKINGS: Booking[] = [
  { id: "SW-10001", name: "Maria Santos", contact: "09171234567", email: "maria@email.com", date: "2026-03-10", guests: 25, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Confirmed", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10002", name: "Jose Reyes", contact: "09281234567", email: "jose@email.com", date: "2026-03-14", guests: 35, package: "Day Tour", rooms: [1], overtime: 2, total: 11500, downpayment: 5750, status: "Pending", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10003", name: "Ana Cruz", contact: "09391234567", email: "ana@email.com", date: "2026-03-20", guests: 20, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Pending", paymentProof: false, notes: "", source: "Online" },
  { id: "SW-10004", name: "Carlo Tan", contact: "09451234567", email: "carlo@email.com", date: "2026-02-15", guests: 15, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Completed", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10005", name: "Lea Gomez", contact: "09561234567", email: "lea@email.com", date: "2026-03-25", guests: 30, package: "Day Tour + Room", rooms: [2], overtime: 1, total: 11000, downpayment: 5500, status: "Confirmed", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10006", name: "Ryan Dela Cruz", contact: "09671234567", email: "ryan@email.com", date: "2026-02-28", guests: 20, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Completed", paymentProof: true, notes: "", source: "Online" },
];

// ── FACILITIES ──────────────────────────────────────────────────────
// Seeded from AMENITIES (shared, whole-resort use) plus one entry per
// room in INIT_ROOMS (roomId links the two so a booking's room list can
// flag exactly which room facilities it used).
export const INIT_FACILITIES: Facility[] = [
  { id: 1, category: "Amenity", name: "Swimming Pool", icon: "pool", status: "Available", notes: "" },
  { id: 2, category: "Amenity", name: "BBQ / Grilling Area", icon: "flame", status: "Available", notes: "" },
  { id: 3, category: "Amenity", name: "Billiards", icon: "billiards", status: "Available", notes: "" },
  { id: 4, category: "Amenity", name: "Videoke", icon: "mic", status: "Available", notes: "" },
  { id: 5, category: "Amenity", name: "Parking Area", icon: "car", status: "Available", notes: "" },
  { id: 6, category: "Amenity", name: "Events Venue", icon: "tent", status: "Available", notes: "" },
  { id: 101, category: "Room", name: "Room 1 – Queen & Deck", icon: "bed", roomId: 1, status: "Available", notes: "" },
  { id: 102, category: "Room", name: "Room 2 – Deck Suite", icon: "bed", roomId: 2, status: "Available", notes: "" },
  { id: 103, category: "Room", name: "Room 3 – Cozy Double", icon: "bed", roomId: 3, status: "Available", notes: "" },
];

export const INIT_INVENTORY: InventoryItem[] = [
  { id: 1, category: "Pool & Chemicals", name: "Chlorine Tablets (1kg)", qty: 24, unit: "pcs", minQty: 10, notes: "Check weekly" },
  { id: 2, category: "Pool & Chemicals", name: "pH Increaser", qty: 8, unit: "kg", minQty: 5, notes: "" },
  { id: 3, category: "Pool & Chemicals", name: "pH Reducer", qty: 6, unit: "kg", minQty: 5, notes: "" },
  { id: 4, category: "Pool & Chemicals", name: "Algaecide", qty: 4, unit: "bottles", minQty: 3, notes: "Monthly treatment" },
  { id: 5, category: "Pool & Chemicals", name: "Pool Clarifier", qty: 3, unit: "bottles", minQty: 2, notes: "" },
  { id: 6, category: "Pool & Chemicals", name: "Sanitizer Spray", qty: 12, unit: "bottles", minQty: 6, notes: "For restrooms" },
  { id: 7, category: "Furniture & Misc", name: "Monobloc Chair (White)", qty: 40, unit: "pcs", minQty: 20, notes: "" },
  { id: 8, category: "Furniture & Misc", name: "Folding Chair", qty: 20, unit: "pcs", minQty: 10, notes: "" },
  { id: 9, category: "Furniture & Misc", name: "Deck Chair", qty: 8, unit: "pcs", minQty: 4, notes: "Pool area" },
  { id: 10, category: "Furniture & Misc", name: "Round Table (6-seater)", qty: 10, unit: "pcs", minQty: 5, notes: "" },
  { id: 11, category: "Furniture & Misc", name: "Long Folding Table", qty: 6, unit: "pcs", minQty: 3, notes: "" },
  { id: 12, category: "Furniture & Misc", name: "Picnic Table", qty: 4, unit: "pcs", minQty: 2, notes: "" },
  { id: 13, category: "Cleaning Tools", name: "Mop & Bucket Set", qty: 6, unit: "sets", minQty: 3, notes: "" },
  { id: 14, category: "Cleaning Tools", name: "Pool Vacuum / Skimmer", qty: 2, unit: "pcs", minQty: 1, notes: "Check monthly" },
  { id: 15, category: "Cleaning Tools", name: "Broom & Dustpan", qty: 8, unit: "sets", minQty: 4, notes: "" },
  { id: 16, category: "Cleaning Tools", name: "Trash Bags (XL)", qty: 60, unit: "pcs", minQty: 20, notes: "" },
  { id: 17, category: "Cleaning Tools", name: "Rubber Gloves", qty: 15, unit: "pairs", minQty: 8, notes: "" },
];

// ── RESORT PACKAGES ─────────────────────────────────────────────────
// Package = WHAT is booked; slot = WHEN. A "Single" package is booked for
// the Day or the Night, the guest's choice; a "WholeDay" package is both.
// Prices are not typed in: each is what lib/pricing.ts gives for that
// setup, so a package can never cost more than building the same booking
// by hand. The owner can still set a promo price in the Packages tab.
//
// These are the starting rows. /api/seed inserts them into an empty
// table, and migration 20260924090000 puts them into an existing one.
const POOL_CAPACITY = RESORT_MAX_CAPACITY; // 30
const BARKADA_CAPACITY = 15;
const VENUE_CAPACITY = 50; // the hall's own capacity, separate from the pool's

const ROOM_PHOTO = "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop";
const POOL_PHOTO_1 = "https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop";
const POOL_PHOTO_2 = "https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1200&auto=format&fit=crop";
const RESORT_WIDE_PHOTO = "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop";
const VENUE_PHOTO = "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop";

type PackageSeed = Omit<ResortPackage, "price" | "listPrice">;

/** Fill in price (and the struck-through list price when discounted). */
function priced(p: PackageSeed): ResortPackage {
  const { price, listPrice } = standardPackagePrice({
    resource: p.resource, tier: p.status, slotMode: p.slotMode, capacity: p.capacity,
  });
  return { ...p, price, listPrice: listPrice > price ? listPrice : undefined };
}

const DAY_OR_NIGHT = `Day (${SLOTS.Day.hours}) or Night (${SLOTS.Night.hours})`;

const PACKAGE_SEEDS: PackageSeed[] = [
  {
    id: 1, code: "BARKADA-ROOM", title: "Barkada Pool + Room",
    resource: "Pool", status: "Shared", slotMode: "Single", capacity: BARKADA_CAPACITY, requiresRoom: true,
    active: true, cover: ROOM_PHOTO,
    gallery: [{ label: "Room", src: ROOM_PHOTO, kind: "Room" }, { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" }],
    blurb: "Pool access shared with other groups, plus a room to rest and change in — pick your room at checkout at a discounted rate.",
    includes: [`Pool access for up to ${BARKADA_CAPACITY} guests`, "1 room of your choice (8% off)", DAY_OR_NIGHT, "BBQ area, billiards & videoke", "Parking"],
    note: "Shared pool",
  },
  {
    id: 2, code: "PRIVATE-POOL", title: "Private Pool",
    resource: "Pool", status: "Exclusive", slotMode: "Single", capacity: POOL_CAPACITY,
    active: true, cover: RESORT_WIDE_PHOTO,
    gallery: [{ label: "Full Resort", src: RESORT_WIDE_PHOTO, kind: "Resort" }, { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" }],
    blurb: "The whole pool to your group — no other bookings in your slot.",
    includes: [`Exclusive pool for up to ${POOL_CAPACITY} guests`, DAY_OR_NIGHT, "All resort amenities", "Parking"],
    note: "Exclusive",
  },
  {
    id: 3, code: "PRIVATE-POOL-ROOM", title: "Private Pool + Room",
    resource: "Pool", status: "Exclusive", slotMode: "Single", capacity: POOL_CAPACITY, requiresRoom: true,
    active: true, cover: ROOM_PHOTO,
    gallery: [{ label: "Room", src: ROOM_PHOTO, kind: "Room" }, { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" }],
    blurb: "The whole pool to your group, plus a room — pick it at checkout at a discounted rate.",
    includes: [`Exclusive pool for up to ${POOL_CAPACITY} guests`, "1 room of your choice (8% off)", DAY_OR_NIGHT, "All resort amenities"],
    note: "Exclusive",
  },
  {
    id: 4, code: "WHOLE-DAY", title: "Whole Day Buyout",
    resource: "Pool", status: "Exclusive", slotMode: "WholeDay", capacity: POOL_CAPACITY,
    active: true, cover: POOL_PHOTO_2,
    gallery: [{ label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" }, { label: "Second Pool", src: POOL_PHOTO_2, kind: "Pool" }],
    blurb: `The resort is yours from ${SLOTS.WholeDay.start} to ${SLOTS.WholeDay.end} — both the Day and Night slots, for less than booking them separately.`,
    includes: [`Exclusive pool for up to ${POOL_CAPACITY} guests`, `${SLOTS.WholeDay.hours}`, "All resort amenities", "Parking"],
    note: "Day + Night",
  },
  {
    id: 5, code: "WHOLE-DAY-STAY", title: "Whole Day Staycation",
    resource: "Pool", status: "Exclusive", slotMode: "WholeDay", capacity: POOL_CAPACITY, requiresRoom: true,
    active: true, cover: ROOM_PHOTO,
    gallery: [{ label: "Room", src: ROOM_PHOTO, kind: "Room" }, { label: "Full Resort", src: RESORT_WIDE_PHOTO, kind: "Resort" }],
    blurb: "A full day and night with the resort to yourselves, and a room for the whole stay.",
    includes: [`Exclusive pool for up to ${POOL_CAPACITY} guests`, "1 room for the whole day (8% off)", `${SLOTS.WholeDay.hours}`, "All resort amenities"],
    note: "Day + Night",
  },
  {
    id: 6, code: "VENUE", title: "Events Venue",
    resource: "Venue", status: "Exclusive", slotMode: "Single", capacity: VENUE_CAPACITY,
    active: true, cover: VENUE_PHOTO,
    gallery: [{ label: "Events Venue", src: VENUE_PHOTO, kind: "Venue" }],
    blurb: "Just the events hall — for parties, meetings and celebrations that don't need the pool.",
    includes: [`Exclusive use of the venue for up to ${VENUE_CAPACITY} guests`, DAY_OR_NIGHT, "Tables & chairs setup", "Sound system access"],
    note: "No pool",
  },
  {
    id: 7, code: "VENUE-WHOLE-DAY", title: "Events Venue — Whole Day",
    resource: "Venue", status: "Exclusive", slotMode: "WholeDay", capacity: VENUE_CAPACITY,
    active: true, cover: VENUE_PHOTO,
    gallery: [{ label: "Events Venue", src: VENUE_PHOTO, kind: "Venue" }],
    blurb: `The events hall from ${SLOTS.WholeDay.start} to ${SLOTS.WholeDay.end} — time to set up, celebrate and pack up.`,
    includes: [`Exclusive use of the venue for up to ${VENUE_CAPACITY} guests`, `${SLOTS.WholeDay.hours}`, "Tables & chairs setup", "Sound system access"],
    note: "No pool",
  },
  {
    id: 8, code: "PARTY", title: "Party Package",
    resource: "Pool+Venue", status: "Exclusive", slotMode: "Single", capacity: POOL_CAPACITY,
    active: true, cover: RESORT_WIDE_PHOTO,
    gallery: [{ label: "Full Resort", src: RESORT_WIDE_PHOTO, kind: "Resort" }, { label: "Events Venue", src: VENUE_PHOTO, kind: "Venue" }],
    blurb: "The private pool and the events hall together, bundled for less.",
    includes: [`Exclusive pool for up to ${POOL_CAPACITY} guests`, "Exclusive events venue", DAY_OR_NIGHT, "All resort amenities"],
    note: "Pool + Venue",
  },
  {
    id: 9, code: "GRAND", title: "Grand Celebration",
    resource: "Pool+Venue", status: "Exclusive", slotMode: "WholeDay", capacity: POOL_CAPACITY,
    active: true, cover: RESORT_WIDE_PHOTO,
    gallery: [{ label: "Full Resort", src: RESORT_WIDE_PHOTO, kind: "Resort" }, { label: "Events Venue", src: VENUE_PHOTO, kind: "Venue" }, { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" }],
    blurb: "Everything, all day: the private pool and the events hall from morning until midnight. Best for weddings, debuts and big celebrations.",
    includes: [`Exclusive pool for up to ${POOL_CAPACITY} guests`, "Exclusive events venue", `${SLOTS.WholeDay.hours}`, "All resort amenities"],
    note: "Best for big events",
  },
];

export const INIT_PACKAGES: ResortPackage[] = PACKAGE_SEEDS.map(priced);

/** Home hero photograph. Lives here rather than inside Home.tsx so the root
 *  layout can preload it — it is the LCP element, and a CSS background can
 *  neither be lazy-loaded nor use srcset. */
export const HERO_BG =
  "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=2400&auto=format&fit=crop";
