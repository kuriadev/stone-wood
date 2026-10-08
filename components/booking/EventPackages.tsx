"use client";

/* Packages, offered inside the booking flow.
 *
 * Until now the only way to buy one was the Packages page: a guest who had
 * already started Book Now had no way to see them. This is that same
 * catalogue, in step 1, filtered to what the guest just chose: the resort
 * packages under "Resort visit", the event packages once the events hall is
 * in the booking.
 *
 * "Add this package" does not invent any pricing. It hands the package back to
 * the page, which deep-links through buildPackageBookingUrl() -- the exact
 * route the Packages page uses -- so Book Now reopens in package mode with
 * the resource, tier, slot and capacity the package dictates, and the server
 * quote validates it the way it already validates every package booking.
 */

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { fmt } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { Icon } from "@/components/common/Icon";
import { MediaGallery } from "@/components/common/MediaGallery";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ResortPackage } from "@/types/package";

/** How many cards show before "View all". Three fills one desktop row. */
const PREVIEW_COUNT = 3;

/** "events": packages that use the hall. "resort": pool-only packages. */
export type StepPackageKind = "events" | "resort";

interface EventPackagesProps {
  kind: StepPackageKind;
  packages: ResortPackage[];
  mob: boolean;
  onBook: (pkg: ResortPackage) => void;
}

/** The words that change with the kind; the layout is the same for both. */
const COPY: Record<StepPackageKind, {
  eyebrow: string; heading: string; lede: string; plural: string; single: string; add: string; photoKind: string;
}> = {
  events: {
    eyebrow: "EVENT PACKAGES",
    heading: "Or book a ready-made celebration",
    lede: "Fixed-price packages for the events hall. Choosing one replaces the visit above with that package.",
    plural: "EVENTS",
    single: "EVENT PACKAGE",
    add: "ADD THIS EVENT",
    photoKind: "Venue",
  },
  resort: {
    eyebrow: "RESORT PACKAGES",
    heading: "Or book a ready-made package",
    lede: "Fixed-price packages for a resort visit. Choosing one replaces the visit above with that package.",
    plural: "PACKAGES",
    single: "RESORT PACKAGE",
    add: "ADD THIS PACKAGE",
    photoKind: "Pool",
  },
};

/** "Day or Night" / the whole-day hours — what the guest is choosing between. */
const whenLabel = (p: ResortPackage): string =>
  p.slotMode === "WholeDay" ? SLOTS.WholeDay.hours : "Day or Night";

