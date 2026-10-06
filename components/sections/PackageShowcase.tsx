"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { Icon, type IconName } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResortPackage } from "@/types/package";
import { isEventPackage } from "@/lib/packages";
import type { BookingResource, BookingTier } from "@/types/booking";

/**
 * "Choose Your Stay" — one package at a time, switched by tier.
 *
 * Replaces a grid of small cards. Two reasons, both about scale: a grid grew
 * taller with every package the admin added, and at four-up none of them had
 * room for the inclusions or the slot table, so a guest had to open a modal to
 * compare anything. One full-width card per slide carries the whole offer, and
 * the carousel keeps the section a constant height whatever the catalogue does.
 *
 * Sizes here follow the HIG minimums rather than the old ad-hoc scale:
 *   - no text below 11px          (typography.md > Ensuring legibility: iOS 11pt min)
 *   - no font-weight below 400    (typography.md: "avoid light font weights")
 *   - every control at least 44px (accessibility.md: iOS 44x44 default)
 */

type TierKey = "SHARED" | "EXCLUSIVE" | "EVENTS";

const TIERS: { key: TierKey; label: string; icon: IconName; tagline: string; blurb: string }[] = [
  { key: "SHARED", label: "Shared", icon: "pool", tagline: "Come together",
    blurb: "Share the pool with other groups and pay per guest." },
  { key: "EXCLUSIVE", label: "Exclusive", icon: "lock", tagline: "Make it entirely yours",
    blurb: "Private resort access with no other groups in your time slot." },
  { key: "EVENTS", label: "Events", icon: "gift", tagline: "Celebrate beautifully",
    blurb: "The events hall for parties, birthdays and celebrations." },
];

/** Which tab a package belongs to: the venue packages are their own group,
 *  the pool ones split on whether the pool is shared or bought out. */
const tierOf = (p: ResortPackage): TierKey =>
  isEventPackage(p) ? "EVENTS" : p.status === "Exclusive" ? "EXCLUSIVE" : "SHARED";

interface PackageShowcaseProps {
  packages: ResortPackage[];
  onBookPackage?: (
    pkg: {
      code: string; title: string; price: number; listPrice?: number;
      capacity: number; requiresRoom?: boolean; slotMode: ResortPackage["slotMode"];
    },
    resource: BookingResource,
    status: BookingTier,
  ) => void;
  onFallbackBook: () => void;
  /** "pill" is the compact row used on the home page. "card" is the three
   *  named cards the /packages page leads with, where the tier choice IS the
   *  page's first decision rather than a filter on a section. */
  tierStyle?: "pill" | "card";
  /** Restates the chosen tier under the selector, numbered, so the carousel
   *  below has a heading that says what it is showing. */
  showTierIntro?: boolean;
}

