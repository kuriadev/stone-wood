import type { ResortPackage } from "@/types/package";
import { slotFor } from "@/lib/resort";
import type { BookingResource } from "@/types/booking";

/** Which packages count as "events": anything that uses the hall, which is
 *  every package that is not pool-only.
 *
 *  The Packages page groups its EVENTS tab on exactly this rule, and the
 *  booking flow reuses it, so the two lists can never drift apart. */
export function isEventPackage(p: ResortPackage): boolean {
  return p.resource !== "Pool";
}

// ── Hours written into a package's text ──
//
// A package's blurb and "includes" lines are stored text, and the seeds wrote
// the slot hours into them ("Day (7:00 AM – 5:00 PM) or Night (…)"). When the
// Night Stay moved from midnight to 5 AM, the rows already in the database kept
// saying 12:00 AM, so the Packages page contradicted the booking flow.
//
// The hours are rewritten from SLOTS whenever a package is read. Only the
// shapes the seeds produce are touched — a time range after "Day"/"Night", and
// for a Whole Day package a bare range or "from X to Y" — so the owner's own
// wording is left alone. Saving the package in the admin then stores the
// corrected text.
const TIME = String.raw`\d{1,2}:\d{2}\s?[AP]M`;
const RANGE = String.raw`${TIME}\s*[–—-]\s*${TIME}(?:,\s*next day)?`;

// A venue-only package gets the venue's hours: it closes at midnight by
// default, not at the end of the Night Stay (lib/resort.ts slotFor).
function currentHours(text: string, wholeDay: boolean, resource: BookingResource): string {
  const day = slotFor("Day", resource), night = slotFor("Night", resource), whole = slotFor("WholeDay", resource);
  let out = text
    .replace(new RegExp(String.raw`\bDay \(${RANGE}\)`, "g"), `Day (${day.hours})`)
    .replace(new RegExp(String.raw`\bNight \(${RANGE}\)`, "g"), `Night (${night.hours})`);
  if (wholeDay) {
    out = out
      .replace(new RegExp(String.raw`^${RANGE}$`), whole.hours)
      .replace(new RegExp(String.raw`\bfrom ${TIME} to ${TIME}`, "g"), `from ${whole.start} to ${whole.end}`);
  }
  return out;
}

export function withCurrentHours(p: ResortPackage): ResortPackage {
  const wholeDay = p.slotMode === "WholeDay";
  return {
    ...p,
    blurb: currentHours(p.blurb, wholeDay, p.resource),
    includes: p.includes.map((line) => currentHours(line, wholeDay, p.resource)),
  };
}
