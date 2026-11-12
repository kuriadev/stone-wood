"use client";

import { useHeroMedia } from "@/hooks/useHeroMedia";
import type { HeroMedia } from "@/lib/heroMedia";
import { useState, useEffect, useMemo, useRef } from "react";
import { useWidth } from "@/hooks/useWidth";
import { THEME_COLORS } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { HERO_BG } from "@/lib/constants";
import { automaticHomeCards } from "@/lib/homeCards";
import { useHomeCards } from "@/hooks/useHomeCards";
import { TiltedCard } from "@/components/common/TiltedCard";
import { PackagesSkeleton } from "@/components/common/PageSkeletons";
import { SLOTS, QUIET_HOURS_START, venueCloseText } from "@/lib/resort";
import { RESCHEDULE_NOTICE_DAYS } from "@/lib/validators";
import { HeroReservation } from "@/components/sections/HeroReservation";
import { PackageTierScroll } from "@/components/sections/PackageTierScroll";
import type { Booking, BookingResource, BookingSlot, BookingTier, PackageDeepLink } from "@/types/booking";
import type { ResortPackage } from "@/types/package";
import { imageAt } from "@/lib/img";
import { Icon } from "@/components/common/Icon";
import { facilityIcon } from "@/lib/facilityUsage";
import type { PublicAmenity } from "@/types/facility";
import { Reveal } from "@/components/common/Reveal";
import { RoomCoverflow } from "@/components/sections/RoomCoverflow";
import { FacilityLightbox, type FacilityShot } from "@/components/sections/FacilityLightbox";
import { defaultFacilityPhoto } from "@/lib/facilityPhotos";
import type { Room } from "@/types/room";
import { LazyBackground } from "@/components/common/LazyBackground";

interface HomeProps {
  setPage: (p: string) => void;
  /** The hero staff set, as the server read it (app/page.tsx). */
  initialHero?: HeroMedia | null;
  /** Shown as a coverflow deck. Empty while the first fetch is in flight, and
   *  the whole section is skipped then rather than rendering an empty deck. */
  rooms: Room[];
  onBookWithDate: (d: string, opts?: { slot?: BookingSlot; guests?: number; children?: number; endDate?: string; tier?: BookingTier }) => void;
  bookings: Booking[];
  closedDates: string[];
  /** True while that package list is still on its first fetch and nothing
   *  real has arrived yet. The grid shows placeholders instead of the
   *  hardcoded seed packages: a price on screen has to be one the admin
   *  actually set, not a constant that happens to ship in the bundle. */
  packagesLoading?: boolean;
  /** Admin-editable package list (see the admin Packages tab) — the single
   *  source of truth for what's shown here and what a "BOOK PACKAGE" click
   *  carries into Book Now. Only `active` packages are rendered. */
  packages: ResortPackage[];
  /** Deep-link a package straight into Book Now with its price, capacity
   *  and resource/tier pre-selected — a package is a fixed, one-time
   *  purchase, so Book Now only asks for a date once it arrives
   *  this way. Falls back to a plain "Book Now" navigation when not
   *  provided (e.g. the legacy SPA shell). */
  onBookPackage?: (pkg: PackageDeepLink, resource: BookingResource, tier: BookingTier) => void;
}

// HERO_BG lives in lib/constants.ts so the root layout can preload it.

