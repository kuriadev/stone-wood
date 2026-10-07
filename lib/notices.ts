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

/** The refund page for a booking, derived from the guest link so this file
 *  needs no base-URL config of its own. */
function refundUrl(link: string, id: string): string {
  try {
    const u = new URL("/customer/refund", link);
    u.searchParams.set("booking", id);
    return u.toString();
  } catch {
    return `/customer/refund?booking=${encodeURIComponent(id)}`;
  }
}

export const notices = {
  /** The resort can't host the booking: the guest picks a new date.
   *
   *  StoneWood does not refund — the remedy is always another date, and that
   *  holds when the cancellation is the resort's own. What the guest has paid
   *  is kept against the booking and carries to whichever date they choose,
   *  so none of this copy may offer money back. */
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
          // The resort cancelled, so a refund is on the table — arranged by a
          // person through Customer Service, never issued automatically.
          `Would you rather have your money back? Because this cancellation was ours, you can request a refund instead of a new date.`,
        ],
        rows: [["Booking", b.id], ["Original date", visit(b)], ...(held > 0 ? [["Payment held for you", fmt(held)] as [string, string]] : [])],
        button: button(link, "Choose a new date"),
        // Offered only when there is money to give back, and styled as the
        // quieter option: a new date is what the resort would rather do.
        ...(held > 0
          ? {
              secondaryButton: {
                label: "Request a refund",
                url: refundUrl(link, b.id),
                note: "We'll ask for your GCash number and arrange it with you.",
              },
            }
          : {}),
      },
      sms: `StoneWood Resort: Sorry, we had to cancel your ${fmtDate(b.date)} booking ${b.id}. ${reason} ${held > 0 ? `Your ${fmt(held)} is safe and stays with the booking. ` : ""}Pick a new date by ${fmtDeadline(deadline)}: ${link}`,
    };
  },

  /** The guest picked a new date after a resort cancellation. */
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
