"use client";

/* Event packages, offered inside the booking flow.
 *
 * Until now the only way to buy one was the Packages page: a guest who had
 * already started Book Now had no way to see them. This is that same
 * catalogue, at the point in step 1 where a guest is thinking about the
 * events hall.
 *
 * "Add this event" does not invent any pricing. It hands the package back to
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

interface EventPackagesProps {
  packages: ResortPackage[];
  mob: boolean;
  onBook: (pkg: ResortPackage) => void;
}

/** "Day or Night" / the whole-day hours — what the guest is choosing between. */
const whenLabel = (p: ResortPackage): string =>
  p.slotMode === "WholeDay" ? SLOTS.WholeDay.hours : "Day or Night";

export function EventPackages({ packages, mob, onBook }: EventPackagesProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<ResortPackage | null>(null);

  // Nothing to offer: the admin may have deactivated every event package.
  if (packages.length === 0) return null;

  const shown = expanded ? packages : packages.slice(0, PREVIEW_COUNT);
  const hidden = packages.length - shown.length;

  const shots = open?.gallery?.length
    ? open.gallery
    : open
      ? [{ src: open.cover, label: open.title, kind: "Venue" }]
      : [];

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 26, paddingTop: 24 }}>
      <p style={{ color: C.goldInk, letterSpacing: 2.2, fontSize: 11, margin: "0 0 9px", fontWeight: 700 }}>
        EVENT PACKAGES
      </p>
      <h4 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 20 : 23, margin: "0 0 9px", fontWeight: 400 }}>
        Or book a ready-made celebration
      </h4>
      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 18px", lineHeight: 1.6, maxWidth: 560 }}>
        Fixed-price packages for the events hall. Choosing one replaces the visit above with that package.
      </p>

      <ul
        style={{
          listStyle: "none", margin: 0, padding: 0, display: "grid",
          gridTemplateColumns: mob ? "1fr" : "repeat(3,minmax(0,1fr))",
          gap: 14,
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", fontSize: 12.5, letterSpacing: 1.6, fontWeight: 600 }}>
                    <Icon name="search" size={14} strokeWidth={1.8} />
                    VIEW MORE
                  </span>
                </span>
              </span>

              <span style={{ display: "block", padding: "14px 16px 16px" }}>
                <span style={{ display: "block", color: C.textH, fontSize: 16, fontFamily: "'Satoshi',system-ui,sans-serif", marginBottom: 6 }}>
                  {p.title}
                </span>
                <span style={{ display: "block", color: C.textS, fontSize: 12, lineHeight: 1.55, marginBottom: 10 }}>
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
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              ...outBtn, color: C.goldInk, minHeight: 42, padding: "0 20px",
              fontSize: 11.5, letterSpacing: 1.4, borderRadius: 8,
            }}
          >
            {expanded ? "SHOW FEWER" : `VIEW ALL ${packages.length} EVENTS`}
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} style={{ marginLeft: 6 }} />
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
                eyebrow="EVENT PACKAGE"
                compact
                title={
                  <DialogTitle asChild>
                    <div className="truncate font-serif text-[26px] leading-tight font-normal text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
                      {open.title}
                    </div>
                  </DialogTitle>
                }
              />

              <div style={{ padding: mob ? "18px 20px 22px" : "22px 26px 26px" }}>
                <DialogDescription asChild>
                  <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
                    {open.blurb}
                  </p>
                </DialogDescription>

                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                  <span style={{ color: C.textXS, fontSize: 10, letterSpacing: 1.8 }}>STARTING AT</span>
                  <span style={{ color: C.goldInk, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{fmt(open.price)}</span>
                  <span style={{ color: C.textS, fontSize: 12.5 }}>
                    {whenLabel(open)} · up to {open.capacity} guests
                  </span>
                </div>

                {open.includes.length > 0 && (
                  <>
                    <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 1.8, margin: "0 0 8px" }}>WHAT&apos;S INCLUDED</p>
                    <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 7 }}>
                      {open.includes.map((line) => (
                        <li key={line} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: C.textB, fontSize: 14, lineHeight: 1.55 }}>
                          <span aria-hidden="true" style={{ color: gold, lineHeight: 0, marginTop: 3, flexShrink: 0 }}>
                            <Icon name="check" size={13} strokeWidth={2} />
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {open.note && (
                  <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 18px", display: "flex", gap: 7, alignItems: "center" }}>
                    <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0 }}>
                      <Icon name="info" size={13} strokeWidth={1.8} />
                    </span>
                    {open.note}
                  </p>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setOpen(null)} style={{ ...outBtn, color: C.goldInk, minHeight: 46 }}>
                    CANCEL
                  </button>
                  <button type="button" onClick={() => { const chosen = open; setOpen(null); onBook(chosen); }} style={{ ...goldBtn, minHeight: 46 }}>
                    ADD THIS EVENT <span aria-hidden="true">→</span>
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