// Resort services — rendered as a clean line-icon row.
//
// The list itself comes from Facility Management (/api/amenities), so an
// amenity the owner adds shows up here. These hand-drawn icons are kept for
// the original amenities, matched by name, and the list below is what shows
// while that request is in flight or if it fails.
const SERVICES: { name: string; icon: React.ReactNode }[] = [
  {
    name: "Swimming Pool",
    icon: (
      <>
        <path d="M2 17c1.8 0 1.8 1.4 3.6 1.4S7.4 17 9.2 17s1.8 1.4 3.6 1.4S14.6 17 16.4 17s1.8 1.4 3.6 1.4" />
        <path d="M2 12.6c1.8 0 1.8 1.4 3.6 1.4s1.8-1.4 3.6-1.4 1.8 1.4 3.6 1.4 1.8-1.4 3.6-1.4 1.8 1.4 3.6 1.4" />
        <path d="M8 13V5a2 2 0 0 1 4 0" />
        <path d="M16 13V5a2 2 0 0 0-4 0" />
      </>
    ),
  },
  {
    name: "BBQ / Grilling Area",
    icon: (
      <>
        <path d="M5 4h14l-1.6 7.5a6 6 0 0 1-11.8 0z" />
        <path d="M9.5 15.5 8 21" />
        <path d="M14.5 15.5 16 21" />
        <path d="M9 21h6" />
      </>
    ),
  },
  {
    name: "Billiards",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.4" />
      </>
    ),
  },
  {
    name: "Videoke",
    icon: (
      <>
        {/* A handheld karaoke mic (not a studio mic). */}
        <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" />
        <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5" />
        <circle cx="16" cy="7" r="5" />
      </>
    ),
  },
  {
    name: "Parking Area",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
      </>
    ),
  },
  {
    name: "Air-Conditioned Rooms",
    icon: (
      <>
        <rect x="2.5" y="4.5" width="19" height="9" rx="2.5" />
        <path d="M6 9h12" />
        <path d="M7 17.5v2" />
        <path d="M12 17.5v3" />
        <path d="M17 17.5v2" />
      </>
    ),
  },
];

// Wide resort shot — used as the 4B (full resort) cover.
const RESORT_WIDE = "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop";

// Day, Night and Whole Day — times from lib/resort.ts, the one place the
// resort's hours are set.
const DURATIONS = ([[SLOTS.Day, "sun"], [SLOTS.Night, "moon"], [SLOTS.WholeDay, "staycation"]] as const)
  .map(([s, icon]) => ({ label: s.label, window: s.hours, icon }));

// Packages themselves now come from the admin-editable `packages` prop (see
// types/package.ts and the admin Packages tab) — grouping them by Shared vs
// Exclusive for display happens inside the component below, since it needs
// that prop.

/* Real Google reviews of Stonewood Garden Private Pool, transcribed verbatim.
 * Nothing here is written for the site: if a quote reads plainly, that is how
 * the guest wrote it.
 *
 * Only reviews that carry TEXT are usable here. Several of the resort's
 * Google reviews are a star rating and nothing else, which is a number, not a
 * testimonial, so they are not in this list.
 *
 * `rating` is the reviewer's own star count, not a curated one -- see the
 * three-star entry. To add more, copy the name, stars and text exactly as
 * Google shows them; do not paraphrase and do not complete a truncated
 * sentence. */
/** How fast the testimonial strip travels, in pixels per second. Held
 *  constant so the strip reads at the same speed on a phone and on a wide
 *  desktop; the duration is derived from it and the track's real width. */
const MARQUEE_PX_PER_SEC = 23;

const MARQUEE_REVIEWS = [
  { name: "koadeal koadeal", rating: 5, when: "7 years ago", message: "Nice and cozy place for Family bonding and gatherings.." },
  { name: "Teresita Fajardo", rating: 5, when: "8 years ago", message: "A nice place with warm and kind owners." },
  { name: "Christian David Falcutila", rating: 3, when: "8 years ago", message: "Perfect place for Family bonding / Birthday celebration." },
];

