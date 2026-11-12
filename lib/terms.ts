// ── Stonewood's Terms and Privacy Policy
//
// What a guest agrees to before paying (Book Now's "Before you continue").
// Written from the rules the system actually enforces, and built from the
// live values (Rates & Settings, lib/resort.ts), so the text never states a
// rate, an hour or a limit the booking flow doesn't use. Pure: a function,
// so it reads the current settings each time it is shown.

import { SLOTS, QUIET_HOURS_START, venueCloseText, RESORT_CONTACT, LATE_BOOKING_GRACE_HOURS } from "@/lib/resort";
import {
  RESCHEDULE_NOTICE_DAYS, GUESTS_MAX, VENUE_CAPACITY, OVERTIME_MAX, OVERTIME_RATE, MAX_STAY_DAYS,
  sharedRateFor, childRateFor, exclusiveRateFor, EVENT_VENUE_RATE,
} from "@/lib/validators";
import { HOLD_HOURS, NO_SHOW_CHOICE_DAYS } from "@/lib/rebooking";
import { DETAILS_COOLDOWN_HOURS } from "@/lib/guestDetails";
import { CHILD_FREE_AGE, CHILDREN_TOTAL_MAX } from "@/lib/children";
import { DELETE_AFTER_MONTHS } from "@/lib/retention";
import { fmt } from "@/lib/utils";

export const RESORT_NAME = "Stonewood Garden Private Resort";
export const RESORT_ADDRESS = "22 Yakal cor. Ipil St. Doña Justa Village Phase, 2nd St, Angono, Rizal";
export const TERMS_UPDATED = "November 2026";

