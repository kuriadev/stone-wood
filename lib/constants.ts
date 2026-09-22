import type { Room } from "@/types/room";
import type { Booking } from "@/types/booking";
import type { InventoryItem } from "@/types/inventory";
import type { MenuItem } from "@/types/menu";
import type { Facility } from "@/types/facility";
import type { ResortPackage } from "@/types/package";
import {
  SHARED_PER_HEAD_RATE,
  EXCLUSIVE_FLAT_RATE,
  EVENT_VENUE_RATE,
  PACKAGE_BUNDLE_DISCOUNT_PCT,
  RESORT_MAX_CAPACITY,
  PACKAGE_FOOD_DISCOUNT_PCT,
} from "@/lib/validators";

// ADMIN_CREDS used to live here. This file is imported by client components,
// so the password shipped inside the JavaScript bundle where anyone could read
// it. Credentials are now ADMIN_USERNAME / ADMIN_PASSWORD in .env.local,
// compared server-side in lib/auth.ts and never sent to the browser.

export const NAV = ["Home", "Rooms", "Menu", "Gallery", "About Us"] as const;

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
  { icon: "🏊", name: "Swimming Pool", desc: "Private pool for whole-day rental, up to 30 guests." },
  { icon: "🔥", name: "BBQ / Grilling Area", desc: "Open-air grilling stations for group cookouts." },
  { icon: "🎱", name: "Billiards", desc: "Full-size billiards table available for all guests." },
  { icon: "🎤", name: "Videoke", desc: "Full videoke setup for group entertainment." },
  { icon: "🚗", name: "Parking Area", desc: "Secure on-site parking for all guests." },
] as const;

export const PACKAGES = [
  {
    id: "day",
    label: "Day Tour",
    icon: "☀️",
    desc: "Whole-day resort use 8AM–5PM.",
    base: 6000,
    details: [
      "Up to 30 guests included",
      "+₱100/extra guest beyond 30",
      "Pool access included",
      "Overtime: +₱500/hour after 5PM",
    ],
  },
  {
    // Placeholder pricing — mirrors Day Tour exactly (same base, same
    // guest/overtime rules) until real night-tour rates are set.
    id: "night",
    label: "Night Tour",
    icon: "🌙",
    desc: "Whole-night resort use 6PM–12AM.",
    base: 6000,
    details: [
      "Up to 30 guests included",
      "+₱100/extra guest beyond 30",
      "Pool access included",
      "Overtime: +₱500/hour after 12AM",
    ],
  },
  {
    id: "room",
    label: "Room Add-on",
    icon: "🛏️",
    desc: "Add a room to your Day or Night Tour.",
    base: 2000,
    details: [
      "₱2,000–₱2,500 per room",
      "3 room options available",
      "Rented separately from pool",
    ],
  },
] as const;

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
  { id: "SW-10002", name: "Jose Reyes", contact: "09281234567", email: "jose@email.com", date: "2026-03-14", guests: 35, package: "Day Tour", rooms: [1], overtime: 2, total: 11500, downpayment: 5750, status: "Paid", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10003", name: "Ana Cruz", contact: "09391234567", email: "ana@email.com", date: "2026-03-20", guests: 20, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Paid", paymentProof: false, notes: "", source: "Online" },
  { id: "SW-10004", name: "Carlo Tan", contact: "09451234567", email: "carlo@email.com", date: "2026-02-15", guests: 15, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Completed", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10005", name: "Lea Gomez", contact: "09561234567", email: "lea@email.com", date: "2026-03-25", guests: 30, package: "Day Tour + Room", rooms: [2], overtime: 1, total: 11000, downpayment: 5500, status: "Confirmed", paymentProof: true, notes: "", source: "Online" },
  { id: "SW-10006", name: "Ryan Dela Cruz", contact: "09671234567", email: "ryan@email.com", date: "2026-02-28", guests: 20, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Completed", paymentProof: true, notes: "", source: "Online" },
];

