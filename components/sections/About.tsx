"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { GuestCapBadge } from "@/components/common/GuestCapBadge";
import { Icon, type IconName } from "@/components/common/Icon";
import { Reveal, REVEAL_STEP } from "@/components/common/Reveal";
// The owner's phone and email from Rates & Settings, not a typed-in copy.
import { RESORT_CONTACT, SLOTS, QUIET_HOURS_START, venueCloseText, slotFor } from "@/lib/resort";
import {
  RESCHEDULE_NOTICE_DAYS, GUESTS_MAX, VENUE_CAPACITY,
  sharedRateFor, exclusiveRateFor, childRateFor, EVENT_VENUE_RATE, OVERTIME_RATE, OVERTIME_MAX, MAX_STAY_DAYS,
} from "@/lib/validators";
import { useApp } from "@/contexts/AppContext";
import { fmt } from "@/lib/utils";
import { facilityIcon } from "@/lib/facilityUsage";
import { CHILD_FREE_AGE } from "@/lib/children";
import type { PublicAmenity } from "@/types/facility";
import "./About.css";

/** Where the resort is. The footer prints the same line. */
const ADDRESS = "22 Yakal cor. Ipil St. Doña Justa Village Phase, 2nd St, Angono, Rizal";

interface AboutProps {
  setPage: (p: string) => void;
  /** The photo beside "Find us". Comes from the admin's gallery rather than
   *  a hard-coded URL, so the resort can change it without a deploy. */
  photo?: string;
  onBookWithDate?: (date: string) => void;
  checkDate?: string | null;
}

export function About({
  setPage,
  photo,
}: AboutProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  // Policies and questions: one answer open at a time. Opening another
  // closes the last; tapping the open one closes it.
  const [openQ, setOpenQ] = useState<number | null>(null);
  // Rooms and their own rates, for the rates section.
  const { rooms } = useApp();
  // The amenities from Facility Management, as on the home page.
  const [amenities, setAmenities] = useState<PublicAmenity[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/amenities")
      .then((res) => (res.ok ? res.json() : null))
      // The events venue is a paid add-on (its own card above), not included.
      .then((j) => { if (live && j?.success && Array.isArray(j.amenities)) setAmenities((j.amenities as PublicAmenity[]).filter((a) => !/venue/i.test(a.name))); })
      .catch(() => { /* the section just stays hidden */ });
    return () => { live = false; };
  }, []);

  // Built at render, so the numbers follow Rates & Settings (the notice
  // days) and lib/resort (the hours) -- the same rules the guest agrees to
  // on Book Now (lib/policies.ts).
  const notice = `${RESCHEDULE_NOTICE_DAYS} day${RESCHEDULE_NOTICE_DAYS === 1 ? "" : "s"}`;
  const stay = SLOTS.WholeDay;
  const facts: { icon: IconName; label: string; value: string; href?: string }[] = [
    { icon: "pin", label: "Address", value: ADDRESS },
    { icon: "clock", label: "Hours", value: `${SLOTS.Day.label} ${SLOTS.Day.start} – ${SLOTS.Day.end} · ${SLOTS.Night.label} ${SLOTS.Night.start} – ${SLOTS.Night.end} · Events venue until ${venueCloseText()}` },
    { icon: "phone", label: "Call or text", value: RESORT_CONTACT.phone, href: `tel:${RESORT_CONTACT.phone.replace(/[^\d+]/g, "")}` },
    { icon: "mail", label: "Email", value: RESORT_CONTACT.email, href: `mailto:${RESORT_CONTACT.email}` },
  ];
  const faqs: { q: string; a: string }[] = [
    { q: "How much do I pay to book?", a: "Half of the total, paid online by QR Ph — scan the code with GCash, Maya or any e-wallet that accepts QR Ph. The other half is paid when you arrive. You can also pay the full amount at once." },
    { q: "What if I need to cancel?", a: `If you cancel, payments are not refunded — but you can move your booking to another free date once, at no charge, if you ask at least ${notice} before your visit.` },
    { q: "What if the resort has to cancel?", a: "You choose: a free new date, or a full refund. The same goes for a PAGASA storm signal or a travel restriction. The resort contacts you." },
    { q: "Do I have to sleep over for a stay of several days?", a: `A booking of more than one date is a ${stay.label}: the resort stays yours from ${stay.start} on the first day until ${stay.end} after the last night.` },
    { q: "Are there quiet hours?", a: `Music, videoke and speakers go off at ${QUIET_HOURS_START} so our neighbours can rest. The events venue closes at ${venueCloseText()}: a venue-only booking ends then, and a group that also booked the pool moves to the pool until the Night Tour ends.` },
    { q: "How many guests can we bring?", a: `Up to ${GUESTS_MAX} with the pool, which is what the pool area holds. An event in the venue only, without the pool, can have up to ${VENUE_CAPACITY}.` },
  ];


  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      
{/*  HERO SECTION (CINEMATIC + GLOW)  */}
<div
  style={{
    position: "relative",
    height: mob ? 320 : 460,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 24px",
  }}
