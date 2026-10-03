// ── Which facilities a reservation uses, and what to check on each
//
// Each amenity carries an AREA the owner sets in Facility Management, and
// the booking's resource picks the areas it uses:
//   Pool        → Pool + Common amenities
//   Venue       → Venue + Common amenities
//   Pool+Venue  → every amenity
// plus each room the booking rented. Retired amenities are left out.
//
// This used to match hard-coded names ("Events Venue", "Parking Area"), so
// a new amenity landed in every pool booking and renaming the venue broke
// venue bookings. The name rule survives only as the fallback for records
// cached before the area column existed.

import type { Booking } from "@/types/booking";
import type { AmenityArea, Facility } from "@/types/facility";
import { QUIET_HOURS_START } from "@/lib/resort";

/** The two amenities booking availability is checked against by name
 *  (lib/utils.ts isPoolOpen / isVenueOpen). They can't be renamed or
 *  retired from the admin. */
export const CORE_AMENITIES = ["Swimming Pool", "Events Venue"] as const;
export const isCoreAmenity = (f: Pick<Facility, "name" | "category">) =>
  f.category === "Amenity" && (CORE_AMENITIES as readonly string[]).includes(f.name);

/** Icons the owner can pick for an amenity (names from components/common/Icon). */
export const AMENITY_ICONS = [
  "pool", "flame", "billiards", "mic", "car", "tent", "utensils", "palm", "leaf", "sunrise", "home", "users", "star", "toolbox",
] as const;
export type AmenityIcon = (typeof AMENITY_ICONS)[number];
export const facilityIcon = (f: Pick<Facility, "icon" | "category">): AmenityIcon | "bed" =>
  f.category === "Room" ? "bed" : (AMENITY_ICONS as readonly string[]).includes(f.icon) ? (f.icon as AmenityIcon) : "toolbox";

export const AREA_LABEL: Record<AmenityArea, string> = {
  Pool: "Pool area",
  Venue: "Events venue",
  Common: "Every booking",
};

export function amenityArea(f: Facility): AmenityArea {
  if (f.area) return f.area;
  if (f.name === "Events Venue") return "Venue";
  if (f.name === "Parking Area") return "Common";
  return "Pool";
}

export function facilitiesForBooking(b: Booking, facilities: Facility[]): Facility[] {
  const resource = b.resource ?? "Pool";
  return facilities.filter((f) => {
    if (f.category === "Room") return f.roomId !== undefined && (b.rooms || []).includes(f.roomId);
    if (f.active === false) return false;
    const area = amenityArea(f);
    if (area === "Common" || resource === "Pool+Venue") return true;
    return area === resource;
  });
}

// Defaults used until the owner writes a checklist of their own for a
// facility (editable in Facility Management → Facilities → Edit).
const DEFAULT_BEFORE: Record<string, string[]> = {
  "Swimming Pool": ["Check chlorine/pH levels", "Skim leaves & debris", "Test water clarity", "Lifebuoys & signage in place"],
  "BBQ / Grilling Area": ["Clean grill grates", "Check charcoal & tongs", "Wipe tables"],
  Billiards: ["Count cues & balls", "Brush the table"],
  Videoke: ["Test mics & speakers", `Night groups: videoke off at ${QUIET_HOURS_START}`],
  "Parking Area": ["Clear the parking area"],
  "Events Venue": ["Sweep & arrange chairs/tables", "Test sound system & lights", "Restrooms stocked", "Setup matches the booking"],
  Room: ["Change linens & towels", "A/C & lights work", "Restock toiletries & water"],
};

const DEFAULT_AFTER: Record<string, string[]> = {
  "Swimming Pool": ["Skim floating trash", "Floats & equipment returned", "No broken tiles or fixtures"],
  "BBQ / Grilling Area": ["Grill grates intact", "Coals put out", "Tables cleared"],
  Billiards: ["All cues & balls returned", "No tears on the table cloth"],
  Videoke: ["Mics returned & working", "Remote returned"],
  "Parking Area": ["No damage to gate or lights"],
  "Events Venue": ["Chairs & tables counted", "No damage to fixtures", "Sound system & lights off"],
  Room: ["Linens, towels & pillows counted", "No left-behind items", "No damage to furniture"],
};

const key = (f: Facility) => (f.category === "Room" ? "Room" : f.name);

export function checklistFor(f: Facility, stage: "before" | "after"): string[] {
  const custom = stage === "before" ? f.beforeUseChecklist : f.afterUseChecklist;
  if (custom && custom.length > 0) return custom;
  return (stage === "before" ? DEFAULT_BEFORE : DEFAULT_AFTER)[key(f)] ?? [];
}