// ── FOOD MENU ───────────────────────────────────────────────────────
// Placeholder items/prices — swap for the resort's real menu & photos.
export const INIT_MENU: MenuItem[] = [
  // Recipe links: these three sell out automatically once their linked
  // Food Ingredients (INIT_INVENTORY, ids 18-20) run out.
  { id: 1, category: "Grilled & BBQ", name: "Pork BBQ Skewers (5pcs)", desc: "Sweet-savory marinated pork skewers, grilled to order.", price: 150, img: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&q=80", available: true, recipe: [{ ingredientId: 18, qtyPerOrder: 1 }] },
  { id: 2, category: "Grilled & BBQ", name: "Grilled Liempo (1kg)", desc: "Crispy-edged grilled pork belly, good for sharing.", price: 450, img: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80", available: true, recipe: [{ ingredientId: 19, qtyPerOrder: 1 }] },
  { id: 3, category: "Grilled & BBQ", name: "Inihaw na Bangus", desc: "Whole milkfish stuffed and grilled, served with soy-calamansi.", price: 280, img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&q=80", available: true },
  { id: 4, category: "Rice Meals", name: "Plain Rice (cup)", desc: "Steamed white rice.", price: 25, img: "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=600&q=80", available: true },
  { id: 5, category: "Rice Meals", name: "Pancit Canton (tray)", desc: "Stir-fried noodles with vegetables and pork, good for groups.", price: 350, img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&q=80", available: true, recipe: [{ ingredientId: 20, qtyPerOrder: 1 }] },
  { id: 6, category: "Snacks", name: "Lumpiang Shanghai (10pcs)", desc: "Crispy mini pork spring rolls with sweet chili dip.", price: 180, img: "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=600&q=80", available: true },
  { id: 7, category: "Snacks", name: "Fresh Lumpia (order)", desc: "Vegetable spring rolls in a soft wrapper.", price: 160, img: "https://images.unsplash.com/photo-1625938144755-652e08e359b7?w=600&q=80", available: true },
  { id: 8, category: "Drinks", name: "Iced Tea (pitcher)", desc: "House-blend iced tea, serves about 6.", price: 150, img: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80", available: true },
  { id: 9, category: "Drinks", name: "Soft Drinks (1.5L)", desc: "Coke, Sprite, or Royal — pick on arrival.", price: 100, img: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=80", available: true },
  { id: 10, category: "Desserts", name: "Buko Pandan (tub)", desc: "Chilled young coconut and pandan gelatin dessert.", price: 200, img: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80", available: true },
  // ── Bundled combos ── set meals made of the above items at a bundle price
  { id: 11, category: "Combo", name: "Family Combo (Good for 6)", desc: "2 cups rice, 5pcs BBQ skewers, 1 tray pancit canton, 1 pitcher iced tea.", price: 680, img: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80", available: true },
  { id: 12, category: "Combo", name: "Barkada Grill Combo (Good for 10)", desc: "1kg grilled liempo, 10pcs lumpiang shanghai, 4 cups rice, 1.5L soft drinks.", price: 1050, img: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80", available: true },
];

// ── FACILITIES ──────────────────────────────────────────────────────
// Seeded from AMENITIES (shared, whole-resort use) plus one entry per
// room in INIT_ROOMS (roomId links the two so a booking's room list can
// flag exactly which room facilities it used).
export const INIT_FACILITIES: Facility[] = [
  { id: 1, category: "Amenity", name: "Swimming Pool", icon: "🏊", status: "Available", notes: "" },
  { id: 2, category: "Amenity", name: "BBQ / Grilling Area", icon: "🔥", status: "Available", notes: "" },
  { id: 3, category: "Amenity", name: "Billiards", icon: "🎱", status: "Available", notes: "" },
  { id: 4, category: "Amenity", name: "Videoke", icon: "🎤", status: "Available", notes: "" },
  { id: 5, category: "Amenity", name: "Parking Area", icon: "🚗", status: "Available", notes: "" },
  { id: 6, category: "Amenity", name: "Events Venue", icon: "🎪", status: "Available", notes: "" },
  { id: 101, category: "Room", name: "Room 1 – Queen & Deck", icon: "🛏", roomId: 1, status: "Available", notes: "" },
  { id: 102, category: "Room", name: "Room 2 – Deck Suite", icon: "🛏", roomId: 2, status: "Available", notes: "" },
  { id: 103, category: "Room", name: "Room 3 – Cozy Double", icon: "🛏", roomId: 3, status: "Available", notes: "" },
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
  // Food Ingredients — linked from INIT_MENU items via MenuItem.recipe, so
  // depleting one of these auto sells-out the dish(es) that use it.
  { id: 18, category: "Food Ingredients", name: "Pork BBQ Skewers (prepped, 5pcs set)", qty: 30, unit: "sets", minQty: 8, notes: "For Pork BBQ Skewers" },
  { id: 19, category: "Food Ingredients", name: "Pork Liempo (1kg slab)", qty: 15, unit: "kg", minQty: 4, notes: "For Grilled Liempo" },
  { id: 20, category: "Food Ingredients", name: "Pancit Canton Noodles (tray portion)", qty: 20, unit: "trays", minQty: 5, notes: "For Pancit Canton" },
];

// ── RESORT PACKAGES ─────────────────────────────────────────────────
// Each package is a fixed, one-time purchase — Home.tsx, the Packages page
// and the Walk-In form all read this same admin-editable list, so an edit
// here (or in the admin Packages tab) shows up everywhere at once.
const POOL_PACKAGE_CAPACITY = 15;
const POOL_PACKAGE_PRICE = POOL_PACKAGE_CAPACITY * SHARED_PER_HEAD_RATE; // ₱3,000
const VENUE_ONLY_CAPACITY = 50; // the hall's own capacity — independent of the pool's 30-guest cap
const POOL_VENUE_LIST_PRICE = EXCLUSIVE_FLAT_RATE + EVENT_VENUE_RATE; // ₱14,000 before the bundle discount
const POOL_VENUE_PRICE = Math.round(POOL_VENUE_LIST_PRICE * (1 - PACKAGE_BUNDLE_DISCOUNT_PCT)); // ₱12,600

const ROOM_PHOTO = "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop";
const POOL_PHOTO_1 = "https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop";
const POOL_PHOTO_2 = "https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1200&auto=format&fit=crop";
const RESORT_WIDE_PHOTO = "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop";
const VENUE_PHOTO = "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop";

export const INIT_PACKAGES: ResortPackage[] = [
  {
    id: 1,
    code: "POOL-ROOM",
    title: "Pool + Room Package",
    resource: "Pool",
    status: "Shared",
    price: POOL_PACKAGE_PRICE,
    capacity: POOL_PACKAGE_CAPACITY,
    requiresRoom: true,
    active: true,
    cover: ROOM_PHOTO,
    gallery: [
      { label: "Room", src: ROOM_PHOTO, kind: "Room" },
      { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" },
    ],
    blurb: "Pool access shared with other same-day guests, plus a room to rest, change or stay over — pick your room at checkout for a discounted room rate.",
    includes: [`Full pool access for up to ${POOL_PACKAGE_CAPACITY} guests`, "1 room of your choice (discounted rate)", "BBQ / grilling area", "Billiards & videoke", "Parking area"],
    foodNote: "Add food & drinks from our menu at checkout — optional. Order a Combo for a discount.",
  },
  {
    id: 2,
    code: "POOL-FOOD",
    title: "Pool + Food Package",
    resource: "Pool",
    status: "Shared",
    price: POOL_PACKAGE_PRICE,
    capacity: POOL_PACKAGE_CAPACITY,
    foodDiscountPct: PACKAGE_FOOD_DISCOUNT_PCT,
    active: true,
    cover: POOL_PHOTO_1,
    gallery: [
      { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" },
      { label: "Second Pool", src: POOL_PHOTO_2, kind: "Pool" },
    ],
    blurb: "Pool access shared with other same-day guests, built around pre-ordering your meal — no room, just the pool and the food, with a built-in discount on whatever you order.",
    includes: [`Full pool access for up to ${POOL_PACKAGE_CAPACITY} guests`, `${Math.round(PACKAGE_FOOD_DISCOUNT_PCT * 100)}% off your whole food order`, "BBQ / grilling area", "Billiards & videoke", "Parking area"],
    foodNote: `Pre-order from our menu at checkout — every item is ${Math.round(PACKAGE_FOOD_DISCOUNT_PCT * 100)}% off with this package. Order a Combo for an extra discount.`,
    note: "No room included",
  },
  {
    id: 3,
    code: "POOL-EXCLUSIVE",
    title: "Pool Exclusive Buyout",
    resource: "Pool",
    status: "Exclusive",
    price: EXCLUSIVE_FLAT_RATE,
    capacity: RESORT_MAX_CAPACITY,
    active: true,
    cover: RESORT_WIDE_PHOTO,
    gallery: [
      { label: "Full Resort", src: RESORT_WIDE_PHOTO, kind: "Resort" },
      { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" },
    ],
    blurb: "Whole-resort buyout — no other booking is allowed that date. One flat fee for up to the resort's full 30-guest capacity, however many actually attend.",
    includes: [`Exclusive full-resort pool access for up to ${RESORT_MAX_CAPACITY} guests`, "All resort amenities", "Priority setup time"],
    foodNote: "Add food & drinks from our menu at checkout — optional. Order a Combo for a discount.",
    note: "Full resort",
  },
  {
    id: 4,
    code: "VENUE-ONLY",
    title: "Events Venue Rental",
    resource: "Venue",
    status: "Exclusive",
    price: EVENT_VENUE_RATE,
    capacity: VENUE_ONLY_CAPACITY,
    active: true,
    cover: VENUE_PHOTO,
    gallery: [{ label: "Events Venue", src: VENUE_PHOTO, kind: "Venue" }],
    blurb: "Rent just the events hall — no pool included. Perfect for parties, meetings, or celebrations that don't need the pool.",
    includes: [`Exclusive use of the events venue for up to ${VENUE_ONLY_CAPACITY} guests`, "Tables & chairs setup", "Sound system access"],
    foodNote: "No catering — combo meals or self-orders from our menu. Order a Combo for a discount.",
    note: "No pool",
  },
  {
    id: 5,
    code: "POOL-VENUE",
    title: "Pool + Events Venue Buyout",
    resource: "Pool+Venue",
    status: "Exclusive",
    price: POOL_VENUE_PRICE,
    listPrice: POOL_VENUE_LIST_PRICE,
    capacity: RESORT_MAX_CAPACITY,
    active: true,
    cover: RESORT_WIDE_PHOTO,
    gallery: [
      { label: "Full Resort", src: RESORT_WIDE_PHOTO, kind: "Resort" },
      { label: "Events Venue", src: VENUE_PHOTO, kind: "Venue" },
      { label: "Main Pool", src: POOL_PHOTO_1, kind: "Pool" },
    ],
    blurb: "The full experience — exclusive pool buyout plus the events venue, both reserved just for your group, bundled for less than booking them separately.",
    includes: [`Exclusive full-resort pool access for up to ${RESORT_MAX_CAPACITY} guests`, "Exclusive events venue", "All resort amenities"],
    foodNote: "Pre-order food, or arrange combo meals for the venue. Order a Combo for a discount.",
    note: "Best for weddings & large events",
  },
];

/** Home hero photograph. Lives here rather than inside Home.tsx so the root
 *  layout can preload it — it is the LCP element, and a CSS background can
 *  neither be lazy-loaded nor use srcset. */
export const HERO_BG =
  "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=2400&auto=format&fit=crop";
