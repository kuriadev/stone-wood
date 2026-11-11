// ── Why an online booking is "Awaiting approval"
//
// A paid online booking that couldn't be confirmed by itself is saved with
// one "⚠ CHECK: …" line per problem in its notes (app/api/bookings POST):
//
//   taken    the date filled up while the guest was paying: two groups
//            booked the same tour at the same moment (a double booking)
//   amount   what was paid doesn't match the down payment or the total
//   twice    the same group seems to have booked the date twice
//
// This reads those lines back, so the admin sees WHY in plain words and the
// guest is told the reason (in the "being reviewed" email, and as the
// suggested reason if the resort has to cancel and offer a new date).

export type ReviewKind = "taken" | "amount" | "twice" | "other";

export interface ReviewReason {
  kind: ReviewKind;
  /** Short name for staff, e.g. "Double booking". */
  title: string;
  /** What the system recorded, for staff. */
  detail: string;
  /** What the guest is told, in plain words. */
  guest: string;
  /** Suggested reason if the resort cancels and the guest picks a new date. */
  cancelText: string;
}

const MARK = "⚠ CHECK:";

export function reviewReasons(notes: string | null | undefined): ReviewReason[] {
  if (!notes || !notes.includes(MARK)) return [];
  return notes.split(MARK).slice(1).map((raw) => {
    const detail = raw.trim();
    if (/taken while the guest was paying|no longer available|fully booked|already booked|is booked|isn't available|not available/i.test(detail)) {
      return {
        kind: "taken" as const,
        title: "Double booking",
        detail,
        guest: "Another group booked and paid for the same tour at almost the same moment as you, so the date was taken just before your payment came through. We're checking how we can still host you.",
        cancelText: "Another group booked and paid for the same tour at almost the same moment as you did, so that date ended up booked twice (a double booking). It stays with the booking that was completed first, so please choose a new date. Everything you paid carries over to it.",
      };
    }
    if (/^paid\s/i.test(detail)) {
      return {
        kind: "amount" as const,
        title: "Amount doesn't match",
        detail,
        guest: "The amount we received doesn't match the amount due for your booking, so we're checking your payment before we confirm.",
        cancelText: "The amount we received didn't match the amount due for your booking, so we couldn't confirm it on that date. Please choose a new date. What you paid carries over to it.",
      };
    }
    if (/same group|same name/i.test(detail)) {
      return {
        kind: "twice" as const,
        title: "Possibly booked twice",
        detail,
        guest: "It looks like your group may already have a booking for this date, so we're checking that the two aren't the same visit booked twice.",
        cancelText: "Your group appears to have booked the same date twice, so we couldn't keep both. Please choose a new date for this booking, or call us if it was a mistake. What you paid carries over to it.",
      };
    }
    return {
      kind: "other" as const,
      title: "Needs a check",
      detail,
      guest: "Something about your booking needs a quick check by our team before we confirm it.",
      cancelText: "We couldn't confirm your booking on that date. Please choose a new date. What you paid carries over to it.",
    };
  });
}

/** The guest's own notes, without the staff "⚠ CHECK" lines. */
export function guestNotesOnly(notes: string | null | undefined): string {
  if (!notes) return "";
  const i = notes.indexOf(MARK);
  return (i < 0 ? notes : notes.slice(0, i)).trim();
}