export function EventPackages({ kind, packages, mob, onBook }: EventPackagesProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const copy = COPY[kind];
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<ResortPackage | null>(null);

  // Nothing to offer: the admin may have deactivated every package of this kind.
  if (packages.length === 0) return null;

  const shown = expanded ? packages : packages.slice(0, PREVIEW_COUNT);
  const hidden = packages.length - shown.length;

  const shots = open?.gallery?.length
    ? open.gallery
    : open
      ? [{ src: open.cover, label: open.title, kind: copy.photoKind }]
      : [];

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 28, paddingTop: 24 }}>
      <p style={{ color: C.goldInk, letterSpacing: 2.2, fontSize: 11, margin: "0 0 8px", fontWeight: 700 }}>
        {copy.eyebrow}
      </p>
      <h4 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 20 : 23, margin: "0 0 8px", fontWeight: 400 }}>
        {copy.heading}
      </h4>
      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 20px", lineHeight: 1.6, maxWidth: 560 }}>
        {copy.lede}
      </p>

      <ul
        style={{
          listStyle: "none", margin: 0, padding: 0, display: "grid",
          gridTemplateColumns: mob ? "1fr" : "repeat(3,minmax(0,1fr))",
          gap: 16,
        }}
      >
        {shown.map((p) => (
          <li key={p.code}>
            <button
              type="button"
              className="sw-event-card"
              onClick={() => setOpen(p)}
              aria-label={`View ${p.title} — ${fmt(p.price)}`}
              style={{
                position: "relative", display: "block", width: "100%", padding: 0,
                textAlign: "left", cursor: "pointer", overflow: "hidden",
                borderRadius: 12, border: `1px solid ${C.border}`,
                background: C.bgCard2, color: "inherit", font: "inherit",
              }}
            >
              <span style={{ position: "relative", display: "block", height: mob ? 150 : 132, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  loading="lazy"
                  decoding="async"
                  src={p.cover}
                  alt=""
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                />
                {/* The veil. Hidden at rest, revealed on hover AND on keyboard
                    focus, so it is not a mouse-only affordance. */}
                <span
                  className="sw-event-veil"
                  aria-hidden="true"
                  /* Inline, not in the class: declared in globals.css the
                     backdrop-filter computed to `none` (Tailwind's layer
                     resets it on the universal selector), while the opacity
                     from the same rule applied fine. Inline wins outright. */
                  style={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 12.5, letterSpacing: 1.6, fontWeight: 600 }}>
                    <Icon name="search" size={14} strokeWidth={1.75} />
                    VIEW MORE
                  </span>
                </span>
              </span>

              <span style={{ display: "block", padding: "16px 16px 16px" }}>
                <span style={{ display: "block", color: C.textH, fontSize: 16, fontFamily: "'Satoshi',system-ui,sans-serif", marginBottom: 8 }}>
                  {p.title}
                </span>
                <span style={{ display: "block", color: C.textS, fontSize: 12, lineHeight: 1.55, marginBottom: 12 }}>
                  {whenLabel(p)} · up to {p.capacity} guests
                </span>
                <span style={{ display: "block", color: C.textXS, fontSize: 9.5, letterSpacing: 1.6 }}>STARTING AT</span>
                <span style={{ display: "block", color: C.goldInk, fontSize: 18, fontWeight: 700 }}>{fmt(p.price)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Only offered when something is actually hidden, so the control never
          appears as a dead end. */}
      {(hidden > 0 || expanded) && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button className="sw-btn-out"
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              ...outBtn, color: C.goldInk, minHeight: 42, padding: "0 20px",
              fontSize: 11.5, letterSpacing: 1.4, borderRadius: 8,
            }}
          >
            {expanded ? "SHOW FEWER" : `VIEW ALL ${packages.length} ${copy.plural}`}
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} style={{ marginLeft: 8 }} />
          </button>
        </div>
      )}

      {/* Full detail. The backdrop blurs so the card reads as lifted off the
          booking form rather than floating on top of a readable one. */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent
          overlayClassName="backdrop-blur-sm bg-black/60"
          className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[min(46rem,calc(100%-2rem))]"
        >
          {open && (
            <div className="flex flex-col">
              <MediaGallery
                shots={shots}
                eyebrow={copy.single}
                compact
                title={
                  <DialogTitle asChild>
                    <div className="truncate font-serif text-[26px] leading-tight font-normal text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
                      {open.title}
                    </div>
                  </DialogTitle>
                }
              />

              <div style={{ padding: mob ? "20px 20px 24px" : "24px 28px 28px" }}>
                <DialogDescription asChild>
                  <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
                    {open.blurb}
                  </p>
                </DialogDescription>

                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <span style={{ color: C.textXS, fontSize: 10, letterSpacing: 1.8 }}>STARTING AT</span>
                  <span style={{ color: C.goldInk, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{fmt(open.price)}</span>
                  <span style={{ color: C.textS, fontSize: 12.5 }}>
                    {whenLabel(open)} · up to {open.capacity} guests
                  </span>
                </div>

                {open.includes.length > 0 && (
                  <>
                    <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 1.8, margin: "0 0 8px" }}>WHAT&apos;S INCLUDED</p>
                    <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 8 }}>
                      {open.includes.map((line) => (
                        <li key={line} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: C.textB, fontSize: 14, lineHeight: 1.55 }}>
                          <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, marginTop: 4, flexShrink: 0 }}>
                            <Icon name="check" size={13} strokeWidth={2} />
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {open.note && (
                  <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 20px", display: "flex", gap: 8, alignItems: "center" }}>
                    <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0 }}>
                      <Icon name="info" size={13} strokeWidth={1.75} />
                    </span>
                    {open.note}
                  </p>
                )}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="sw-btn-out" type="button" onClick={() => setOpen(null)} style={{ ...outBtn, color: C.goldInk, minHeight: 46 }}>
                    CANCEL
                  </button>
                  <button className="sw-btn" type="button" onClick={() => { const chosen = open; setOpen(null); onBook(chosen); }} style={{ ...goldBtn, minHeight: 46 }}>
                    {copy.add} <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
