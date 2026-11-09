// ── What an email to a guest is probably about, from where the booking stands
//
// "Email guest" opens with a subject and an example message that fit the
// booking's situation right now: a guest who still has to pick a new date is
// nudged about the deadline, one arriving tomorrow gets a see-you-tomorrow,
// one who just left gets a thank-you. Staff still write the message; the
// example only shows what kind of note fits. Pure; tested in
// tests/unit/guestEmailDraft.test.ts.

import type { Booking } from "@/types/booking";
import { fmt, fmtDate, bookingEndDate } from "@/lib/utils";
import { fmtDeadline } from "@/lib/rebooking";
import { isNoShow, isRefunded } from "@/lib/labels";

export interface GuestEmailDraft {
  subject: string;
  /** Shown greyed out in the empty message box. */
  placeholder: string;
}

const firstName = (name: string) => (name.trim().split(/\s+/)[0] || "there");

/**
 * @param due    what the guest still owes (bookingMoney().due)
 * @param today  Manila date, YYYY-MM-DD
 */
export function guestEmailDraft(b: Booking, due: number, today: string): GuestEmailDraft {
  const hi = `Hi ${firstName(b.name)},`;
  const when = fmtDate(b.date);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  // ── After a cancellation ──
  if (b.status === "ResortCancelled") {
    const by = b.choiceDeadline ? ` until ${fmtDeadline(b.choiceDeadline)}` : "";
    const held = (b.heldAmount ?? 0) > 0 ? ` Your ${fmt(b.heldAmount ?? 0)} is still safe with your booking,` : "";
    return {
      subject: `Following up: pick a new date for ${b.id}`,
      placeholder: `e.g. ${hi} just following up on your booking ${b.id}. We're sorry again that we couldn't host you on ${when}.${held} and you can move to any free date${by} at no extra cost. If you'd rather have your money back, just reply and we'll arrange it with you.`,
    };
  }
  if (isRefunded(b)) {
    return {
      subject: `Your refund for ${b.id}`,
      placeholder: `e.g. ${hi} we've returned your refund for ${b.id}, as we agreed. Thank you for your patience, and we hope to welcome you at Stonewood another time.`,
    };
  }
  if (b.status === "Cancelled" && b.refundStatus === "Owed") {
    return {
      subject: `About your refund for ${b.id}`,
      placeholder: `e.g. ${hi} we'd like to arrange the refund of ${fmt(b.refundAmount ?? 0)} for ${b.id}. When is a good time to call, and where should we send it?`,
    };
  }
  if (isNoShow(b)) {
    const by = b.choiceDeadline ? ` until ${fmtDeadline(b.choiceDeadline)}` : "";
    return {
      subject: `We missed you – pick a new date for ${b.id}`,
      placeholder: `e.g. ${hi} we missed you on ${when}! You can still move ${b.id} to another free date${by}, and what you paid carries over. Just pick one from your booking page, or reply and we'll help.`,
    };
  }
  if (b.status === "Cancelled") {
    return {
      subject: `About your cancelled booking ${b.id}`,
      placeholder: `e.g. ${hi} we're writing about ${b.id}, which was cancelled. If you'd like to book another date, we'd be happy to help you find one.`,
    };
  }

  // ── Done ──
  if (b.status === "Completed") {
    return due > 0
      ? {
          subject: `Your remaining balance for ${b.id}`,
          placeholder: `e.g. ${hi} thank you for staying with us! There's still ${fmt(due)} left on ${b.id}. You can settle it by QR Ph or in cash, whichever is easier for you.`,
        }
      : {
          subject: `Thank you for staying at Stonewood`,
          placeholder: `e.g. ${hi} thank you for spending your ${when} with us! We hope everyone had a great time. We'd love to see you again — just reply whenever you'd like to book your next visit.`,
        };
  }

  // ── Waiting ──
  if (b.status === "Pending") {
    return b.source === "Walk-In"
      ? {
          subject: `Your reservation ${b.id} is waiting for payment`,
          placeholder: `e.g. ${hi} your date of ${when} is held for you. Once the payment comes in, ${b.id} is confirmed and the date is yours.`,
        }
      : {
          subject: `We're reviewing your booking ${b.id}`,
          placeholder: `e.g. ${hi} thanks for booking ${when} with us! We've received your payment and we're confirming your booking now. You'll hear from us shortly.`,
        };
  }

  // ── Confirmed: on site, leaving, or coming ──
  if (b.checkedOutAt) {
    return {
      subject: `Your remaining balance for ${b.id}`,
      placeholder: `e.g. ${hi} thank you for staying with us! ${due > 0 ? `There's still ${fmt(due)} to settle on ${b.id}` : `Your stay is all settled`}. Let us know if anything was left behind.`,
    };
  }
  if (b.checkedInAt) {
    return {
      subject: `Enjoy your stay, ${firstName(b.name)}`,
      placeholder: `e.g. ${hi} we hope you're enjoying the resort! If you need anything — extra towels, more chairs, or a little more time — just let the front desk know.`,
    };
  }
  const balanceLine = due > 0 ? ` The balance of ${fmt(due)} is paid when you arrive, by QR Ph or in cash.` : "";
  if (b.date <= today && today <= bookingEndDate(b)) {
    return {
      subject: `See you today, ${firstName(b.name)}!`,
      placeholder: `e.g. ${hi} we're all set for you today! What time do you expect to arrive?${balanceLine}`,
    };
  }
  if (b.date === tomorrow) {
    return {
      subject: `See you tomorrow – ${b.id}`,
      placeholder: `e.g. ${hi} just a reminder that we're expecting you tomorrow, ${when}.${balanceLine} Let us know if your plans change.`,
    };
  }
  if (b.date < today) {
    return {
      subject: `Following up on your booking ${b.id}`,
      placeholder: `e.g. ${hi} we were expecting you on ${when}. Is everything all right? Reply and we'll help you sort out your booking.`,
    };
  }
  return {
    subject: `Your upcoming stay on ${when}`,
    placeholder: `e.g. ${hi} we're looking forward to your visit on ${when}! If you'd like to add a room, the events venue or more guests, just reply and we'll arrange it.${balanceLine}`,
  };
}
