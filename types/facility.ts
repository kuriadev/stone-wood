export type FacilityStatus = "Available" | "In Use" | "Needs Cleaning" | "Under Maintenance";
export type FacilityCategory = "Amenity" | "Room";

/** Which reservations use an amenity:
 *    Pool    pool-side amenities — every booking that includes the pool
 *    Venue   the events hall — every booking that includes the venue
 *    Common  every booking, whatever it rents (e.g. parking) */
export type AmenityArea = "Pool" | "Venue" | "Common";

export interface Facility {
  id: number;
  category: FacilityCategory;
  name: string;
  icon: string;
  status: FacilityStatus;
  /** Only set for category "Room" — links back to types/room.ts Room.id
   *  so a completed booking can flag exactly the rooms it used. */
  roomId?: number;
  /** Amenities only. Undefined on records cached before the column
   *  existed ⇒ read from the name (see lib/facilityUsage.ts). */
  area?: AmenityArea;
  /** The line shown on the public website's amenities list. */
  description?: string;
  /** Whether the public amenities list shows it. Undefined ⇒ true. */
  showOnSite?: boolean;
  /** False once retired. Retired amenities drop out of new preparations
   *  and inspections but stay in old records. Undefined ⇒ true. */
  active?: boolean;
  lastUsedBookingId?: string | null;
  lastUsedGuestName?: string | null;
  /** ISO timestamp of the last time the caretaker marked this checked. */
  lastCheckedAt?: string | null;
  notes: string;
  /** Staff checklist to run through before a guest's reservation starts
   *  using this facility (e.g. skim the pool, check chlorine). Undefined ⇒
   *  a sensible category default is shown instead (see FacilitiesTab). */
  beforeUseChecklist?: string[];
  /** Staff checklist to run through after a reservation finishes using this
   *  facility, before it's handed to the next guest (e.g. drain kiddie
   *  pool, restock towels). Undefined ⇒ a category default is shown. */
  afterUseChecklist?: string[];
}

/** What the public website gets: no status, notes or checklists. */
export interface PublicAmenity {
  id: number;
  name: string;
  icon: string;
  description: string;
}
