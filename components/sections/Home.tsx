"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { PACKAGES, HERO_BG } from "@/lib/constants";
import { CardGridSkeleton } from "@/components/common/Skeleton";
import { SLOTS, QUIET_HOURS_POLICY } from "@/lib/resort";
import { SHARED_PER_HEAD_RATE, EXCLUSIVE_FLAT_RATE, EXCLUSIVE_DISCOUNT_PCT } from "@/lib/validators";
import { fmt } from "@/lib/utils";
import { HeroReservation } from "@/components/sections/HeroReservation";
import { MediaGallery } from "@/components/common/MediaGallery";
import { PackageShowcase } from "@/components/sections/PackageShowcase";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Booking, BookingResource, BookingSlot, BookingTier, PackageDeepLink } from "@/types/booking";
import type { ResortPackage } from "@/types/package";
import { srcSetFor, SIZES, imageAt } from "@/lib/img";
import { Icon, type IconName } from "@/components/common/Icon";
import { facilityIcon } from "@/lib/facilityUsage";
import type { PublicAmenity } from "@/types/facility";
import { Reveal } from "@/components/common/Reveal";
import { Badge } from "@/components/ui/badge";

interface HomeProps {
  setPage: (p: string) => void;
  onBookWithDate: (d: string, opts?: { slot?: BookingSlot; guests?: number }) => void;
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
        <rect x="9" y="2.5" width="6" height="11" rx="3" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
        <path d="M12 18v3.5" />
        <path d="M8.5 21.5h7" />
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
const DURATIONS = [SLOTS.Day, SLOTS.Night, SLOTS.WholeDay].map((s) => ({ label: s.label, window: s.hours }));

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

export function Home({ setPage, onBookWithDate, bookings, closedDates, packages, packagesLoading = false, onBookPackage }: HomeProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  // Hidden (inactive) packages never reach the customer — the same array
  // index is reused by openPkg()/pkgCardRefs, so it's built once here off
  // the visible list only.
  const visiblePackages = packages.filter((p) => p.active);
  // Grouped by what the guest is planning, not by tier: a pool visit for
  // the day or night, a whole-day buyout, or an event with the venue.
  // Which package group is on screen. The three groups used to stack, each
  // with its own carousel, so the section was three rows tall before a guest
  // had chosen anything. One row, switched by tabs, keeps it to one.
  const [pkgGroup, setPkgGroup] = useState("DAY OR NIGHT");

  const groupOf = (p: ResortPackage) =>
    p.resource !== "Pool" ? "EVENTS & CELEBRATIONS" : p.slotMode === "WholeDay" ? "WHOLE DAY" : "DAY OR NIGHT";
  const packageGroups = ["DAY OR NIGHT", "WHOLE DAY", "EVENTS & CELEBRATIONS"]
    .map((label) => ({
      label,
      tiers: visiblePackages.map((p, i) => ({ p, i })).filter(({ p }) => groupOf(p) === label),
    }))
    .filter((g) => g.tiers.length > 0);

  // Packages arrive async, so the remembered tab can name a group that has no
  // packages yet (or none any more). Fall back to the first that does rather
  // than render an empty row.
  const activeGroup =
    packageGroups.find((g) => g.label === pkgGroup) ?? packageGroups[0];

  // ── Shared type scale ──────────────────────────────────────────────
  // Larger, higher-contrast display type that holds up in both themes.
  const serif = "'Satoshi',system-ui,sans-serif";
  const eyebrow: React.CSSProperties = {
    color: C.goldInk,
    fontSize: 13.5,
    letterSpacing: 4.5,
    fontWeight: 500,
    textTransform: "uppercase",
    marginBottom: 14,
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

  const [activePkg, setActivePkg] = useState<number | null>(null);
  // Which photo of the expanded package's gallery is showing.
  const [photoIdx, setPhotoIdx] = useState(0);

  const openPkg = (i: number) => {
    setActivePkg(i);
    setPhotoIdx(0);
  };
  // Closing is immediate: the dialog animates itself out off `data-state`, so
  // the old "hide, then unmount 220ms later" pair would only postpone the
  // exit animation rather than produce one.
  const closePkg = () => setActivePkg(null);

  // Arrow keys page through the gallery. Escape is deliberately NOT handled
  // here any more — the dialog closes itself on Escape, and doing both ran
  // closePkg twice for one keypress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activePkg === null) return;
      const len = visiblePackages[activePkg].gallery.length;
      if (e.key === "ArrowRight") setPhotoIdx((n) => (n + 1) % len);
      if (e.key === "ArrowLeft") setPhotoIdx((n) => (n - 1 + len) % len);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePkg]);

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
      ? amenities.map((a) => ({ name: a.name, desc: a.description, drawn: drawn.get(a.name), icon: facilityIcon({ icon: a.icon, category: "Amenity" }) }))
      : SERVICES.map((sv) => ({ name: sv.name, desc: "", drawn: sv.icon, icon: "toolbox" as const }));
  }, [amenities]);

  const ratesHeaderRef = useRef<HTMLDivElement>(null);
  const amenitiesDivRef = useRef<HTMLDivElement>(null);
  const testimonyHeaderRef = useRef<HTMLDivElement>(null);
  const packageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const amenityRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pkgHeaderRef = useRef<HTMLDivElement>(null);
  const pkgDurationRef = useRef<HTMLDivElement>(null);
  const pkgCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closingRef = useRef<HTMLDivElement>(null);

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
            ["--hero-sm" as string]: `url(${imageAt(HERO_BG, 1000)})`,
            ["--hero-lg" as string]: `url(${HERO_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center 60%",
          }}
        />
        {/* Legibility overlay — same gold-tinted dark tone as the rest of the design system */}
        <div style={{ position: "absolute", inset: 0, background: isDark ? "linear-gradient(180deg,rgba(6,5,3,0.72) 0%,rgba(6,5,3,0.45) 35%,rgba(6,5,3,0.6) 70%,rgba(4,3,2,0.92) 100%)" : "linear-gradient(180deg,rgba(10,7,3,0.62) 0%,rgba(10,7,3,0.38) 35%,rgba(10,7,3,0.55) 70%,rgba(8,6,3,0.88) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%,transparent 40%,rgba(0,0,0,0.35) 100%)" }} />

        {/* Gold accent lines — unchanged from the existing system */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent 0%,${gold}88 30%,${gold} 50%,${gold}88 70%,transparent 100%)` }} />

        {/* Heading */}
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 720, width: "100%", marginTop: mob ? 8 : 24 }}>
          <h1
            className="hero-title sw-hero-title"
            style={{ fontFamily: serif, fontSize: mob ? 44 : tab ? 64 : 82, color: "#fff", lineHeight: 1.04, margin: "0 0 22px", fontWeight: 400, letterSpacing: "-1px", textShadow: "0 2px 30px rgba(0,0,0,0.45)" }}
          >
            Where Stone<br />
            <span className="sw-hero-gold-text" style={{ fontStyle: "italic" }}>Meets the Woods</span>
          </h1>

          <p className="hero-sub" style={{ color: "rgba(246,241,232,0.94)", fontSize: mob ? 16 : 18, maxWidth: 520, margin: "0 auto", lineHeight: 1.8, fontWeight: 300, textShadow: "0 1px 16px rgba(0,0,0,0.4)" }}>
            An exclusive private resort experience crafted for those who seek luxury, privacy, and nature.
          </p>
        </div>

        {/* ── Inline booking panel — see HeroReservation.tsx.
             The calendar alone used to be the whole interaction; the card now
             also carries visit type and guest count, so /book opens with all
             three set instead of just the date. ── */}
        <HeroReservation
          bookings={bookings}
          closedDates={closedDates}
          onBookWithDate={onBookWithDate}
          onBrowseRooms={() => setPage("Rooms")}
          onManageBooking={() => setPage("Cancel Booking")}
        />

        {/* Amenity pills */}
      </div>

      {/* ── PACKAGES — click a card to expand it at centre screen ── */}
      <div style={{ background: isDark ? "#121212" : "#f7f2ea", padding: mob ? "52px 20px" : "88px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>

          <Reveal style={{ textAlign: "center", marginBottom: mob ? 32 : 44 }}>
            <p style={eyebrow}>Packages</p>
            <h2 className="sw-section-title" style={{ ...h2, marginBottom: 16 }}>
              Choose Your Stay
            </h2>
            <p style={{ ...lede, maxWidth: 520, margin: "0 auto" }}>
              A few real ways to book — pool only, the events venue, or both together. Select a package to see the full details.
            </p>
          </Reveal>

          {/* Duration windows — Day, Night and Whole Day. */}
          <Reveal
            style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,minmax(200px,300px))", justifyContent: "center", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: mob ? 28 : 40, maxWidth: mob ? "100%" : 903, marginLeft: "auto", marginRight: "auto" }}
          >
            {DURATIONS.map((d) => (
              <div key={d.label} style={{ background: C.bgCard2, padding: mob ? "18px 20px" : "22px 24px", textAlign: "center" }}>
                <div style={{ color: C.textXS, fontSize: 11, letterSpacing: 2.5, marginBottom: 7 }}>{d.label.toUpperCase()}</div>
                <div style={{ color: C.goldInk, fontSize: mob ? 15 : 16, fontWeight: 500, letterSpacing: 0.3 }}>{d.window}</div>
              </div>
            ))}
          </Reveal>

          {/* Package cards — see components/sections/PackageShowcase.tsx.
              Lifted out of this file: it carries a tier switcher, a carousel,
              a full package card and a gallery lightbox, which is more than
              belongs inline in the page shell. */}
          {packagesLoading ? (
            <CardGridSkeleton count={2} label="Loading packages" />
          ) : (
            <PackageShowcase
              packages={visiblePackages}
              onBookPackage={onBookPackage}
              onFallbackBook={() => setPage("Book Now")}
            />
          )}

        </div>
      </div>

      {/* ── Expanded package card ──
          Rendered through a portal directly into document.body instead of
          in place here. Previously this modal was a normal descendant of
          the page, and it kept breaking (needing a zoom-out, or opening cut
          off near the bottom of a short window) because SOME ancestor
          somewhere up the tree ends up with a non-"none" computed transform
          (page-entrance animations, hover effects, etc. all reach for
          `transform`) — and any one of those turns into the containing
          block for this modal's `position: fixed`, sizing and centering it
          against that ancestor's box instead of the actual viewport. A
          portal sidesteps the whole category of bug: this element's parent
          in the DOM is always <body> itself, no matter what the rest of the
          page's CSS is doing. The backdrop also now scrolls itself
          (instead of capping the card at 90vh with an inner scroll area),
          which is what actually keeps it usable in a short/small browser
          window like the one that triggered this. */}
      {/* Package detail, as a LANDSCAPE dialog: the gallery on the left and
          everything the guest actually decides on -- price, inclusions, which
          slot, the book button -- on the right, so both halves are on screen
          at once instead of the portrait card that scrolled for most of its
          height.

          Radix portals this itself, which is the job createPortal was doing
          here: any ancestor with a transform other than "none" becomes the
          containing block for a position:fixed child, which would size the
          modal against that box rather than the viewport. */}
      <Dialog open={activePkg !== null} onOpenChange={(open) => { if (!open) closePkg(); }}>
        {/* `min(...)` rather than a bare max-w-5xl: the sm: variant would else
            override the base max-w-[calc(100%-2rem)] gutter, and between about
            640px and 1024px the dialog went edge to edge with its rounded
            corners clipped off against the viewport. */}
                <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[min(64rem,calc(100%-2rem))]">
          {activePkg !== null && (() => {
            const p = visiblePackages[activePkg];
            const exclusive = p.status === "Exclusive";
            const gallery = p.gallery;
            // The dialog scrolls, not the individual columns: a grid item with
            // its own overflow contributes ~0 to row sizing, which left the two
            // columns disagreeing about the row height by a few pixels.
            // A JSX comment cannot sit directly after `return (` -- it would be
            // a second sibling and break the element.
            return (
              <div className="grid md:grid-cols-2">
                <MediaGallery
                  shots={gallery}
                  eyebrow="PACKAGE"
                  compact={mob}
                  title={
                    <DialogTitle asChild>
                      <div className="truncate font-serif text-[26px] leading-tight font-normal text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:text-3xl">
                        {p.title}
                      </div>
                    </DialogTitle>
                  }
                />

                {/* Detail column.
                    Left-aligned throughout: the previous version centred the
                    badge, price and blurb while the lists below ran left,
                    which broke the reading edge halfway down the panel.
                    One vertical rhythm (gap-5) instead of per-block margins,
                    and the action is pinned to the foot behind a divider so
                    it lands in the same place in every dialog. */}
                <div className="flex flex-col">
                  <div className="flex flex-col gap-5 p-6 sm:p-7">

                    {/* Status */}
                    <div>
                      <Badge
                        variant="outline"
                        className="rounded-full px-3 py-1 text-[10.5px] tracking-[2px]"
                        style={{
                          background: exclusive ? `${gold}18` : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                          color: exclusive ? C.goldInk : C.textS,
                          borderColor: exclusive ? `${gold}44` : C.border,
                        }}
                      >
                        {p.status.toUpperCase()}{p.note ? ` · ${p.note.toUpperCase()}` : ""}
                      </Badge>
                    </div>

                    {/* Price. A package is a one-time purchase, so this is the
                        whole tour/venue cost regardless of how many of the
                        included guests turn up. */}
                    <div>
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-serif text-[40px] leading-none font-normal text-foreground">{fmt(p.price)}</span>
                        {p.listPrice && (
                          <span className="text-[17px] text-faint line-through">{fmt(p.listPrice)}</span>
                        )}
                      </div>
                      {p.listPrice ? (
                        <p className="mt-1.5 text-[12.5px] tracking-wide text-[#4caf50]">
                          Bundle discount \u2014 you save {fmt(p.listPrice - p.price)}
                        </p>
                      ) : p.requiresRoom ? (
                        <p className="mt-1.5 text-[12.5px] text-faint">Plus a room of your choice, at a discounted rate</p>
                      ) : (
                        <p className="mt-1.5 text-[12.5px] text-faint">Flat price for up to {p.capacity} guests</p>
                      )}
                    </div>

                    <DialogDescription asChild>
                      <p className="text-[14.5px] leading-relaxed text-muted-foreground">{p.blurb}</p>
                    </DialogDescription>

                    {/* Inclusions */}
                    <div>
                      <p className="mb-3 text-[10.5px] tracking-[2.5px] text-faint">WHAT&apos;S INCLUDED</p>
                      <ul className="flex flex-col">
                        {p.includes.map((inc) => (
                          <li key={inc} className="flex items-start gap-2 border-b border-border-soft py-2.5 last:border-0 last:pb-0">
                            <Icon name="check" size={12} className="mt-1 shrink-0 text-accent-ink" />
                            <span className="text-[14.5px] leading-snug text-body">{inc}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* When it can be booked: Day or Night (guest picks), or
                        Whole Day. */}
                    <div>
                      <p className="mb-3 text-[10.5px] tracking-[2.5px] text-faint">
                        {p.slotMode === "WholeDay" ? "DURATION" : "CHOOSE WHEN YOU BOOK"}
                      </p>
                      <ul className="flex flex-col">
                        {(p.slotMode === "WholeDay" ? [SLOTS.WholeDay] : [SLOTS.Day, SLOTS.Night])
                          .map((sl) => ({ label: sl.label, window: sl.hours }))
                          .map((d) => (
                            <li key={d.label} className="flex items-center justify-between gap-3 border-b border-border-soft py-2.5 last:border-0 last:pb-0">
                              <span className="text-[14.5px] text-body">{d.label}</span>
                              <span className="text-[13.5px] font-medium text-accent-ink">{d.window}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>

                  {/* Action, pinned to the foot of the column. */}
                  <div className="mt-auto border-t border-border-soft p-6 pt-5 sm:px-7">
                    <Button
                      className="sw-btn h-auto w-full rounded-lg py-3.5 text-[13.5px] tracking-[1.5px]"
                      onClick={() => {
                        closePkg();
                        if (onBookPackage) {
                          onBookPackage(
                            { code: p.code, title: p.title, price: p.price, listPrice: p.listPrice, capacity: p.capacity, requiresRoom: p.requiresRoom, slotMode: p.slotMode },
                            p.resource,
                            p.status
                          );
                        } else {
                          setPage("Book Now");
                        }
                      }}
                      style={goldBtn}
                    >
                      BOOK {p.title.toUpperCase()} →
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── RATES & FACILITIES (unchanged) ── */}
      <div style={{ background: isDark ? "#121212" : "#fdf9f4", padding: mob ? "52px 20px" : "88px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
          <Reveal>
            <p style={eyebrow}>What&rsquo;s Included</p>
            <h2 className="sw-section-title" style={{ ...h2, marginBottom: 16 }}>Tours &amp; Room Add-ons</h2>
            <p style={{ ...lede, marginBottom: 52, maxWidth: 520, margin: "0 auto 52px" }}>Base pricing before package configuration. Every reservation starts here.</p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))", gap: 20, marginBottom: 48, maxWidth: 1100, margin: "0 auto 48px" }}>
            {PACKAGES.map((p, i) => (
              <Reveal key={p.id} className="sw-card"
                style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: mob ? "22px 18px" : "28px 24px", textAlign: "left", boxShadow: C.shadowCard, display: "flex", flexDirection: "column", transitionDelay: `${i * 100}ms` }}>
                <div style={{ marginBottom: 12, color: C.goldInk }}><Icon name={p.icon as IconName} size={28} strokeWidth={1.5} /></div>
                <h3 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, marginBottom: 6 }}>{p.label}</h3>
                <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 14, lineHeight: 1.6 }}>{p.desc}</p>
                <div style={{ color: C.goldInk, fontSize: 24, fontWeight: 700, marginBottom: 16 }}>{p.id === "wholeday" ? "" : "from "}{fmt(p.base)}<span style={{ color: C.textXS, fontSize: 13.5 }}> {p.unit}</span></div>
                {p.details.map((d) => (
                  <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                    <Icon name="check" size={12} style={{ color: C.goldInk, marginTop: 3, flexShrink: 0 }} />
                    <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.5 }}>{d}</span>
                  </div>
                ))}
                {p.id === "room" && (
                  <button className="sw-btn" onClick={() => setPage("Rooms")} style={{ ...goldBtn, marginTop: "auto", width: "100%" }}>
                    <Icon name="bed" size={15} /> VIEW ROOMS
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  </button>
                )}
              </Reveal>
            ))}

          </div>

          <p style={{ color: C.textXS, fontSize: 14.5, marginTop: 8, lineHeight: 1.8 }}>Pay a 50% down payment to book, or pay in full. If the resort has to cancel, you choose a free new date or a full refund; if you cancel, payments aren't refunded, but you can move your booking once. {QUIET_HOURS_POLICY}</p>
        </div>
      </div>

      {/* ── OUR SERVICES — clean line-icon row ── */}
      <div style={{ background: isDark ? "#0b0907" : "#ffffff", padding: mob ? "60px 20px" : "104px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          <Reveal style={{ textAlign: "center", marginBottom: mob ? 44 : 64 }}>
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
              <div key={s.name} style={{ textAlign: "center" }}>
                {s.drawn ? (
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textH}
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ margin: "0 auto 18px", display: "block", opacity: 0.85 }}
                    aria-hidden="true"
                  >
                    {s.drawn}
                  </svg>
                ) : (
                  <Icon name={s.icon} size={38} strokeWidth={1.1} style={{ margin: "0 auto 18px", display: "block", opacity: 0.85, color: C.textH }} />
                )}
                <div style={{ fontFamily: serif, fontSize: mob ? 16 : 18, color: C.textH, fontWeight: 400, lineHeight: 1.35 }}>
                  {s.name}
                </div>
                {s.desc && <div style={{ color: C.textS, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{s.desc}</div>}
              </div>
            ))}
          </Reveal>
        </div>
      </div>

      {/* ── TESTIMONIALS — infinite marquee (unchanged) ── */}
      <div style={{ background: isDark ? "#121212" : "#f5f0e8", padding: mob ? "52px 0" : "88px 0", overflow: "hidden" }}>
        <Reveal style={{ textAlign: "center", marginBottom: mob ? 44 : 60, padding: "0 20px" }}>
          <p style={eyebrow}>Testimonials</p>
          <h2 style={h2}>What Our Guests Say</h2>
        </Reveal>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right,${isDark ? "#121212" : "#f5f0e8"},transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to left,${isDark ? "#121212" : "#f5f0e8"},transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div className="sw-marquee-track" style={{ animationDuration: `${marquee.seconds}s` }}>
            {[...marquee.cards, ...marquee.cards].map((r, i) => (
              <div key={i} style={{ flexShrink: 0, width: mob ? 280 : 330, marginRight: 16, background: isDark ? "#1a1a1a" : "#fff", border: `1px solid ${isDark ? "rgba(201,168,76,0.1)" : "rgba(201,168,76,0.15)"}`, borderRadius: 12, padding: "26px 24px", boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.35)" : "0 4px 16px rgba(100,70,20,0.08)" }}>
                <div aria-label={`${r.rating} out of 5 stars`} style={{ display: "flex", gap: 3, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} aria-hidden="true" style={{ color: n <= r.rating ? gold : C.border, fontSize: 14, lineHeight: 1 }}>&#9733;</span>
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
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: mob ? "72px 20px" : "112px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${RESORT_WIDE})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(6,5,3,0.82),rgba(6,5,3,0.9))" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${gold}66,transparent)` }} />

        <Reveal style={{ position: "relative", zIndex: 2, maxWidth: 620, margin: "0 auto" }}>
          <p style={{ ...eyebrow, marginBottom: 18 }}>Angono, Rizal</p>
          <h2 style={{ ...h2, color: "#fff", marginBottom: 20 }}>
            The resort is yours<br />for the day
          </h2>
          <p style={{ color: "rgba(238,232,220,0.78)", fontSize: mob ? 15 : 17, lineHeight: 1.85, fontWeight: 300, marginBottom: 34 }}>
            Check an open date and reserve in a few minutes.
          </p>
          <button
            className="sw-btn"
            onClick={() => setPage("Book Now")}
            style={{ ...goldBtn, padding: mob ? "14px 30px" : "16px 40px" }}
          >
            BOOK YOUR STAY
          </button>
        </Reveal>
      </div>
    </main>
  );
}