// ── Maintenance mode
//
// One switch that closes the public site, plus the reason it is closed.
// The reason is a code, not free text, so the three states stay a fixed
// vocabulary the admin picks from — the database enforces the same list
// (see the site_settings check constraint) and the copy below is the one
// place the wording lives.

export type MaintenanceReason =
  | "resort_maintenance"
  | "resort_closed"
  | "website_maintenance";

export interface MaintenanceState {
  active: boolean;
  reason: MaintenanceReason;
  /** Optional extra line from the admin, e.g. "Back on Monday". */
  message: string;
}

export interface MaintenanceCopy {
  /** Short label for the admin's radio list. */
  label: string;
  /** The headline a visitor sees. */
  title: string;
  /** The explanatory line under it. */
  body: string;
}

export const MAINTENANCE_REASONS: Record<MaintenanceReason, MaintenanceCopy> = {
  resort_maintenance: {
    label: "Resort under maintenance",
    title: "The Resort is Under Maintenance",
    body: "We're carrying out work on the grounds and facilities. Online booking is paused until the resort reopens.",
  },
  resort_closed: {
    label: "Resort closed",
    title: "The Resort is Closed",
    body: "StoneWood isn't receiving guests right now. Please check back soon — we'll reopen bookings here.",
  },
  website_maintenance: {
    label: "Website under maintenance",
    title: "The Website is Under Maintenance",
    body: "We're updating the site. The resort itself is open — please contact us directly to book.",
  },
};

export const MAINTENANCE_REASON_LIST = Object.keys(MAINTENANCE_REASONS) as MaintenanceReason[];

export function isMaintenanceReason(v: unknown): v is MaintenanceReason {
  return typeof v === "string" && v in MAINTENANCE_REASONS;
}

/** What the app assumes before the server answers: open. A failed fetch must
 *  never black out a working site. */
export const MAINTENANCE_DEFAULT: MaintenanceState = {
  active: false,
  reason: "website_maintenance",
  message: "",
};
