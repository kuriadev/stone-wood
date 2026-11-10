// ── Children under 3
//
// Book Now asks for adults (everyone 3 and older) and children under 3
// separately. `guests` on a booking is the ADULTS; `children` is kept
// beside it.
//
//   Shared      children count as guests: adults and children together are
//               held to the capacity (30 online), so 15 adults can bring
//               up to 15 children, and they take shared spots the same way.
//   Exclusive   children are free and NOT counted: 30 adults can still
//               bring children.
//   Either way  everyone booked into the resort for a tour, every group
//               together, stays within CHILDREN_TOTAL_MAX (100), so it is
//               never packed.
//   Exclusive   flat rate: children under 3 are free.
//   Shared      billed per guest: each child pays the child rate (Rates &
//               Settings), lower than an adult's.
//
// Every booking has at least one adult.
//
// Pure: Book Now, the home card and the server quote (lib/bookingQuote.ts)
// all use it.

import type { BookingTier } from "@/types/booking";
import { OVERRIDE_GUESTS_MAX } from "@/lib/validators";

/** Children this age and below are the "children" count (Rates & Settings). */
export let CHILD_FREE_AGE = 3;
export function applyChildValues(v: { freeAge: number }): void { CHILD_FREE_AGE = v.freeAge; }

/** Everyone at the resort at once (Rates & Settings, "Most people at
 *  once"). Re-exported so it stays live when the owner changes it. */
export { OVERRIDE_GUESTS_MAX as CHILDREN_TOTAL_MAX };

/** Do children count toward the booking's guest limit? Only in Shared. */
export function childrenCount(tier: BookingTier): boolean {
  return tier === "Shared";
}

/** The headcount held to the capacity: adults, plus children in Shared. */
export function cappedHeadcount(adults: number, children: number, tier: BookingTier): number {
  return childrenCount(tier) ? adults + children : adults;
}

/** The most children this many adults can bring: in Shared, adults and
 *  children together within `cap` (the booking's guest limit,
 *  guestLimitFor); always, everyone on the tour (`onTour`, lib/utils.ts
 *  peopleOnTour) within OVERRIDE_GUESTS_MAX. */
export function childLimit(adults: number, cap: number, onTour = 0, tier: BookingTier = "Shared"): number {
  if (adults < 1) return 0;
  const crowd = OVERRIDE_GUESTS_MAX - onTour - adults;
  return Math.max(0, childrenCount(tier) ? Math.min(cap - adults, crowd) : crowd);
}

/** Why this many children can't be booked, or null. */
export function childrenProblem(adults: number, children: number, cap: number, onTour = 0, tier: BookingTier = "Shared"): string | null {
  if (!Number.isInteger(children) || children < 0) return "The number of children isn't valid.";
  if (children === 0) return null;
  if (adults < 1) return `A child ${CHILD_FREE_AGE} years old and below needs an adult with them.`;
  if (childrenCount(tier) && adults + children > cap) return `A shared booking holds up to ${cap} guests, adults and children together.`;
  if (onTour + adults + children > OVERRIDE_GUESTS_MAX) {
    const left = Math.max(0, OVERRIDE_GUESTS_MAX - onTour - adults);
    return left > 0
      ? `Only ${left} more child${left === 1 ? "" : "ren"} can come that tour: ${onTour} people are already booked, and the resort holds ${OVERRIDE_GUESTS_MAX} at once.`
      : `No more children can come that tour: the resort is already at ${OVERRIDE_GUESTS_MAX} people with your group.`;
  }
  return null;
}

/** Shared children pay the child rate; Exclusive ones are free. */
export function childrenPay(tier: BookingTier): boolean {
  return tier === "Shared";
}

/** "4 guests · 1 child (3 years old and below)", for summaries and staff screens. */
export function headcountLabel(adults: number, children: number): string {
  const a = `${adults} ${adults === 1 ? "guest" : "guests"}`;
  if (!children) return a;
  return `${a} · ${children} ${children === 1 ? "child" : "children"} (${CHILD_FREE_AGE} years old and below)`;
}

/** A stored booking's head count: `guests` is the adults. */
export function bookingHeadcount(b: { guests: number; children?: number }): string {
  const kids = b.children ?? 0;
  return kids ? headcountLabel(b.guests, kids) : String(b.guests);
}