export function Home({ setPage, initialHero, onBookWithDate, bookings, closedDates, packages, packagesLoading = false, onBookPackage, rooms }: HomeProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const C = THEME_COLORS;
  // The "Tours & Room Add-ons" cards: the ones staff saved, else the
  // automatic ones built from Rates & Settings and the real rooms.
  const savedRateCards = useHomeCards().cards;
  const rateCardsShown = savedRateCards ?? automaticHomeCards(rooms);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;
  /* One vertical rhythm for every band below the hero. Each band used to
     carry its own padding (88, 104 or 112px, plus 44-64px under its
     heading), so the empty space between one section's last line and the
     next heading ran from 187 to 297px on desktop -- a screen of nothing
     between sections. Now every gap is the same, about 144px on desktop and
     96px on a phone: room to tell sections apart without scrolling past
     blank space. */
  const bandY = mob ? 48 : 72;
  const bandPad = (x: number | string) => `${bandY}px ${typeof x === "number" ? `${x}px` : x}`;
  const headGap = mob ? 32 : 44;

  // Hidden (inactive) packages never reach the customer — the same array
  // index is reused by openPkg()/pkgCardRefs, so it's built once here off
  // the visible list only.
  const visiblePackages = packages.filter((p) => p.active);
  // ── Shared type scale ──────────────────────────────────────────────
  // Larger, higher-contrast display type that holds up in both themes.
  const serif = "'Satoshi',system-ui,sans-serif";
  const eyebrow: React.CSSProperties = {
    color: C.goldInk,
    fontSize: 13.5,
    letterSpacing: 4.5,
    fontWeight: 500,
    textTransform: "uppercase",
    marginBottom: 16,
  };
  const h2: React.CSSProperties = {
    fontFamily: serif,
    fontSize: mob ? 34 : tab ? 44 : 54,
    lineHeight: 1.12,
    color: C.textH,
    fontWeight: 400,
    letterSpacing: "-0.5px",
    margin: 0,
  };
  const lede: React.CSSProperties = {
    color: C.textS,
    fontSize: mob ? 15 : 16,
    lineHeight: 1.9,
    fontWeight: 300,
  };
  /* The strip holds two identical sets and slides exactly one set's width.
     That is only seamless while a set is at least as wide as the screen --
     with three real reviews a set is about 1,040px, which covers a phone but
     falls half a screen short on a desktop, and the shortfall showed as the
     blank gap before the loop restarted. Repeat the reviews until one set
     covers the viewport with a card to spare, and derive the duration from
     the result so a longer strip does not scroll proportionally faster. */
  const marquee = useMemo(() => {
    const stride = (mob ? 280 : 330) + 16;
    const setWidth = MARQUEE_REVIEWS.length * stride;
    const copies = Math.max(1, Math.ceil((w + stride) / setWidth));
    return {
      cards: Array.from({ length: copies }, () => MARQUEE_REVIEWS).flat(),
      seconds: Math.round((setWidth * copies) / MARQUEE_PX_PER_SEC),
    };
  }, [w, mob]);

  // Amenities the owner manages in Facility Management. null until loaded.
  const [amenities, setAmenities] = useState<PublicAmenity[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/amenities")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.success && Array.isArray(j.amenities)) setAmenities(j.amenities); })
      .catch(() => { /* keep the built-in list */ });
    return () => { live = false; };
  }, []);
  const facilityRow = useMemo(() => {
    const drawn = new Map(SERVICES.map((sv) => [sv.name, sv.icon]));
    return amenities && amenities.length > 0
      ? amenities.map((a) => ({ name: a.name, desc: a.description, drawn: drawn.get(a.name), icon: facilityIcon({ icon: a.icon, category: "Amenity" }), closed: !!a.underMaintenance, photo: a.photo || defaultFacilityPhoto(a.name) }))
      : SERVICES.map((sv) => ({ name: sv.name, desc: "", drawn: sv.icon, icon: "toolbox" as const, closed: false, photo: defaultFacilityPhoto(sv.name) }));
  }, [amenities]);
  // The facility opened from its tile (FacilityLightbox). Kept after
  // closing so the card can animate back to the tile it came from.
  const [facShot, setFacShot] = useState<FacilityShot | null>(null);
  const [facOpen, setFacOpen] = useState(false);
  // The hero background staff chose (Website Photos), or the built-in one.
  const { media: heroMedia } = useHeroMedia(initialHero);
  // The closing band's photo, set in Website Photos (built-in until then).
  const { media: closingMedia, loaded: closingLoaded } = useHeroMedia(undefined, "closing");

  /* Every 6 seconds one facility, picked at random (never the same twice
     running), lights up for a moment -- a hint that the tiles open. Done
     on the DOM, not in state, so Home doesn't re-render for it. Only
     while the row is on screen and the tab is visible, and never while
     someone is hovering the row or has a photo open. */
  const facRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = facRowRef.current;
    if (!row) return;
    let visible = false;
    let last = -1;
    let clear = 0;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.4 });
    io.observe(row);
    const tick = window.setInterval(() => {
      if (!visible || document.hidden || row.matches(":hover") || document.querySelector(".sw-facbox")) return;
      const tiles = row.querySelectorAll<HTMLElement>(".sw-fac");
      if (tiles.length === 0) return;
      let i = Math.floor(Math.random() * tiles.length);
      if (tiles.length > 1 && i === last) i = (i + 1 + Math.floor(Math.random() * (tiles.length - 1))) % tiles.length;
      last = i;
      const tile = tiles[i];
      tile.classList.remove("is-beckon");
      void tile.offsetWidth; // restart the animation
      tile.classList.add("is-beckon");
      clearTimeout(clear);
      clear = window.setTimeout(() => tile.classList.remove("is-beckon"), 2600);
    }, 6000);
    return () => { io.disconnect(); clearInterval(tick); clearTimeout(clear); };
  }, []);


  // The reservation card stays folded away until asked for, so the hero
  // photo shows. `resSettled` lets the card's shadow out once it has opened
  // (the fold clips it while it moves).
  const [resOpen, setResOpen] = useState(false);
  const [resSettled, setResSettled] = useState(false);
  const resRef = useRef<HTMLDivElement>(null);
  const toggleRes = () => {
    setResSettled(false);
    setResOpen((o) => {
      if (!o) setTimeout(() => resRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      return !o;
    });
  };

  // Scroll reveals are per-element now: each block that fades in is a
  // <Reveal> (components/common/Reveal.tsx), which owns its own viewport
  // trigger through Motion. The global IntersectionObserver that used to do
  // this, and the data-attribute it set to dodge hydration mismatches, are
  // both gone.

  return (
    <main id="main" style={{ background: C.bg }}>

      {/* ── HERO — real photo background, calendar always visible ── */}
      <div
        style={{
          position: "relative",
          minHeight: mob ? "auto" : "100vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: mob ? "40px 20px 40px" : "48px 40px 56px",
        }}
      >
        {/* Photo background.
            This is the LCP element, and it was requesting w=2400 on every
            device — roughly six times the pixels a 390px phone can show.
            The two custom properties below feed a media query in globals.css
            (.sw-hero-photo), so a phone fetches the 1000px crop and only
            large screens pay for the full-size one. A CSS background cannot
            use srcset, and it cannot be lazy-loaded either — so it is
            preloaded in layout.tsx instead, which pulls LCP earlier. */}
        <div
          className="sw-hero-photo"
          style={{
            position: "absolute",
            inset: 0,
            ["--hero-sm" as string]: `url(${imageAt(heroMedia?.kind === "image" ? heroMedia.src : HERO_BG, 1000)})`,
            ["--hero-lg" as string]: `url(${imageAt(heroMedia?.kind === "image" ? heroMedia.src : HERO_BG, 1920)})`,
            backgroundSize: "cover",
            backgroundPosition: "center 60%",
          }}
        />
        {/* A video staff chose in Website Photos plays over the photo,
            silently and on a loop; the photo shows until it can play. */}
        {heroMedia?.kind === "video" && (
          <video
            key={heroMedia.src}
            src={heroMedia.src}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            className="sw-hero-video"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {/* Legibility overlay — same gold-tinted dark tone as the rest of the design system */}
        <div style={{ position: "absolute", inset: 0, background: "var(--sw-hero-veil)" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%,transparent 40%,rgba(0,0,0,0.35) 100%)" }} />

        {/* Heading */}
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 720, width: "100%", marginTop: mob ? 8 : 24 }}>
          <h1
            className="hero-title sw-hero-title"
            style={{ fontFamily: serif, fontSize: mob ? 44 : tab ? 64 : 82, color: "#fff", lineHeight: 1.04, margin: "0 0 24px", fontWeight: 400, letterSpacing: "-1px", textShadow: "0 2px 30px rgba(0,0,0,0.45)" }}
          >
            Where Stone<br />
            <span className="sw-hero-gold-text" style={{ fontStyle: "italic" }}>Meets the Woods</span>
          </h1>

          <p className="hero-sub" style={{ color: "rgba(246,241,232,0.94)", fontSize: mob ? 16 : 18, maxWidth: 520, margin: "0 auto", lineHeight: 1.8, fontWeight: 300, textShadow: "0 1px 16px rgba(0,0,0,0.4)" }}>
            A private pool resort in Angono, Rizal. Swim by day or night, share the pool or keep it all to your group.
          </p>
        </div>

        {/* ── Inline booking panel — see HeroReservation.tsx.
             The calendar alone used to be the whole interaction; the card now
             also carries visit type and guest count, so /book opens with all
             three set instead of just the date. ── */}
        {/* Folded until the button opens it; pressing again folds it. */}
        <button
          type="button"
          className={resOpen ? "sw-btn-out sw-res-toggle" : "sw-btn sw-res-toggle"}
          onClick={toggleRes}
          aria-expanded={resOpen}
          aria-controls="sw-reservation"
          style={{
            ...(resOpen
              ? { background: "rgba(10,8,5,0.45)", color: "#f2ede4", border: "1px solid rgba(201,168,76,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }
              : goldBtn),
            position: "relative", zIndex: 3,
            marginTop: mob ? 28 : 36,
            minHeight: 48, padding: mob ? "0 24px" : "0 30px", borderRadius: 999,
            display: "inline-flex", alignItems: "center", gap: 10,
            fontSize: 13, fontWeight: 700, letterSpacing: "1.6px", cursor: "pointer",
          }}
        >
          <Icon name={resOpen ? "x" : "calendar"} size={16} />
          {resOpen ? "HIDE RESERVATION" : "CHECK AVAILABILITY"}
        </button>
        <div
          id="sw-reservation"
          ref={resRef}
          className={`sw-res-fold${resOpen ? " is-open" : ""}`}
          onTransitionEnd={(e) => { if (e.target === e.currentTarget && resOpen) setResSettled(true); }}
          style={{ scrollMarginTop: 88 }}
        >
          <div className="sw-res-fold__inner" style={{ overflow: resSettled && resOpen ? "visible" : "hidden" }} inert={!resOpen}>
            <HeroReservation
              bookings={bookings}
              closedDates={closedDates}
              onBookWithDate={onBookWithDate}
              onBrowseRooms={() => setPage("Rooms")}
              onManageBooking={() => setPage("Manage Booking")}
            />
          </div>
        </div>

        {/* Amenity pills */}
      </div>

      {/* ── PACKAGES — click a card to expand it at centre screen ── */}
      {/* sw-defer: rendered (and its images fetched) only as it nears the
          screen. See app/globals.css. Hero and testimonials are left out on
          purpose — one is on screen at load, the other measures itself. */}
      <div className="sw-defer" style={{ background: "var(--sw-band-cream)", padding: bandPad(mob ? 20 : 24), borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>

          <Reveal style={{ textAlign: "center", marginBottom: headGap }}>
            <p style={eyebrow}>Packages</p>
            <h2 className="sw-section-title" style={{ ...h2, marginBottom: 16 }}>
              Choose Your Stay
            </h2>
            <p style={{ ...lede, maxWidth: 520, margin: "0 auto" }}>
              A swim day, a party, or both? Pick the package that fits your group: the pool, the events venue, or the two together.
            </p>
          </Reveal>

          {/* Duration windows — Day, Night and Staycation. A light row of
              three, each with its icon, rather than three heavy boxes: it
              introduces the packages below instead of competing with them. */}
          <Reveal
            style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(3,minmax(0,1fr))", gap: mob ? 10 : 0, maxWidth: mob ? "100%" : 1020, margin: `0 auto ${mob ? 28 : 56}px` }}
          >
            {DURATIONS.map((d, i) => (
              <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: mob ? "flex-start" : "center", padding: mob ? "14px 16px" : "6px 20px", borderLeft: !mob && i > 0 ? `1px solid ${C.border}` : undefined, border: mob ? `1px solid ${C.border}` : undefined, borderRadius: mob ? 12 : undefined }}>
                <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", color: C.goldInk, background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.28)" }}>
                  <Icon name={d.icon} size={18} strokeWidth={1.6} />
                </span>
                <span style={{ minWidth: 0, textAlign: "left" }}>
                  <span style={{ display: "block", color: C.textXS, fontSize: 11, letterSpacing: 2.5, marginBottom: 4 }}>{d.label.toUpperCase()}</span>
                  <span style={{ display: "block", color: C.goldInk, fontSize: mob ? 14.5 : 15, fontWeight: 500, letterSpacing: 0.2, whiteSpace: "nowrap" }}>{d.window}</span>
                </span>
              </div>
            ))}
          </Reveal>

          {/* Package cards — see components/sections/PackageShowcase.tsx.
              Lifted out of this file: it carries a tier switcher, a carousel,
              a full package card and a gallery lightbox, which is more than
              belongs inline in the page shell. */}
          {packagesLoading ? (
            <PackagesSkeleton page={false} />
          ) : (
            /* Wide screens: the wheel and the card, turned by the page
               scroll (as on the Packages page). Phones: the tabs. */
            <PackageTierScroll
              packages={visiblePackages}
              onBookPackage={onBookPackage}
              onFallbackBook={() => setPage("Book Now")}
            />
          )}

        </div>
      </div>


      {/* ── RATES & FACILITIES (unchanged) ── */}
      <div className="sw-defer" style={{ background: "var(--sw-band-ivory)", padding: bandPad(mob ? 20 : 24), borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
          <Reveal>
            <p style={eyebrow}>What&rsquo;s Included</p>
            <h2 className="sw-section-title" style={{ ...h2, marginBottom: 16 }}>Stays &amp; Room Add-ons</h2>
            <p style={{ ...lede, maxWidth: 520, margin: `0 auto ${headGap}px` }}>Base pricing before package configuration. Every reservation starts here.</p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(230px, 1fr))", gap: 20, marginBottom: 48, maxWidth: 1100, margin: "0 auto 48px" }}>
            {rateCardsShown.map((p, i) => (
              /* React Bits' TiltedCard: each card tilts toward the cursor,
                 catches a glare across its face and edge, and lifts on a
                 soft shadow; on a phone it follows the finger while pressed.
                 It rises into place when it scrolls into view, a beat after
                 the card before it, which is what Reveal used to do here.
                 imageHeight="auto" sizes it to its text and fills the grid
                 cell, so a row keeps one height. */
              <TiltedCard
                key={p.id}
                imageHeight="auto"
                containerWidth="100%"
                rotateAmplitude={9}
                scaleOnHover={1.03}
                glare={0.35}
                glareColor="#f0d97a"
                shadow={0.45}
                radius={12}
                showTooltip={false}
                introDelay={i * 90}
                faceStyle={{ background: C.bgCard2, border: `1px solid ${C.border}`, boxShadow: C.shadowCard }}
              >
                <div style={{ padding: mob ? "24px 20px" : "28px 24px", textAlign: "left", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
                  <div style={{ marginBottom: 12, color: C.goldInk }}><Icon name={p.icon} size={28} strokeWidth={1.5} /></div>
                  <h3 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, marginBottom: 8 }}>{p.title}</h3>
                  {p.description && <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 16, lineHeight: 1.6 }}>{p.description}</p>}
                  {p.price && (
                    <div style={{ color: C.goldInk, fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
                      {p.price}{p.unit && <span style={{ color: C.textXS, fontSize: 13.5 }}> {p.unit}</span>}
                    </div>
                  )}
                  {p.details.map((d) => (
                    <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <Icon name="check" size={12} style={{ color: C.goldInk, marginTop: 4, flexShrink: 0 }} />
                      <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.5 }}>{d}</span>
                    </div>
                  ))}
                  {p.button && (
                    <button className="sw-btn" onClick={() => setPage(p.button!.link)} style={{ ...goldBtn, marginTop: "auto", width: "100%" }}>
                      {p.button.link === "Rooms" && <Icon name="bed" size={15} />} {p.button.label}
                      <Icon name="arrow-right" size={13} />
                    </button>
                  )}
                </div>
              </TiltedCard>
            ))}

          </div>

          {/* The booking rules as short cards instead of one paragraph. */}
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, textAlign: "left" }}>
            {([
              ["wallet", "50% down by GCash", "Or pay in full. Send it to our GCash; the rest is paid at the resort."],
              ["receipt", "Send your proof of payment", "Upload your GCash receipt when you book. Our staff check the payment, then email you to confirm your booking."],
              ["calendar-clock", "Move your date once", `Free, if you ask at least ${RESCHEDULE_NOTICE_DAYS} day${RESCHEDULE_NOTICE_DAYS === 1 ? "" : "s"} before your visit. Cancelling isn't refunded.`],
              ["shield-alert", "If the resort cancels", "You choose a free new date or a full refund."],
              ["moon", `Quiet from ${QUIET_HOURS_START}`, `Music, videoke and speakers off. The events venue closes at ${venueCloseText()}.`],
            ] as const).map(([icon, title, text]) => (
              <li key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.bgCard }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: `${gold}1f`, color: C.goldInk }}>
                  <Icon name={icon} size={16} strokeWidth={1.75} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: C.textH, fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</span>
                  <span style={{ display: "block", color: C.textS, fontSize: 12.5, lineHeight: 1.5 }}>{text}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* Times, parking, outside food, payment and cancelling: the
              questions guests ask before booking (About → FAQ). */}
          <p style={{ margin: "18px 0 0", textAlign: "center" }}>
            <a href="/about#faq" className="sw-ulink" style={{ color: C.goldInk, fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="info" size={15} /> Questions about check-in, parking or food? Read the FAQ <Icon name="arrow-right" size={13} />
            </a>
          </p>
        </div>
      </div>

      {/* ── WHERE YOU'LL STAY — the rooms as a coverflow deck ── */}
      {rooms.length > 0 && (
        <div className="sw-defer" style={{ background: C.bg, padding: bandPad(mob ? 20 : 24), overflow: "hidden" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <Reveal style={{ textAlign: "center", marginBottom: headGap }}>
              <p style={eyebrow}>Accommodations</p>
              <h2 style={h2}>Where You&rsquo;ll Stay</h2>
            </Reveal>

            <Reveal>
              <RoomCoverflow
                rooms={rooms}
                onSelect={(r) => {
                  // The Rooms page opens on this room (RoomsPage reads it once).
                  try { sessionStorage.setItem("sw_room_focus", String(r.id)); } catch { /* private mode: lands at the top */ }
                  setPage("Rooms");
                }}
                ctaLabel="VIEW ROOMS"
              />
            </Reveal>
          </div>
        </div>
      )}

      {/* ── OUR SERVICES — clean line-icon row ── */}
      <div className="sw-defer" style={{ background: "var(--sw-band-services)", padding: bandPad(mob ? 20 : 24) }}>
        <div ref={facRowRef} style={{ maxWidth: 1100, margin: "0 auto" }}>

          <Reveal style={{ textAlign: "center", marginBottom: headGap }}>
            <p style={eyebrow}>Our Services</p>
            <h2 style={h2}>Resort Facilities</h2>
          </Reveal>

          <Reveal
            style={{
              display: "grid",
              gridTemplateColumns: mob ? "repeat(2,1fr)" : tab ? "repeat(3,1fr)" : `repeat(${Math.min(6, facilityRow.length)},1fr)`,
              gap: mob ? "36px 16px" : 20,
            }}
          >
            {facilityRow.map((s) => (
              /* Under Maintenance in Facility Management: dimmed and labelled,
                 so a guest knows before booking (the pool and the venue
                 can't be booked while it lasts). */
              <button
                key={s.name}
                type="button"
                className="sw-fac"
                aria-haspopup="dialog"
                /* Start loading the photo as soon as a finger or the pointer
                   reaches the tile, so it's ready the moment the pop-up opens. */
                onPointerEnter={() => { const im = new Image(); im.decoding = "async"; im.src = s.photo; }}
                onPointerDown={() => { const im = new Image(); im.src = s.photo; }}
                onClick={() => {
                  setFacShot({ name: s.name, desc: s.desc, photo: s.photo, closed: s.closed, origin: null });
                  setFacOpen(true);
                }}
              >
                <span className="sw-fac__icon" style={{ color: C.textH, opacity: s.closed ? 0.35 : 0.85 }}>
                  {s.drawn ? (
                    <svg
                      width="38"
                      height="38"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ display: "block" }}
                      aria-hidden="true"
                    >
                      {s.drawn}
                    </svg>
                  ) : (
                    <Icon name={s.icon} size={38} strokeWidth={1.1} style={{ display: "block" }} />
                  )}
                </span>
                <div className="sw-fac__name" style={{ fontFamily: serif, fontSize: mob ? 16 : 18, color: C.textH, fontWeight: 400, lineHeight: 1.35 }}>
                  {s.name}
                </div>
                {s.desc && <div style={{ color: C.textS, fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>{s.desc}</div>}
                {s.closed && (
                  <div style={{ display: "inline-block", marginTop: 12, padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(224,122,58,0.5)", color: "var(--sw-accent-copper)", fontSize: 11.5, whiteSpace: "nowrap" }}>
                    Under maintenance
                  </div>
                )}
                <div><span className="sw-fac__hint">View <Icon name="arrow-right" size={12} /></span></div>
              </button>
            ))}
          </Reveal>
          <FacilityLightbox shot={facShot} open={facOpen} onOpenChange={setFacOpen} />
        </div>
      </div>

      {/* ── TESTIMONIALS — infinite marquee (unchanged) ── */}
      <div style={{ background: "var(--sw-band-sand)", padding: bandPad(0), overflow: "hidden" }}>
        <Reveal style={{ textAlign: "center", marginBottom: headGap, padding: "0 20px" }}>
          <p style={eyebrow}>Testimonials</p>
          <h2 style={h2}>What Our Guests Say</h2>
        </Reveal>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right,var(--sw-band-sand),transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to left,var(--sw-band-sand),transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div className="sw-marquee-track" style={{ animationDuration: `${marquee.seconds}s` }}>
            {[...marquee.cards, ...marquee.cards].map((r, i) => (
              <div key={i} style={{ flexShrink: 0, width: mob ? 280 : 330, marginRight: 16, background: "var(--sw-review-card)", border: `1px solid var(--sw-review-border)`, borderRadius: 12, padding: "28px 24px", boxShadow: "var(--sw-review-shadow)" }}>
                <div aria-label={`${r.rating} out of 5 stars`} style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Icon key={n} name="star" size={14} filled={n <= r.rating} style={{ color: n <= r.rating ? C.goldInk : C.border }} />
                  ))}
                </div>
                <p style={{ color: C.textB, fontSize: 16, lineHeight: 1.85, margin: "0 0 16px", fontStyle: "italic", fontFamily: serif }}>&ldquo;{r.message}&rdquo;</p>
                <span style={{ display: "block", color: C.goldInk, fontSize: 13.5, fontWeight: 600, letterSpacing: 0.5 }}>— {r.name}</span>
                <span style={{ display: "block", color: C.textS, fontSize: 12, marginTop: 4 }}>Google review &middot; {r.when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CLOSING CTA — gives the most engaged visitor somewhere to go ── */}
      <div className="sw-defer"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: bandPad(mob ? 20 : 24),
          textAlign: "center",
        }}
      >
        {/* The last section on the page: fetched as it is scrolled toward,
            not at load. */}
        {/* The stock photo only once we know none was set, so a refresh
            doesn't flash it before the resort's own. */}
        {(closingMedia?.kind === "image" || closingLoaded) && <LazyBackground src={closingMedia?.kind === "image" ? closingMedia.src : RESORT_WIDE} style={{ position: "absolute", inset: 0, backgroundSize: "cover", backgroundPosition: "center" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(6,5,3,0.82),rgba(6,5,3,0.9))" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}66,transparent)` }} />

        <Reveal style={{ position: "relative", zIndex: 2, maxWidth: 620, margin: "0 auto" }}>
          <p style={{ ...eyebrow, marginBottom: 20 }}>Angono, Rizal</p>
          <h2 style={{ ...h2, color: "#fff", marginBottom: 20 }}>
            Your day at<br />Stonewood Garden
          </h2>
          <p style={{ color: "rgba(238,232,220,0.78)", fontSize: mob ? 15 : 17, lineHeight: 1.85, fontWeight: 300, marginBottom: 36 }}>
            Check an open date and reserve in a few minutes.
          </p>
          <button
            className="sw-btn"
            onClick={() => setPage("Book Now")}
            style={{ ...goldBtn, padding: mob ? "16px 32px" : "16px 40px" }}
          >
            BOOK YOUR STAY
          </button>
        </Reveal>
      </div>
    </main>
  );
}