/** One numbered section: a heading, then paragraphs and/or a list. */
export interface TermsSection { title: string; paras?: string[]; list?: string[] }
export interface TermsDoc { title: string; sections: TermsSection[] }

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function termsDocs(): TermsDoc[] {
  const contact = `${RESORT_CONTACT.email}, ${RESORT_CONTACT.phone} (call or text) or Viber ${RESORT_CONTACT.viber}`;
  return [
    {
      title: "Terms and Conditions",
      sections: [
        {
          title: "Reservations and payment",
          paras: [
            "A booking is made online at this website or at the front desk. Online, you confirm your email with a 6-digit code, send the amount due to the resort's GCash (scan our QR code or use our GCash number), and upload a clear photo or screenshot of your receipt as proof of payment. Your date is held while our staff check that the payment arrived in our GCash; your booking is confirmed only when we email you the confirmation. A receipt we can't verify is turned down, and you can send a new one.",
            "You can pay a 50% deposit or the full total. Any balance is paid at the resort before check-out, in cash or by GCash. Keep your booking reference: you need it, with your email, to manage your booking.",
            `Today's stay can be booked online until ${LATE_BOOKING_GRACE_HOURS} hours after it starts. A late booking still ends at the usual time and costs the same.`,
          ],
        },
        {
          title: "Tours, rates and guests",
          list: [
            `${SLOTS.Day.label}: ${SLOTS.Day.start} – ${SLOTS.Day.end}. ${SLOTS.Night.label}: ${SLOTS.Night.start} – ${SLOTS.Night.end} the next morning. ${SLOTS.WholeDay.label}: day and night together, up to ${days(MAX_STAY_DAYS)} in a row.`,
            `Shared pool: ${fmt(sharedRateFor("Day"))} per guest for a Day Stay and ${fmt(sharedRateFor("Night"))} for a Night Stay, shared with other groups, up to ${GUESTS_MAX} guests in total. Children ${CHILD_FREE_AGE} years old and below pay ${fmt(childRateFor("Day"))} each and count toward the ${GUESTS_MAX}.`,
            `Private pool: ${fmt(exclusiveRateFor("Day"))} flat for a Day Stay, ${fmt(exclusiveRateFor("Night"))} for a Night Stay and ${fmt(exclusiveRateFor("WholeDay"))} a day for a Staycation, up to ${GUESTS_MAX} guests. Children ${CHILD_FREE_AGE} years old and below are free and not counted. A Staycation is Exclusive only.`,
            `Events venue: ${fmt(EVENT_VENUE_RATE)} per stay, one event at a time, up to ${VENUE_CAPACITY} guests. It closes at ${venueCloseText()}.`,
            "Rooms are an add-on, priced per stay (twice for a Staycation). Without a room there are no beds; your group uses the pool and the resort's open areas.",
            `However many groups are booked, the resort holds no more than ${CHILDREN_TOTAL_MAX} people at once.`,
            "The price shown in your booking summary is what is charged. Package prices are set by the resort and may differ from the rates above.",
          ],
        },
        {
          title: "Changes on the day",
          paras: [
            `Extra guests who arrive are added at the front desk at the per-guest rate, for each stay and day. Day Stay overtime is ${fmt(OVERTIME_RATE)} an hour, up to ${OVERTIME_MAX} hours, only when no Night group is booked. A room or the events venue can be added if they are free. These are paid at the resort.`,
            "Damage found at the check-out inspection is charged at the resort's damage rates and added to your bill.",
          ],
        },
        {
          title: "Moving your date",
          paras: [
            `You can move your booking to another free date once, at no charge, from Manage booking, if you ask at least ${days(RESCHEDULE_NOTICE_DAYS)} before your visit. Everything you paid carries over. The new date is held for ${HOLD_HOURS} hours while the resort approves it; until then your booking stays on its original date.`,
            `Within ${days(RESCHEDULE_NOTICE_DAYS)} of your visit, the booking can't be moved or cancelled online. A second change, or a change of guests or package, is arranged with the resort and depends on availability.`,
          ],
        },
        {
          title: "Cancellation and refunds",
          list: [
            "If you cancel, payments are not refunded.",
            "If the resort has to cancel (a storm signal or travel restriction, a repair, a power or water outage, safety), you choose a free new date or a full refund. A refund is arranged with you by call or chat.",
            `Emergencies: if illness, injury or a death in the family stops you coming, send the resort what happened with proof (for example a medical certificate) from Manage booking, even on the day. If it's approved, your booking moves to a free date at no charge.`,
            `No-show: if your group doesn't come and doesn't tell the resort, the booking is closed and payments are kept. The day after, we email you a link to choose a new date within ${days(NO_SHOW_CHOICE_DAYS)}.`,
          ],
        },
        {
          title: "Your details",
          paras: [
            `You can change the name, email and mobile number on your booking from Manage booking, once every ${DETAILS_COOLDOWN_HOURS} hours. A confirmation goes to the old and the new email. The date, guests and package are changed only as described above.`,
          ],
        },
        {
          title: "Stay rules",
          list: [
            `Quiet hours start at ${QUIET_HOURS_START}: music, videoke and speakers off.`,
            "Children must be watched by an adult at all times, especially near the pool.",
            "Follow staff instructions, don't swim while drunk, and report any hazard or emergency to staff right away.",
            "Keep your belongings with you. Report anything lost or damaged to the front desk.",
            "Nothing in these terms removes rights you have under Philippine law.",
          ],
        },
        {
          title: "Contact",
          paras: [`${RESORT_NAME}, ${RESORT_ADDRESS}. Email ${contact}.`],
        },
      ],
    },
    {
      title: "Privacy Policy",
      sections: [
        {
          title: "What we collect",
          list: [
            "Your name, email address and mobile number.",
            "Your booking: dates, stay, guests and children, rooms, package, notes and its history.",
            "Payments: amounts, method, the GCash reference number and the receipt you upload as proof of payment (seen only by resort staff). We never see or keep your e-wallet login, PIN or card number.",
            "Messages you send us, and any proof you attach to an emergency request.",
            "A record of changes made to your booking, and which staff member made them.",
          ],
        },
        {
          title: "Why we use it",
          paras: [
            "To take and confirm your booking, check availability, receive and record payments, send confirmations, reminders and replies by email, prepare the resort for your group, keep our accounts, and stop misuse. We don't use your details for marketing, and we don't sell or rent them.",
          ],
        },
        {
          title: "Who can see it",
          paras: [
            "Only resort staff, each seeing what their role needs (owner, front desk, caretaker). The services that run the website handle data for us: our database and hosting providers, and Gmail to send emails. Payments go straight to the resort's own GCash; no payment company handles them. We share information when the law requires it.",
          ],
        },
        {
          title: "How long we keep it",
          paras: [
            `Finished bookings are archived after a while. When the owner turns on deletion, archived bookings whose stay ended over ${DELETE_AFTER_MONTHS} months ago are deleted with the guest details on them. Payment records are kept for our accounts, without your name.`,
          ],
        },
        {
          title: "Security and cookies",
          paras: [
            "Staff sign in with their own accounts, and your booking opens only with its reference plus a code sent to your email, or the link we emailed you. We use a sign-in cookie for staff, and your browser stores small preferences such as the light or dark theme. No system is perfectly secure, but we take reasonable care.",
          ],
        },
        {
          title: "Your rights",
          paras: [
            `Under the Data Privacy Act of 2012 you can ask what we hold about you, correct it, object to its use, or ask us to delete it where the law allows. You can also complain to the National Privacy Commission. Contact us at ${contact}.`,
          ],
        },
      ],
    },
  ];
}
