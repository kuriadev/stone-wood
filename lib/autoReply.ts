// ── The draft reply to a customer-service message
//
// Staff open a message, and the Automated tab puts a reply in the box that
// they read, adjust and send. It is a DRAFT, not an answer: nothing here is
// sent without someone pressing the button.
//
// ── The bug this replaces ──
//
// The drafts were an object literal in Admin.tsx keyed on the words the
// admin SEES — "Question", "Booking Issue" — while `msg.type` holds what
// the guest's form actually stored: Inquiry, Feedback, Complaint, Refund,
// Suggestion, Other. Three of the six keys matched nothing, the lookup
// ended in `|| ""`, and a refund request opened the Automated tab with an
// empty box. Keying on the stored values, in one place, is what stops that
// happening again; `draftReply` also never returns an empty string, so a
// type nobody has thought of yet still gets a usable reply.
//
// ── What "based on the context" means here ──
//
// A draft that could have been written before the message arrived is not
// worth reading. These use what the message actually carries: the guest's
// first name, the booking reference if they quoted one, and the dates of
// that booking when it can be found. The type decides the middle; the
// context decides the rest.

import type { Booking } from "@/types/booking";
import type { CustomerMessage } from "@/types/admin";
import { RESORT_CONTACT } from "@/lib/resort";
import { stayLabel, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";

/** A booking reference as guests write it: SW-10141, sw10141, "SW 10141". */
const REF = /\bSW[\s-]?(\d{4,6})\b/i;

/** The reference a message quotes, normalised to SW-NNNNN. Null if none. */
export function referenceIn(text: string): string | null {
  const m = REF.exec(text ?? "");
  return m ? `SW-${m[1]}` : null;
}

/** The booking a message is about: the one it quotes by reference, else the
 *  guest's most recent booking by email. Null when neither finds one. */
export function bookingFor(msg: Pick<CustomerMessage, "message" | "email">, bookings: Booking[] = []): Booking | null {
  const ref = referenceIn(msg.message ?? "");
  if (ref) {
    const hit = bookings.find((b) => b.id.toUpperCase() === ref.toUpperCase());
    if (hit) return hit;
  }
  const mail = (msg.email ?? "").trim().toLowerCase();
  if (!mail) return null;
  // Most recent first, so "your booking" means the one they are living with.
  const theirs = bookings
    .filter((b) => (b.email ?? "").trim().toLowerCase() === mail)
    .sort((a, b) => b.date.localeCompare(a.date));
  return theirs[0] ?? null;
}

/** "Juan" from "Juan Dela Cruz". Falls back to a plain greeting. */
function firstName(name: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first && first.length <= 20 ? first : "there";
}

/** The booking named in a sentence: "your Day Tour on October 17, 2026". */
function describe(b: Booking | null): string {
  if (!b) return "";
  return `your ${SLOTS[getBookingSlot(b)].label} on ${stayLabel(b)}`;
}

/** The body for each type the customer-service form can store.
 *
 *  `Refund` is worded with care. The resort's policy is that money comes
 *  back when the RESORT cancels, not when a guest does, so a draft must not
 *  promise a refund it may not be able to make — it says how the decision
 *  is made and asks them to call. */
function body(type: string, ctx: { about: string; ref: string | null }): string {
  const about = ctx.about ? ` about ${ctx.about}` : "";
  const ref = ctx.ref ? ` (${ctx.ref})` : "";

  switch (type) {
    case "Inquiry":
      return `Thank you for your question${about}${ref}. We have passed it to the team and you will have a proper answer within one business day. If it is urgent, call us on ${RESORT_CONTACT.phone} and we will help you straight away.`;
    case "Feedback":
      return `Thank you for taking the time to write${about}${ref}. Feedback like yours is what tells us which parts of the stay are working, and we have shared it with the team.`;
    case "Complaint":
      return `Thank you for telling us${about}${ref}, and we are sorry it fell short. We are looking into what happened and will come back to you within one business day with what we have found and what we are doing about it.`;
    case "Refund":
      // `ctx.about`, not `about`: the latter already carries its own
      // preposition, and reusing it here read "with about your Day Tour".
      return `We have received your refund request${ref}. So you know where you stand: a refund is arranged when the resort has to cancel a booking. If that is what happened${ctx.about ? ` with ${ctx.about}` : ""}, we will sort it out with you directly — please call us on ${RESORT_CONTACT.phone} and we will go through it with you.`;
    case "Suggestion":
      return `Thank you for the suggestion${about}${ref}. We have passed it on to the owner — a good number of the things guests enjoy here started exactly this way.`;
    case "Other":
      return `Thank you for getting in touch${about}${ref}. We have passed your message to the team and you will hear back within one business day.`;
    default:
      // A type nobody has added a draft for still gets a usable reply.
      // This is the branch whose absence left the box empty.
      return `Thank you for getting in touch${about}${ref}. We have passed your message to the team and you will hear back within one business day. If it is urgent, call us on ${RESORT_CONTACT.phone}.`;
  }
}

/**
 * The draft put in the reply box when staff choose "Automated".
 *
 * Always returns something worth sending. `bookings` is optional: without
 * it the draft still works, it just cannot name the guest's dates.
 */
export function draftReply(
  msg: Pick<CustomerMessage, "name" | "email" | "type" | "message">,
  bookings: Booking[] = []
): string {
  const booking = bookingFor(msg, bookings);
  const ref = referenceIn(msg.message ?? "") ?? (booking ? booking.id : null);

  return [
    `Hi ${firstName(msg.name)},`,
    "",
    body(msg.type ?? "Other", { about: describe(booking), ref }),
    "",
    "Warm regards,",
    "StoneWood Private Resort",
  ].join("\n");
}
