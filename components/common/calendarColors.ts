// ── One solid palette for every calendar
//
// The home card, Book Now, the admin's Booking Calendar and the move-booking
// window fill each day with its state's colour instead of a faint tint: the
// tints composited to almost the same dark tile, and the owner asked for
// colours that read at a glance (2026-10-27). Every fill carries ink above
// 4.5:1.
//
// The days a guest picks are the resort's own gold, first to last, so "the
// days I chose" never looks like "a day that's open" and sits in the same
// family as the rest of the site. They were blue for a day; blue against
// the green and the gold was a clash (owner, 2026-10-27). For the same
// reason a completed stay on the admin calendar is grey, not blue: it is
// done, so it steps back.

export const CAL = {
  available: { bg: "#1f7a38", ink: "#ffffff", rim: "#2e9e4e" },
  booked: { bg: "#5f6368", ink: "#ffffff", rim: "#7a7f85" },
  closed: { bg: "#b3261e", ink: "#ffffff", rim: "#d04437" },
  selected: { bg: "#c9a84c", ink: "#1a1000", rim: "#e8c97a" },
  // The admin calendar's own states.
  pending: { bg: "#f5c518", ink: "#2b2200", rim: "#ffd84a" },
  completed: { bg: "#5f6368", ink: "#ffffff", rim: "#7a7f85" },
} as const;

/** The line drawn between the chosen days. */
export const CAL_LINE = "#f2d98b";

/** The guest calendars' legend. */
export const GUEST_LEGEND: [string, string][] = [
  ["Available", CAL.available.bg],
  ["Your dates", CAL.selected.bg],
  ["Booked", CAL.booked.bg],
  ["Closed", CAL.closed.bg],
];
