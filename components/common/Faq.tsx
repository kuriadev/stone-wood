"use client";

/* The questions guests ask before booking (tester feedback, 2026-11-12):
 * times, parking, outside food, then payment and cancelling. Shown on About
 * (#faq) and on Home under Resort Facilities, so both say the same thing.
 *
 * Built at render, so the numbers follow Rates & Settings (the notice days,
 * the guest limits) and lib/resort (the hours): the same rules the guest
 * agrees to on Book Now (lib/policies.ts). */

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Icon } from "@/components/common/Icon";
import { Reveal, REVEAL_STEP } from "@/components/common/Reveal";
import { SLOTS, QUIET_HOURS_START, venueCloseText } from "@/lib/resort";
import { RESCHEDULE_NOTICE_DAYS, GUESTS_MAX, VENUE_CAPACITY } from "@/lib/validators";
import "./Faq.css";

export function faqItems(): { q: string; a: string }[] {
  const notice = `${RESCHEDULE_NOTICE_DAYS} day${RESCHEDULE_NOTICE_DAYS === 1 ? "" : "s"}`;
  const stay = SLOTS.WholeDay;
  return [
    { q: "What time is check-in and check-out?", a: `${SLOTS.Day.label}: check in from ${SLOTS.Day.start}, check out by ${SLOTS.Day.end}. ${SLOTS.Night.label}: check in from ${SLOTS.Night.start}, check out by ${SLOTS.Night.end} the next morning. ${stay.label}: from ${stay.start} on your first day until ${stay.end} after your last night.` },
    { q: "Is there parking?", a: "Yes. Free, secure parking is on-site for all guests, included with your booking." },
    { q: "Can we bring our own food and drinks?", a: "Yes, free of charge. You're welcome to bring your own food and drinks, and the BBQ / grilling area is yours to use. Please keep the resort clean and take your trash with you or use the bins." },
    { q: "How much do I pay to book?", a: "Half of the total, sent to the resort's GCash when you book (scan our QR or use our GCash number). Then upload a photo or screenshot of your receipt as proof of payment. Our staff check that the payment arrived before your booking is confirmed, and we email you once it is. The other half is paid when you arrive. You can also pay the full amount at once." },
    { q: "What if I need to cancel?", a: `If you cancel, payments are not refunded — but you can move your booking to another free date once, at no charge, if you ask at least ${notice} before your visit.` },
    { q: "What if the resort has to cancel?", a: "You choose: a free new date, or a full refund. The same goes for a PAGASA storm signal or a travel restriction. The resort contacts you." },
    { q: "Do I have to sleep over for a stay of several days?", a: `A booking of more than one date is a ${stay.label}: the resort stays yours from ${stay.start} on the first day until ${stay.end} after the last night.` },
    { q: "Are there quiet hours?", a: `Music, videoke and speakers go off at ${QUIET_HOURS_START} so our neighbours can rest. The events venue closes at ${venueCloseText()}: a venue-only booking ends then, and a group that also booked the pool moves to the pool until the Night Stay ends.` },
    { q: "How many guests can we bring?", a: `Up to ${GUESTS_MAX} with the pool, which is what the pool area holds. An event in the venue only, without the pool, can have up to ${VENUE_CAPACITY}.` },
  ];
}

/** The title, then the questions under it. `id` lets a link jump to it
 *  (About's is "faq", which Home's old link and Book Now point at). */
export function Faq({ id, className = "" }: { id?: string; className?: string }) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const [openQ, setOpenQ] = useState<number | null>(null);
  const faqs = faqItems();
  const key = id ?? "faq";
  return (
    <div className={`sw-faq ${className}`} id={id} style={{ scrollMarginTop: 96 }}>
      <Reveal>
        <h3 className="sw-faq__title" style={{ color: C.textH }}>Frequently asked questions</h3>
        <p className="sw-faq__sub" style={{ color: C.textS }}>Times, parking, food, payment and cancelling: the same rules you agree to when you book.</p>
      </Reveal>
      <Reveal delay={REVEAL_STEP}>
        <div className="sw-faq__acc" style={{ background: C.bgCard, borderColor: C.border }}>
          {faqs.map((f, i) => {
            const open = openQ === i;
            return (
              <div key={f.q} className={`sw-faq__item${open ? " is-open" : ""}`} style={{ borderColor: C.border }}>
                <button
                  type="button"
                  className="sw-faq__q"
                  aria-expanded={open}
                  aria-controls={`sw-${key}-${i}`}
                  onClick={() => setOpenQ(open ? null : i)}
                  style={{ color: C.textH }}
                >
                  <span>{f.q}</span>
                  <Icon name="chevron-down" size={18} className="sw-faq__chev" />
                </button>
                <div id={`sw-${key}-${i}`} className="sw-faq__a" role="region" aria-hidden={!open}>
                  <div><p style={{ color: C.textB }}>{f.a}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}