export function PackageShowcase({ packages, onBookPackage, onFallbackBook, tierStyle = "pill", showTierIntro = false }: PackageShowcaseProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  const [tier, setTier] = useState<TierKey>("SHARED");
  const [lightbox, setLightbox] = useState<{ pkg: ResortPackage; idx: number } | null>(null);

  const groups = TIERS.map((t) => ({ ...t, items: packages.filter((p) => tierOf(p) === t.key) }))
    .filter((g) => g.items.length > 0);

  // The remembered tab can name a group with nothing in it: packages load
  // async, and the admin can deactivate the last one in a tier.
  const active = groups.find((g) => g.key === tier) ?? groups[0];
  if (!active) return null;

  return (
    <>
      <Tabs
        value={active.key}
        onValueChange={(v) => setTier(v as TierKey)}
        className="gap-0"
      >
        {/* TabsList pins its own height with a group-data variant, so a plain
            h-auto loses and a wrapped row spills onto the content below. */}
        <TabsList
          className={
            tierStyle === "card"
              ? "mx-auto mb-0 grid w-full max-w-[760px] grid-cols-1 gap-4 bg-transparent p-0 sm:grid-cols-3 group-data-[orientation=horizontal]/tabs:h-auto"
              : "mx-auto mb-7 flex w-fit max-w-full flex-wrap justify-center gap-2 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto"
          }
        >
          {groups.map((g) => {
            const on = active.key === g.key;
            if (tierStyle === "card") {
              return (
                <TabsTrigger
                  key={g.key}
                  value={g.key}
                  className="flex h-auto min-h-11 flex-col items-center gap-2 rounded-xl border px-5 py-6 data-[state=active]:shadow-none"
                  style={{
                    background: on ? `${gold}12` : C.bgCard2,
                    borderColor: on ? gold : C.border,
                  }}
                >
                  <span style={{ color: C.goldInk, lineHeight: 0 }}>
                    <Icon name={g.icon} size={22} strokeWidth={1.5} />
                  </span>
                  <span style={{ color: C.textH, fontSize: 17, fontFamily: "'Satoshi',system-ui,sans-serif" }}>
                    {g.label}
                  </span>
                  <span style={{ color: C.textS, fontSize: 12 }}>{g.tagline}</span>
                </TabsTrigger>
              );
            }
            return (
              <TabsTrigger
                key={g.key}
                value={g.key}
                // min-h-11 = 44px, the HIG default control size.
                className="min-h-11 rounded-full border px-6 text-[11.5px] font-medium tracking-[2px] data-[state=active]:shadow-none"
                style={{
                  background: on ? `${gold}18` : "transparent",
                  color: on ? C.goldInk : C.textS,
                  borderColor: on ? `${gold}55` : C.border,
                }}
              >
                {g.label.toUpperCase()}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {showTierIntro && (
          <div style={{ textAlign: "center", margin: mob ? "36px 0 24px" : "48px 0 28px" }}>
            <p style={{ color: C.goldInk, fontSize: 11, letterSpacing: 2.4, fontWeight: 700, margin: "0 0 12px" }}>
              {String(groups.findIndex((g) => g.key === active.key) + 1).padStart(2, "0")} · {active.label.toUpperCase()}
            </p>
            <h3 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 26 : 34, fontWeight: 400, margin: "0 0 12px", lineHeight: 1.15 }}>
              {active.tagline}
            </h3>
            <p style={{ color: C.textS, fontSize: 13.5, margin: "0 auto", maxWidth: 480, lineHeight: 1.6 }}>
              {active.blurb}
            </p>
          </div>
        )}

        {groups.map((g) => (
          <TabsContent key={g.key} value={g.key} className="mt-0">
            <TierCarousel
              items={g.items}
              C={C}
              isDark={isDark}
              mob={mob}
              onOpenGallery={(pkg) => setLightbox({ pkg, idx: 0 })}
              onBook={(p) => {
                if (onBookPackage) {
                  onBookPackage(
                    { code: p.code, title: p.title, price: p.price, listPrice: p.listPrice, capacity: p.capacity, requiresRoom: p.requiresRoom, slotMode: p.slotMode },
                    p.resource,
                    p.status,
                  );
                } else {
                  onFallbackBook();
                }
              }}
            />
          </TabsContent>
        ))}
      </Tabs>

      <GalleryLightbox state={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

/** One tier's packages, one per slide, with arrows and dots. */
function TierCarousel({
  items, C, isDark, mob, onOpenGallery, onBook,
}: {
  items: ResortPackage[];
  C: ReturnType<typeof T>;
  isDark: boolean;
  mob: boolean;
  onOpenGallery: (p: ResortPackage) => void;
  onBook: (p: ResortPackage) => void;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const sync = () => setCurrent(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => { api.off("select", sync); };
  }, [api]);

  const many = items.length > 1;

  return (
    <Carousel
      setApi={setApi}
      opts={{ align: "start", containScroll: "trimSnaps" }}
      className="relative"
      aria-label="Packages"
    >
      {/* The arrows need room outside the card; on a phone there is none, so
          they move under the row instead of sitting on the artwork. */}
      {/* `relative` here, not on <Carousel>: the arrows centre themselves on
          their nearest positioned ancestor, and the carousel root includes
          the dots row below the track. Centring on that put them below the
          card's middle. This wrapper is exactly the track. */}
      <div className={`relative ${many && !mob ? "px-14" : ""}`}>
        <CarouselContent className="-ml-4">
          {items.map((p) => (
            <CarouselItem key={p.code} className="h-auto basis-full pl-4">
              <PackageCard
                p={p}
                C={C}
                isDark={isDark}
                mob={mob}
                onOpenGallery={() => onOpenGallery(p)}
                onBook={() => onBook(p)}
              />
            </CarouselItem>
          ))}
        </CarouselContent>

        {many && !mob && (
          <>
            <CarouselPrevious className="left-0 size-11 border-border text-foreground" />
            <CarouselNext className="right-0 size-11 border-border text-foreground" />
          </>
        )}
      </div>


      {many && (
        <>
          {mob && (
            <div className="mt-5 flex justify-center gap-3">
              <CarouselPrevious className="static size-11 translate-x-0 translate-y-0 border-border text-foreground" />
              <CarouselNext className="static size-11 translate-x-0 translate-y-0 border-border text-foreground" />
            </div>
          )}

          {/* Dots. Position is also stated by the arrows' disabled state and
              announced on the live region, so this is not colour alone. */}
          <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="Choose a package">
            {items.map((p, i) => (
              <button
                key={p.code}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={p.title}
                onClick={() => api?.scrollTo(i)}
                // 44px tall hit area around a 4px visual dot, per the HIG
                // minimum; the bar itself stays small.
                className="flex h-11 min-w-11 items-center justify-center px-1"
              >
                <span
                  className="block h-1 rounded-full transition-all duration-300"
                  style={{
                    width: i === current ? 28 : 16,
                    background: i === current ? gold : C.border,
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </Carousel>
  );
}

function PackageCard({
  p, C, isDark, mob, onOpenGallery, onBook,
}: {
  p: ResortPackage;
  C: ReturnType<typeof T>;
  isDark: boolean;
  mob: boolean;
  onOpenGallery: () => void;
  onBook: () => void;
}) {
  const shots = p.gallery?.length ? p.gallery : [{ src: p.cover, label: p.title, kind: "" }];
  const exclusive = p.status === "Exclusive";
  const slots = p.slotMode === "WholeDay" ? [SLOTS.WholeDay] : [SLOTS.Day, SLOTS.Night];

  return (
    <article
      /* h-full so every slide fills the track, which is as tall as the
         tallest package. Without it a short package sat at the top of the
         track and the arrows -- centred on the track -- ended up below the
         card's own centre. It also gives the detail column the height its
         mt-auto CTA needs to reach the foot.

         h-full only equalises WITHIN a tier, because each tier is its own
         carousel. Across tiers it did not: measured at 1600px, Exclusive and
         Events both came out at 662px while Shared was 722px, because
         "Barkada Pool + Room" carries one more inclusion and a blurb that
         runs to two lines. Switching tabs visibly resized the card.

         The floor below is the tallest natural height at each width, so a
         tier can never render shorter than another:
             1024px  Shared 742, Events 739, Exclusive 706  -> 742
             1280px  Shared 722, Events 687, Exclusive 686  -> 722
             1600px  Shared 722, both others 662            -> 722
         Measured, not guessed. Below md the layout stacks and heights follow
         content, which is correct there. */
      className="grid h-full overflow-hidden rounded-2xl border md:min-h-[742px] md:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] xl:min-h-[722px]"
      style={{ background: C.bgCard2, borderColor: C.border, boxShadow: C.shadowCard }}
    >
      {/* Artwork. Always dark, so the bright gold and white type belong here. */}
      <div className="relative min-h-[240px] overflow-hidden bg-[#121212] md:min-h-[380px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${shots[0].src})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />

        <div className="absolute top-4 left-4 z-[2] rounded-full bg-black/55 px-3 py-2 text-[11px] tracking-wide text-white/90 backdrop-blur-sm">
          {String(shots.length).padStart(2, "0")} photo{shots.length === 1 ? "" : "s"}
        </div>

        <Button
          type="button"
          onClick={onOpenGallery}
          className="absolute top-3 right-3 z-[2] h-11 rounded-full bg-black/55 px-4 text-[11.5px] text-white backdrop-blur-sm hover:bg-black/75"
        >
          View gallery <span aria-hidden="true">→</span>
        </Button>

        <div className="absolute right-5 bottom-5 left-5 z-[2]">
          <p className="mb-2 text-[11px] tracking-[3px]" style={{ color: gold }}>PACKAGE</p>
          <h3 className="font-serif text-[30px] leading-tight font-normal text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:text-4xl">
            {p.title}
          </h3>
        </div>
      </div>

      {/* Detail column. One rhythm, left aligned, action pinned at the foot. */}
      <div className="flex flex-col">
        <div className="flex flex-col gap-4 p-6 sm:p-7">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="rounded-full px-3 py-1 text-[11px] tracking-[1.5px]"
              style={{
                background: exclusive ? `${gold}18` : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                color: exclusive ? C.goldInk : C.textS,
                borderColor: exclusive ? `${gold}44` : C.border,
              }}
            >
              {p.status.toUpperCase()}
            </Badge>
            {p.listPrice && (
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-[11px] tracking-[1.5px]"
                style={{ background: "rgba(76,175,80,0.10)", color: "#4caf50", borderColor: "rgba(76,175,80,0.35)" }}
              >
                SAVE {fmt(p.listPrice - p.price)}
              </Badge>
            )}
            {p.requiresRoom && (
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-[11px] tracking-[1.5px]"
                style={{ color: C.goldInk, borderColor: `${gold}44` }}
              >
                ROOM DISCOUNTED
              </Badge>
            )}
          </div>

          {/* "Starting at" rather than a struck-through list price. The
              saving it used to show is still on the SAVE badge above, so
              nothing is lost by dropping the second number. */}
          <div className="pt-1">
            <p className="mb-2 text-[11px] tracking-[2.5px]" style={{ color: C.textS }}>STARTING AT</p>
            <span className="font-serif text-[40px] leading-none font-normal" style={{ color: C.textH }}>
              {fmt(p.price)}
            </span>
          </div>

          <p className="text-[15px] leading-relaxed" style={{ color: C.textS }}>{p.blurb}</p>

          {p.includes.length > 0 && (
            <div>
              <p className="mb-3 text-[11px] tracking-[2.5px]" style={{ color: C.textXS }}>WHAT&apos;S INCLUDED</p>
              <ul className="flex flex-col">
                {p.includes.map((inc) => (
                  <li
                    key={inc}
                    className="flex items-start gap-3 border-b py-2 text-[14.5px] leading-snug last:border-0"
                    style={{ borderColor: C.borderLight, color: C.textB }}
                  >
                    <Icon name="check" size={13} style={{ color: C.goldInk, marginTop: 4, flexShrink: 0 }} />
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-3 text-[11px] tracking-[2.5px]" style={{ color: C.textXS }}>
              {p.slotMode === "WholeDay" ? "DURATION" : "CHOOSE WHEN YOU BOOK"}
            </p>
            <ul className="flex flex-col">
              {slots.map((sl) => (
                <li
                  key={sl.label}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-0"
                  style={{ borderColor: C.borderLight }}
                >
                  <span className="text-[14.5px]" style={{ color: C.textB }}>{sl.label}</span>
                  <span className="text-[13.5px] font-medium" style={{ color: C.goldInk }}>{sl.hours}</span>
                </li>
              ))}
            </ul>
          </div>

          {p.note && (
            <p className="flex items-start gap-2 text-[12.5px]" style={{ color: C.textXS }}>
              <Icon name="alert" size={12} style={{ marginTop: 4, flexShrink: 0 }} />
              <span>{p.note}</span>
            </p>
          )}
        </div>

        <div className="mt-auto p-6 pt-0 sm:p-7 sm:pt-0">
          <Button
            onClick={onBook}
            className="sw-btn h-auto w-full"
            style={goldBtn}
          >
            BOOK {p.title.toUpperCase()} <span aria-hidden="true">→</span>
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Full-bleed gallery for one package. */
function GalleryLightbox({
  state, onClose,
}: {
  state: { pkg: ResortPackage; idx: number } | null;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const pkg = state?.pkg;
  const shots = pkg?.gallery?.length ? pkg.gallery : pkg ? [{ src: pkg.cover, label: pkg.title, kind: "" }] : [];

  useEffect(() => { setIdx(state?.idx ?? 0); }, [state]);

  useEffect(() => {
    if (!state || shots.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIdx((n) => (n + 1) % shots.length);
      if (e.key === "ArrowLeft") setIdx((n) => (n - 1 + shots.length) % shots.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, shots.length]);

  if (!pkg) return null;
  const many = shots.length > 1;

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 grid h-dvh w-screen max-w-none translate-x-0 translate-y-0 place-items-center border-0 bg-transparent p-0 shadow-none sm:max-w-none"
        style={{ background: "rgba(5,4,3,0.97)", padding: 20 }}
      >
        <DialogTitle className="sr-only">{pkg.title} gallery</DialogTitle>
        <DialogDescription className="sr-only">
          Photo {idx + 1} of {shots.length}. Use the left and right arrow keys to browse.
        </DialogDescription>

        {many && (
          <>
            <button
              type="button"
              onClick={() => setIdx((n) => (n - 1 + shots.length) % shots.length)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-4 z-[3] flex size-12 -translate-y-1/2 items-center justify-center rounded-full border bg-black/40 text-xl backdrop-blur-sm sm:left-8"
              style={{ borderColor: `${gold}44`, color: gold }}
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={() => setIdx((n) => (n + 1) % shots.length)}
              aria-label="Next photo"
              className="absolute top-1/2 right-4 z-[3] flex size-12 -translate-y-1/2 items-center justify-center rounded-full border bg-black/40 text-xl backdrop-blur-sm sm:right-8"
              style={{ borderColor: `${gold}44`, color: gold }}
            >
              &rsaquo;
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="absolute top-4 right-4 z-[3] flex size-12 items-center justify-center rounded-full border bg-black/40 backdrop-blur-sm sm:top-8 sm:right-8"
          style={{ borderColor: `${gold}44`, color: gold }}
        >
          <Icon name="x" size={18} />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shots[Math.min(idx, shots.length - 1)].src}
          alt={`${pkg.title}, photo ${idx + 1} of ${shots.length}`}
          className="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
        />

        <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3 text-[13px]">
          <span className="text-white/85">{pkg.title}</span>
          <span style={{ color: gold }}>
            {idx + 1} / {shots.length}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
