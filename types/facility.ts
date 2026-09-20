export type FacilityStatus = "Available" | "In Use" | "Needs Cleaning" | "Under Maintenance";
export type FacilityCategory = "Amenity" | "Room";

export interface Facility {
  id: number;
  category: FacilityCategory;
  name: string;
  icon: string;
  status: FacilityStatus;
  /** Only set for category "Room" — links back to types/room.ts Room.id
   *  so a completed booking can flag exactly the rooms it used. */
  roomId?: number;
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