>
  {/* BACKGROUND BASE */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: isDark
        ? "radial-gradient(circle at 50% 30%, rgba(201,168,76,0.12), transparent 60%), #121212"
        : "radial-gradient(circle at 50% 30%, rgba(201,168,76,0.18), transparent 60%), #f5efe6",
      transition: "all .6s ease",
    }}
  />

  {/* FLOATING GOLD ORBS */}
  <div
    style={{
      position: "absolute",
      width: 420,
      height: 420,
      borderRadius: "50%",
      top: "-20%",
      left: "20%",
      background:
        "radial-gradient(circle, rgba(201,168,76,0.25), transparent 70%)",
      filter: "blur(60px)",
      animation: "floatOrb1 18s ease-in-out infinite",
    }}
  />

  <div
    style={{
      position: "absolute",
      width: 380,
      height: 380,
      borderRadius: "50%",
      bottom: "-25%",
      right: "10%",
      background:
        "radial-gradient(circle, rgba(201,168,76,0.18), transparent 70%)",
      filter: "blur(70px)",
      animation: "floatOrb2 22s ease-in-out infinite",
    }}
  />

  {/* SOFT OVERLAY */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: isDark
        ? "linear-gradient(to top, rgba(5,4,3,0.85), transparent 60%)"
        : "linear-gradient(to top, rgba(255,255,255,0.6), transparent 60%)",
    }}
  />

  {/* CONTENT */}
  <div
    style={{
      position: "relative",
      zIndex: 2,
      textAlign: "center",
      maxWidth: 720,
    }}
  >
    {/* TAG */}
    <div
      style={{
        letterSpacing: 4,
        fontSize: 12.5,
        color: C.goldInk,
        marginBottom: 16,
        opacity: 0.8,
      }}
    >
      OUR STORY
    </div>

    {/* TITLE */}
<h1
  style={{
    fontFamily: "'Satoshi',system-ui,sans-serif",
    fontSize: mob ? 38 : 60,
    fontWeight: 400,
    lineHeight: 1.1,
    marginBottom: 12,
    color: isDark ? "#f8f4ee" : "#1f1f1f",
    // No overflow:hidden here. It was presumably meant to mask the 20px
    // slide-up, but it clips horizontally too, and the italic "d" of
    // StoneWood leans past its inline-block advance width — so the final
    // letter was sliced off vertically at the h1's right edge.
  }}
>
  {/* ABOUT (fade + slide) */}
<span
  style={{
    display: "inline-block",
    opacity: 0,
    transform: "translateY(20px)",
    animation: "fadeSlideUp 0.8s ease forwards",
  }}
>
  About{" "}
</span>

{/* STONEWOOD (gold shimmer reveal) */}
<span
  style={{
    display: "inline-block",
    marginLeft: "12px",
    fontStyle: "italic",
    // An italic glyph's ink extends past its advance width. With
    // background-clip:text the gradient is painted only inside this
    // element's box, so without a little room on the right the lean of the
    // final "d" gets no paint even once the parent stops clipping it.
    paddingRight: "0.14em",
    background:
      "linear-gradient(120deg, #c9a84c 0%, #e8c97a 40%, #fff3c4 50%, #c9a84c 60%, #c9a84c 100%)",
    backgroundSize: "200% auto",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    opacity: 0,
    transform: "translateY(20px)",
    animation:
      "fadeSlideUp 0.8s ease forwards 0.25s, shimmer 2.5s linear 1s infinite",
  }}
>
  Stonewood Garden
