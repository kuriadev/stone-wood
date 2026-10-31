// ── Booking references
//
// A reference starts with what was booked: DT- Day Tour, NT- Night Tour,
// SC- Staycation (migration 20261101120000_booking_ref_by_slot). Bookings
// made before that keep SW-, so all four are recognised everywhere a
// reference is read: guest messages, links, the refund form.

/** The letters a reference can start with. */
export const REF_PREFIXES = ["DT", "NT", "SC", "SW"] as const;

/** The prefix a new booking of this type gets. */
export const refPrefixFor = (slot: "Day" | "Night" | "WholeDay"): "DT" | "NT" | "SC" =>
  slot === "Night" ? "NT" : slot === "WholeDay" ? "SC" : "DT";

/** A reference anywhere in a text, as guests type it: "DT-10201",
 *  "dt10201", "NT 10202". */
const IN_TEXT = /\b(DT|NT|SC|SW)[\s-]?(\d{4,6})\b/i;

/** The reference a text quotes, written the standard way ("DT-10201"),
 *  or null. */
export function findRef(text: string): string | null {
  const m = IN_TEXT.exec(text ?? "");
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

/** True for a whole string that is a reference. */
export const isRef = (v: string) => /^(DT|NT|SC|SW)-\d{4,6}$/i.test(v.trim());
