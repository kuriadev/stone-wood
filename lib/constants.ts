import type { Room } from "@/types/room";
import type { Booking } from "@/types/booking";
import type { InventoryItem } from "@/types/inventory";
import type { Review } from "@/types/review";
import type { AdminCredentials } from "@/types/admin";

export const ADMIN_CREDS: AdminCredentials = {
  username: "admin",
  password: "stonewood2026",
};

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
    id: "room",
    label: "Room Add-on",
    icon: "🛏️",
    desc: "Add a room to your Day Tour.",
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

export const INIT_REVIEWS: Review[] = [
  { id: 1, name: "Maria Santos", rating: 5, message: "StoneWood is our family's go-to getaway. The pool is amazing and so relaxing!", date: "2026-02-10" },
  { id: 2, name: "Jose Reyes", rating: 5, message: "Celebrated my birthday here — unforgettable. The staff were so accommodating.", date: "2026-02-18" },
  { id: 3, name: "Ana Cruz", rating: 4, message: "Quiet, private, and beautiful. Exactly what we needed for our team outing.", date: "2026-03-01" },
  { id: 4, name: "Carlo Tan", rating: 5, message: "Great value for the whole group. The videoke setup made the night so much fun.", date: "2026-03-05" },
];

export const INIT_BOOKINGS: Booking[] = [
  { id: "SW-10001", name: "Maria Santos", contact: "09171234567", email: "maria@email.com", date: "2026-03-10", guests: 25, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Confirmed", paymentProof: true, notes: "" },
  { id: "SW-10002", name: "Jose Reyes", contact: "09281234567", email: "jose@email.com", date: "2026-03-14", guests: 35, package: "Day Tour", rooms: [1], overtime: 2, total: 11500, downpayment: 5750, status: "On Hold", paymentProof: true, notes: "" },
  { id: "SW-10003", name: "Ana Cruz", contact: "09391234567", email: "ana@email.com", date: "2026-03-20", guests: 20, package: "Event / Function", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "On Hold", paymentProof: false, notes: "" },
  { id: "SW-10004", name: "Carlo Tan", contact: "09451234567", email: "carlo@email.com", date: "2026-02-15", guests: 15, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Completed", paymentProof: true, notes: "" },
  { id: "SW-10005", name: "Lea Gomez", contact: "09561234567", email: "lea@email.com", date: "2026-03-25", guests: 30, package: "Day Tour + Room", rooms: [2], overtime: 1, total: 11000, downpayment: 5500, status: "Confirmed", paymentProof: true, notes: "" },
  { id: "SW-10006", name: "Ryan Dela Cruz", contact: "09671234567", email: "ryan@email.com", date: "2026-02-28", guests: 20, package: "Day Tour", rooms: [], overtime: 0, total: 6000, downpayment: 3000, status: "Completed", paymentProof: true, notes: "" },
];

export const INIT_INVENTORY: InventoryItem[] = [
  { id: 1, category: "Pool & Chemicals", name: "Chlorine Tablets (1kg)", qty: 24, unit: "pcs", minQty: 10, notes: "Check weekly" },
  { id: 2, category: "Pool & Chemicals", name: "pH Increaser", qty: 8, unit: "kg", minQty: 5, notes: "" },
  { id: 3, category: "Pool & Chemicals", name: "pH Reducer", qty: 6, unit: "kg", minQty: 5, notes: "" },
  { id: 4, category: "Pool & Chemicals", name: "Algaecide", qty: 4, unit: "bottles", minQty: 3, notes: "Monthly treatment" },
  { id: 5, category: "Pool & Chemicals", name: "Pool Clarifier", qty: 3, unit: "bottles", minQty: 2, notes: "" },
  { id: 6, category: "Pool & Chemicals", name: "Sanitizer Spray", qty: 12, unit: "bottles", minQty: 6, notes: "For restrooms" },
  { id: 7, category: "Furniture & Misc", name: "Monobloc Chair (White)", qty: 40, unit: "pcs", minQty: 20, notes: "" },
  { id: 8, category: "Furniture & Misc", name: "Folding Chair", qty: 20, unit: "pcs", minQty: 10, notes: "Event use" },
  { id: 9, category: "Furniture & Misc", name: "Deck Chair", qty: 8, unit: "pcs", minQty: 4, notes: "Pool area" },
  { id: 10, category: "Furniture & Misc", name: "Round Table (6-seater)", qty: 10, unit: "pcs", minQty: 5, notes: "" },
  { id: 11, category: "Furniture & Misc", name: "Long Folding Table", qty: 6, unit: "pcs", minQty: 3, notes: "Event setup" },
  { id: 12, category: "Furniture & Misc", name: "Picnic Table", qty: 4, unit: "pcs", minQty: 2, notes: "" },
  { id: 13, category: "Cleaning Tools", name: "Mop & Bucket Set", qty: 6, unit: "sets", minQty: 3, notes: "" },
  { id: 14, category: "Cleaning Tools", name: "Pool Vacuum / Skimmer", qty: 2, unit: "pcs", minQty: 1, notes: "Check monthly" },
  { id: 15, category: "Cleaning Tools", name: "Broom & Dustpan", qty: 8, unit: "sets", minQty: 4, notes: "" },
  { id: 16, category: "Cleaning Tools", name: "Trash Bags (XL)", qty: 60, unit: "pcs", minQty: 20, notes: "" },
  { id: 17, category: "Cleaning Tools", name: "Rubber Gloves", qty: 15, unit: "pairs", minQty: 8, notes: "" },
];