</span>
</h1>

    {/* SUB LINE */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 12,
      }}
    >
      <div
        style={{
          width: 40,
          height: 1,
          background: `linear-gradient(to right,transparent,${gold})`,
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: gold,
          boxShadow: `0 0 12px ${gold}`,
        }}
      />
      <div
        style={{
          width: 40,
          height: 1,
          background: `linear-gradient(to left,transparent,${gold})`,
        }}
      />
    </div>
  </div>

  {/* ANIMATIONS */}
  <style>{`
    @keyframes floatOrb1 {
      0% { transform: translateY(0px) translateX(0px); }
      50% { transform: translateY(30px) translateX(20px); }
      100% { transform: translateY(0px) translateX(0px); }
    }

    @keyframes floatOrb2 {
      0% { transform: translateY(0px) translateX(0px); }
      50% { transform: translateY(-25px) translateX(-15px); }
      100% { transform: translateY(0px) translateX(0px); }
    }
  `}</style>
</div>

      {/* ABOUT — the story on the left, the resort's facts in a card on
          the right; under them, the booking rules as questions. */}
      <section className="sw-about">
        <div className="sw-about__top">
          <Reveal>
            <div>
              <p className="sw-about__eyebrow" style={{ color: C.goldInk }}>ABOUT STONEWOOD GARDEN</p>
              <h2 className="sw-about__title" style={{ color: C.textH }}>A family-run private resort in Angono, Rizal.</h2>
              <p className="sw-about__lead" style={{ color: C.textS }}>
                Stonewood Garden Private Resort is nestled in the heart of Angono, Rizal —
                a sanctuary where nature and privacy come together.
              </p>
              <p className="sw-about__lead" style={{ color: C.textS }}>
                Enjoy private pools, BBQ areas, billiards, videoke, and serene
                surroundings designed for unforgettable experiences.
              </p>
            </div>
          </Reveal>

          <Reveal delay={REVEAL_STEP}>
            <ul className="sw-about__facts" style={{ background: C.bgCard, borderColor: C.border }}>
              {facts.map((f) => {
                const body = (
                  <>
                    <span className="sw-about__ficon" style={{ color: C.goldInk }}><Icon name={f.icon} size={18} strokeWidth={1.6} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="sw-about__flabel" style={{ color: C.textH }}>{f.label}</span>
                      <span className="sw-about__fvalue" style={{ color: C.textS }}>{f.value}</span>
                    </span>
                  </>
                );
                return (
                  <li key={f.label} style={{ borderColor: C.border }}>
                    {f.href ? <a href={f.href} className="sw-about__frow">{body}</a> : <div className="sw-about__frow">{body}</div>}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <div className="sw-about__faq">
          <Reveal>
            <div>
              <h3 className="sw-about__faqtitle" style={{ color: C.textH }}>Policies and questions</h3>
              <p className="sw-about__faqsub" style={{ color: C.textS }}>The same rules you agree to when you book.</p>
            </div>
          </Reveal>
          <Reveal delay={REVEAL_STEP}>
            <div className="sw-about__acc" style={{ background: C.bgCard, borderColor: C.border }}>
              {faqs.map((f, i) => {
                const open = openQ === i;
                return (
                  <div key={f.q} className={`sw-about__item${open ? " is-open" : ""}`} style={{ borderColor: C.border }}>
                    <button
                      type="button"
                      className="sw-about__q"
                      aria-expanded={open}
                      aria-controls={`sw-faq-${i}`}
                      onClick={() => setOpenQ(open ? null : i)}
                      style={{ color: C.textH }}
                    >
                      <span>{f.q}</span>
                      <Icon name="chevron-down" size={18} className="sw-about__chev" />
                    </button>
                    <div id={`sw-faq-${i}`} className="sw-about__a" role="region" aria-hidden={!open}>
                      <div><p style={{ color: C.textB }}>{f.a}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>

        {/* RATES — every price comes from Rates & Settings and the rooms
            the owner set up, so this always matches what Book Now charges. */}
        <div className="sw-about__rates">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h3 className="sw-about__faqtitle" style={{ color: C.textH, fontSize: mob ? 24 : 28 }}>Rates</h3>
              <p className="sw-about__faqsub" style={{ color: C.textS }}>
                What each tour costs. Book with a 50% deposit; the rest is paid at the resort.
              </p>
            </div>
          </Reveal>
          <div className="sw-about__rategrid">
            {(["Day", "Night", "WholeDay"] as const).map((id, i) => {
              const stay = id === "WholeDay";
              const kid = childRateFor(id);
              return (
                <Reveal key={id} delay={i * REVEAL_STEP}>
                  <div className="sw-about__ratecard" style={{ background: C.bgCard, borderColor: C.border }}>
                    <p className="sw-about__ratename" style={{ color: C.goldInk }}>{SLOTS[id].label}</p>
                    <p className="sw-about__ratehours" style={{ color: C.textB }}>
                      <Icon name="clock" size={15} style={{ color: C.goldInk }} />{slotFor(id).hours}{stay ? ` · up to ${MAX_STAY_DAYS} days` : ""}
                    </p>
                    {!stay && (
                      <div className="sw-about__ratebox" style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#ffffff", borderColor: C.border }}>
                        <span className="sw-about__ratelabel" style={{ color: C.goldInk }}>Shared pool</span>
                        <span className="sw-about__price" style={{ color: C.textH }}>{fmt(sharedRateFor(id))}<small style={{ color: C.textS }}> / guest</small></span>
                        <span className="sw-about__ratenote" style={{ color: C.textB }}>
                          Children {CHILD_FREE_AGE} years old and below: {kid > 0 ? `${fmt(kid)} each` : "free"}. Up to {GUESTS_MAX} guests share the pool.
                        </span>
                      </div>
                    )}
                    <div className="sw-about__ratebox" style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#ffffff", borderColor: C.border }}>
                      <span className="sw-about__ratelabel" style={{ color: C.goldInk }}>Exclusive pool</span>
                      <span className="sw-about__price" style={{ color: C.textH }}>{fmt(exclusiveRateFor(id))}<small style={{ color: C.textS }}>{stay ? " / day" : " flat"}</small></span>
                      <span className="sw-about__ratenote" style={{ color: C.textB }}>
                        The pool and resort are your group&rsquo;s alone, up to {GUESTS_MAX} guests. Children {CHILD_FREE_AGE} years old and below are free.
                      </span>
                    </div>
                    {id === "Day" && OVERTIME_MAX > 0 && (
                      <p className="sw-about__ratenote" style={{ color: C.textS, margin: "4px 2px 0" }}>
                        Overtime: {fmt(OVERTIME_RATE)} an hour, up to {OVERTIME_MAX} hours, when no Night group is booked.
                      </p>
                    )}
                    {stay && (
                      <p className="sw-about__ratenote" style={{ color: C.textS, margin: "4px 2px 0" }}>
                        A Staycation is Exclusive only: day and night with no break between tours.
                      </p>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Add-ons: the events venue and the rooms. */}
          <div className="sw-about__rategrid sw-about__rategrid--two" style={{ marginTop: 16 }}>
            <Reveal>
              <div className="sw-about__ratecard" style={{ background: C.bgCard, borderColor: C.border }}>
                <p className="sw-about__ratename" style={{ color: C.goldInk }}>Events venue</p>
                <p className="sw-about__ratehours" style={{ color: C.textB }}><Icon name="clock" size={15} style={{ color: C.goldInk }} />Open until {venueCloseText()} on a Night Tour or Staycation</p>
                <div className="sw-about__ratebox" style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#ffffff", borderColor: C.border }}>
                  <span className="sw-about__ratelabel" style={{ color: C.goldInk }}>Per tour</span>
                  <span className="sw-about__price" style={{ color: C.textH }}>{fmt(EVENT_VENUE_RATE)}</span>
                  <span className="sw-about__ratenote" style={{ color: C.textB }}>
                    One event at a time, up to {VENUE_CAPACITY} guests. Book it on its own, or with the resort and pool. A Staycation pays it for both tours.
                  </span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={REVEAL_STEP}>
              <div className="sw-about__ratecard" style={{ background: C.bgCard, borderColor: C.border }}>
                <p className="sw-about__ratename" style={{ color: C.goldInk }}>Rooms</p>
                <p className="sw-about__ratehours" style={{ color: C.textB }}><Icon name="bed" size={15} style={{ color: C.goldInk }} />An add-on to any tour, priced per tour (twice for a Staycation)</p>
                {rooms.length === 0 ? (
                  <p className="sw-about__ratenote" style={{ color: C.textS }}>Room rates are shown when you book.</p>
                ) : (
                  <ul className="sw-about__roomlist">
                    {rooms.map((rm) => (
                      <li key={rm.id} style={{ borderColor: C.border }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", color: C.textH, fontSize: 15.5, fontWeight: 600 }}>{rm.name}</span>
                          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", marginTop: 4, color: C.textS, fontSize: 13.5 }}>{rm.beds} <GuestCapBadge n={rm.capacity} size={12} /></span>
                        </span>
                        <span style={{ color: C.textH, fontSize: 19, fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(rm.price)}<small style={{ color: C.textS, fontSize: 13, fontWeight: 400 }}> / tour</small></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Reveal>
          </div>

          {/* What every tour with the pool includes: the amenities the owner
              lists in Facility Management. */}
          {amenities.length > 0 && (
            <Reveal>
              <div className="sw-about__ratecard" style={{ background: C.bgCard, borderColor: C.border, marginTop: 16, height: "auto" }}>
                <p className="sw-about__ratename" style={{ color: C.goldInk }}>Included with your tour</p>
                <p className="sw-about__ratehours" style={{ color: C.textB }}><Icon name="check-circle" size={15} style={{ color: C.goldInk }} />Free to use on every Day Tour, Night Tour and Staycation with the resort &amp; pool</p>
                <ul className="sw-about__amen">
                  {amenities.map((a) => (
                    <li key={a.id} style={{ borderColor: C.border, background: isDark ? "rgba(255,255,255,0.03)" : "#ffffff", opacity: a.underMaintenance ? 0.6 : 1 }}>
                      <span aria-hidden="true" className="sw-about__amenico" style={{ background: `${gold}1f`, color: C.goldInk }}>
                        <Icon name={facilityIcon({ icon: a.icon, category: "Amenity" })} size={19} strokeWidth={1.9} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", color: C.textH, fontSize: 15, fontWeight: 600 }}>{a.name}</span>
                        {a.underMaintenance
                          ? <span style={{ display: "block", color: C.textS, fontSize: 13, marginTop: 2 }}>Under maintenance for now</span>
                          : a.description && <span style={{ display: "block", color: C.textB, fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{a.description}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}

          <Reveal>
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button type="button" className="sw-btn" onClick={() => setPage("Book Now")} style={{ ...goldBtn, padding: "14px 32px" }}>
                CHECK A DATE
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FIND US — photo on one side, the address and a way to act on the
          other. Full-bleed: the image runs to the edge of the viewport, so
          this is deliberately outside the page's centred column. */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: mob ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)",
          alignItems: "stretch",
          margin: mob ? "0 0 48px" : "0 0 72px",
          background: C.bgCard,
        }}
      >
        <div style={{ position: "relative", minHeight: mob ? 260 : 520, overflow: "hidden", background: C.bgCard2 }}>
          {photo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              loading="lazy"
              decoding="async"
              src={photo}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: mob ? "36px 24px" : "56px 64px",
          }}
        >
          <p style={{ color: C.goldInk, fontSize: 11, letterSpacing: 2.6, fontWeight: 700, margin: "0 0 20px" }}>
            FIND US
          </p>
          <h2
            style={{
              color: C.textH,
              fontFamily: "'Satoshi',system-ui,sans-serif",
              fontSize: mob ? 28 : 40,
              fontWeight: 400,
              margin: "0 0 20px",
              lineHeight: 1.15,
            }}
          >
            Stonewood Garden<br />Private Resort
          </h2>
          <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.8, margin: "0 0 20px", maxWidth: 420 }}>
            {ADDRESS}
          </p>
          {/* The map, in the card beside the photo. */}
          <iframe
            title="Stonewood Garden Private Resort on Google Maps"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3247.696684191124!2d121.16214595325307!3d14.531465178389032!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c6d1d76ebad3%3A0x23993af9734ba069!2sStonewood%20Garden%20Private%20Pool!5e0!3m2!1sen!2sph!4v1776880886519!5m2!1sen!2sph"
            width="100%"
            height={mob ? 220 : 260}
            style={{ border: 0, borderRadius: 14, margin: "0 0 24px", display: "block", filter: isDark ? "grayscale(0.2) brightness(0.85)" : "none" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <button
            onClick={() => setPage("Book Now")}
            className="sw-btn"
            style={{ ...goldBtn, alignSelf: "flex-start", fontFamily: "inherit" }}
          >
            PLAN YOUR VISIT
          </button>
        </div>
      </section>

    </div>
  );
}