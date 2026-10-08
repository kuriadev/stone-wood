// ── What the guest is told, by email and by text
//
// Each notice is written once and comes in two forms: an email (sent by the
// server) and a short text message the owner sends from their own phone
// with one tap ("Text the guest"). Most guests here read texts, not email;
// a text from the resort's known number is also the opposite of a scam.
// Both point to the guest's booking page, which always shows the same facts.

import type { Booking } from "@/types/booking";
import type { Notice } from "@/lib/emailTemplate";
import { fmt, fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { fmtDeadline } from "@/lib/rebooking";

export interface NoticeText {
  email: Notice;
  sms: string;
}

const visit = (b: Booking, date = b.date) => `${fmtDate(date)} (${SLOTS[getBookingSlot(b)].label})`;
const button = (link: string, label = "Open my booking") => ({ label, url: link });

export const notices = {
  /** The resort can't host the booking: the guest picks a new date.
   *
   *  What the guest has paid is kept against the booking and carries to
   *  whichever date they choose. Because the cancellation is the resort's
   *  own, they may have it back instead — but only by talking to the owner,
   *  so the email lists the owner's contacts rather than a refund button. */
  resortCancelled(b: Booking, reason: string, link: string, deadline: string, held: number): NoticeText {
    return {
      email: {
        subject: `Your ${fmtDate(b.date)} booking was cancelled – ${b.id}`,
        title: "We had to cancel your booking",
        tagline: "Choose another date",
        name: b.name,
        paragraphs: [
          `We're sorry. We can't host your booking on ${visit(b)}. Reason: ${reason}`,
          held > 0
            ? `Your payment of ${fmt(held)} is safe and stays with your booking. Please pick another available date by ${fmtDeadline(deadline)} and we'll move you across at no extra cost.`
            : `You can move your booking to another available date at no cost. Please choose by ${fmtDeadline(deadline)}.`,
          `If none of the open dates suit you, reply to this email or call us and we'll find one together.`,
        ],
        rows: [["Booking", b.id], ["Original date", visit(b)], ...(held > 0 ? [["Payment held for you", fmt(held)] as [string, string]] : [])],
        button: button(link, "Choose a new date"),
        // The resort cancelled, so a refund is on the table — but it is
        // arranged with the owner over a call or chat, never by a button.
        // Offered only when there is money to give back.
        ...(held > 0
          ? {
              contact: {
                title: "Prefer a refund?",
                note: `Because this cancellation was ours, you can have your ${fmt(held)} back instead of a new date. Call or message us with your booking reference ${b.id} and we'll arrange it with you.`,
                mailSubject: `Refund request – ${b.id}`,
              },
            }
          : {}),
      },
      sms: `StoneWood Resort: Sorry, we had to cancel your ${fmtDate(b.date)} booking ${b.id}. ${reason} ${held > 0 ? `Your ${fmt(held)} is safe and stays with the booking. ` : ""}Pick a new date by ${fmtDeadline(deadline)}: ${link}`,
    };
  },

  /** The guest picked a new date after a resort cancellation; the owner
   *  has to approve it. The booking is still cancelled until then. */
  rebookRequested(b: Booking, toDate: string, holdUntil: string, link: string): NoticeText {
    return {
      email: {
        subject: `We got your new date – ${b.id}`,
        title: "We got your new date",
        tagline: "The resort will confirm it soon",
        name: b.name,
        paragraphs: [
          `You picked ${visit(b, toDate)} for booking ${b.id}. We're holding that date for you until ${fmtDeadline(holdUntil)} while the resort confirms it, and we'll email you the answer.`,
        ],
        rows: [["Booking", b.id], ["Cancelled date", visit(b)], ["Your new date", visit(b, toDate)]],
        button: button(link, "Check my booking"),
      },
      sms: `StoneWood Resort: We got your new date for ${b.id}: ${fmtDate(toDate)}. We'll confirm it by ${fmtDeadline(holdUntil)}. ${link}`,
    };
  },

  /** The owner declined that new date, or didn't answer before the hold
   *  ran out (`note` says which). The guest picks again by `deadline`. */
  rebookDeclined(b: Booking, toDate: string, note: string, deadline: string, link: string): NoticeText {
    return {
      email: {
        subject: `Please pick another date – ${b.id}`,
        title: "Please pick another date",
        tagline: `We couldn't confirm ${fmtDate(toDate)}`,
        name: b.name,
        paragraphs: [
          `We're sorry, we couldn't confirm ${visit(b, toDate)} for booking ${b.id}.${note ? ` ${note}` : ""}`,
          `Your payment still stays with your booking. Please pick another available date by ${fmtDeadline(deadline)}, or call us and we'll find one together.`,
        ],
        rows: [["Booking", b.id], ["Pick a date by", fmtDeadline(deadline)]],
        button: button(link, "Choose another date"),
      },
      sms: `StoneWood Resort: Sorry, we couldn't confirm ${fmtDate(toDate)} for ${b.id}.${note ? ` ${note}` : ""} Please pick another date by ${fmtDeadline(deadline)}: ${link}`,
    };
  },

  /** The owner approved the date the guest picked after a resort
   *  cancellation. */
  rebooked(b: Booking, oldDate: string, link: string): NoticeText {
    return {
      email: {
        subject: `Your booking is moved to ${fmtDate(b.date)} – ${b.id}`,
        title: "Your new date is confirmed",
        tagline: `See you on ${fmtDate(b.date)}`,
        name: b.name,
        paragraphs: [`Your booking has moved from ${fmtDate(oldDate)} to ${visit(b)}. Your payment carries over; nothing more is needed from you.`],
        rows: [["Booking", b.id], ["New date", visit(b)]],
        button: button(link),
      },
      sms: `StoneWood Resort: Your booking ${b.id} is confirmed for ${visit(b)}. Details: ${link}`,
    };
  },

  /** The guest asked for their money back instead of a new date. */
  refundRequested(b: Booking, amount: number, link: string): NoticeText {
    return {
      email: {
        subject: `Your refund of ${fmt(amount)} – ${b.id}`,
        title: "Your refund is on its way",
        tagline: "We'll send it as soon as we can",
        name: b.name,
        paragraphs: [
          `We'll refund ${fmt(amount)} for booking ${b.id}. The resort will send it to you and you'll get the reference number by text and on your booking page.`,
        ],
        rows: [["Booking", b.id], ["Refund", fmt(amount)]],
        button: button(link, "Track my refund"),
      },
      sms: `StoneWood Resort: We'll refund your ${fmt(amount)} for booking ${b.id}. You'll get the reference when it's sent. Track it: ${link}`,
    };
  },

  /** The guest asked to move their booking; the owner will answer. */
  dateChangeRequested(b: Booking, toDate: string, holdUntil: string, link: string): NoticeText {
    return {
      email: {
        subject: `Date change requested – ${b.id}`,
        title: "We got your date change request",
        tagline: "The resort will answer soon",
        name: b.name,
        paragraphs: [
          `You asked to move booking ${b.id} from ${fmtDate(b.date)} to ${visit(b, toDate)}. We're holding that date for you until ${fmtDeadline(holdUntil)} while the resort reviews it. Your booking stays on ${fmtDate(b.date)} until then.`,
        ],
        rows: [["Booking", b.id], ["Current date", fmtDate(b.date)], ["Requested date", visit(b, toDate)]],
        button: button(link, "Check my request"),
      },
      sms: `StoneWood Resort: We got your request to move ${b.id} to ${fmtDate(toDate)}. We'll answer by ${fmtDeadline(holdUntil)}. ${link}`,
    };
  },

  dateChangeApproved(b: Booking, fromDate: string, link: string): NoticeText {
    return {
      email: {
        subject: `Your booking is moved to ${fmtDate(b.date)} – ${b.id}`,
        title: "Your date change is approved",
        tagline: `See you on ${fmtDate(b.date)}`,
        name: b.name,
        paragraphs: [`Your booking has moved from ${fmtDate(fromDate)} to ${visit(b)}. Your payment carries over.`],
        rows: [["Booking", b.id], ["New date", visit(b)]],
        button: button(link),
      },
      sms: `StoneWood Resort: Your booking ${b.id} is moved to ${visit(b)}. See you then! ${link}`,
    };
  },

  dateChangeDeclined(b: Booking, toDate: string, note: string, link: string): NoticeText {
    return {
      email: {
        subject: `About your date change request – ${b.id}`,
        title: "We couldn't move your booking",
        tagline: `Your booking stays on ${fmtDate(b.date)}`,
        name: b.name,
        paragraphs: [
          `We're sorry, we couldn't move booking ${b.id} to ${fmtDate(toDate)}.${note ? ` ${note}` : ""}`,
          `Your booking stays on ${visit(b)}. You can request a different date from your booking page.`,
        ],
        button: button(link),
      },
      sms: `StoneWood Resort: Sorry, we couldn't move ${b.id} to ${fmtDate(toDate)}.${note ? ` ${note}` : ""} Your booking stays on ${fmtDate(b.date)}. ${link}`,
    };
  },

  refundSent(b: Booking, amount: number, method: string, reference: string, link: string): NoticeText {
    return {
      email: {
        subject: `Refund sent: ${fmt(amount)} – ${b.id}`,
        title: "Your refund has been sent",
        tagline: `${fmt(amount)} by ${method}`,
        name: b.name,
        paragraphs: [`We sent your refund of ${fmt(amount)} for booking ${b.id}.${reference ? ` The ${method} reference number is ${reference}.` : ""} The receipt is on your booking page.`],
        rows: [["Booking", b.id], ["Refund", fmt(amount)], ["Sent by", method], ...(reference ? [["Reference", reference] as [string, string]] : [])],
        button: button(link, "See the receipt"),
      },
      sms: `StoneWood Resort: We sent your ${fmt(amount)} refund for ${b.id} by ${method}${reference ? `, ref ${reference}` : ""}. Receipt: ${link}`,
    };
  },
};

/** An sms: link that opens the phone's messaging app with the text ready. */
export function smsHref(contact: string, body: string): string {
  const to = (contact || "").replace(/[^\d+]/g, "");
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}
