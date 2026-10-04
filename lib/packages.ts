import type { ResortPackage } from "@/types/package";

/** Which packages count as "events": anything that uses the hall, which is
 *  every package that is not pool-only.
 *
 *  The Packages page groups its EVENTS tab on exactly this rule, and the
 *  booking flow reuses it, so the two lists can never drift apart. */
export function isEventPackage(p: ResortPackage): boolean {
  return p.resource !== "Pool";
}
