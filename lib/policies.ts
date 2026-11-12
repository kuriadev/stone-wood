// ── The booking policy, in one place
//
// What the guest agrees to on Book Now and reads again on their booking
// page. Built when shown, so the numbers follow Rates & Settings (the
// date-change notice, the hold). The resort's rule on money (owner,
// 2026-10): a refund only when the RESORT cancels; a guest who cancels is
// not refunded but can move the booking instead.

import { RESCHEDULE_NOTICE_DAYS } from "@/lib/validators";
import { HOLD_HOURS } from "@/lib/rebooking";

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Rescheduling: free, once, with notice. */
export function reschedulePolicy(): string[] {
  return [
    `You can move your booking to another free date once, at no charge — everything you paid carries over.`,
    `Ask at least ${days(RESCHEDULE_NOTICE_DAYS)} before your visit, from your booking page. Closer than that the date can't be filled by anyone else, so changes are closed (emergencies below).`,
    `Your new date is held for ${HOLD_HOURS} hours while the resort approves it; until then your booking stays on its original date.`,
    `A second change, or a change of guests or package, is arranged with the resort directly and depends on availability.`,
    `Not coming without telling the resort is a no-show: the booking is closed and payments are kept.`,
  ];
}

/** Emergencies: what the resort does when a guest truly can't come, and
 *  when the resort itself has to close. */
export function emergencyPolicy(): string[] {
  return [
    `A real emergency — illness or injury, a death in the family, an accident — send the resort what happened from your booking page (Manage booking), with proof such as a medical certificate, even on the day. If it's approved, the resort moves your booking to a free date at no charge, even inside the ${days(RESCHEDULE_NOTICE_DAYS)} notice.`,
    `Bad weather or a disaster: if PAGASA raises a storm signal for the area, or the government restricts travel, the resort contacts you. You choose a free new date or a full refund.`,
    `If the resort has to cancel for any reason (a repair, a power or water outage, safety), you choose a free new date or a full refund.`,
    `Payments are carried to the new date, not refunded, when a guest's own plans change. A refund is given only when the resort cancels.`,
  ];
}

/** The short points on Book Now's payment step. */
export function checkoutPolicy(payFull: boolean, quietHours: string): [string, string][] {
  return [
    ["Cancellations", "If the resort has to cancel (including for a storm signal), you choose a free new date or a full refund. If you cancel, payments aren't refunded — move your booking to another date instead."],
    [payFull ? "Paying in full" : "50% reservation deposit", payFull ? "The whole total is paid now; nothing is due on arrival." : "Half of the total is due now; the balance is paid on arrival."],
    ["Proof of payment", "Send the amount to the resort's GCash, then upload your receipt. Your date is held while our staff check the payment; your booking is confirmed only when we email you."],
    ["Rescheduling", `Free, once, if you ask at least ${days(RESCHEDULE_NOTICE_DAYS)} before your visit. The new date must be free.`],
    ["Emergencies", "Illness, injury or a death in the family: contact the resort, even on the day. With proof, your date is moved at no charge."],
    ["Quiet hours and the events venue", quietHours],
  ];
}
