// ── What a colour means, everywhere in the admin
//
// One colour, one meaning, so staff can read a screen at a glance -- the
// owner asked for indicators that don't conflict (alpha notes, 2026-10-31).
// The order is the order of urgency:
//
//   red     act now        late, overdue, unpaid, a refund owed, a no-show
//   amber   needs a step   waiting for approval, partly paid, not prepared
//   blue    on track       confirmed and coming, on site, information
//   green   done / good    completed, paid in full, ready
//   purple  with the guest waiting for the guest to choose (after the resort cancelled)
//   grey    closed         cancelled, forfeited, withdrawn -- nothing more to do
//
// Red is never used for something that is merely finished (a cancelled
// booking is grey, not red), and the brand gold is never a status: it
// marks the resort's own buttons and highlights, so amber is warmer and
// brighter than it, not the same colour.

export const SIGNAL = {
  urgent: "#e5484d",
  attention: "#f5a524",
  progress: "#3e8ed0",
  done: "#2e9e4e",
  guest: "#9a7bd0",
  closed: "#8b8d98",
} as const;

export type Signal = keyof typeof SIGNAL;

