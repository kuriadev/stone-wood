// ── Which facilities a reservation uses, and what to check on each
//
// Replaces the old /Tour/i test on the package label, which missed every
// package booking ("Private Pool", "Party Package"…) and venue-only events.
// The booking's resource decides it:
//   Pool        → every amenity except the events venue
//   Venue       → the events venue and parking
//   Pool+Venue  → every amenity
// plus each room the booking rented.

import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import { QUIET_HOURS_START } from "@/lib/resort";

const VENUE = "Events Venue";
const PARKING = "Parking Area";

export function facilitiesForBooking(b: Booking, facilities: Facility[]): Facility[] {
  const resource = b.resource ?? "Pool";
  return facilities.filter((f) => {
    if (f.category === "Room") return f.roomId !== undefined && (b.rooms || []).includes(f.roomId);
    if (resource === "Pool+Venue") return true;
    if (resource === "Venue") return f.name === VENUE || f.name === PARKING;
    return f.name !== VENUE;
  });
}

// Defaults used until the owner writes a checklist of their own for a
// facility (editable in Facilities → Facility status).
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
