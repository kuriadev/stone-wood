"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { ResortPackage } from "@/types/package";
import type { BookingResource, BookingTier } from "@/types/booking";
import { useState } from "react";
import { srcSetFor, SIZES } from "@/lib/img";
import { Icon } from "@/components/common/Icon";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MediaGallery } from "@/components/common/MediaGallery";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface PackagesPageProps {
  setPage: (p: string) => void;
  packages: ResortPackage[];
  onBookPackage: (pkg: ResortPackage, resource: BookingResource, tier: BookingTier) => void;
}

export function PackagesPage({ packages, onBookPackage }: PackagesPageProps) {
  // Scroll reveals. Called here, not in the layout: the effect must run
  // after THIS page has hydrated or it mutates un-hydrated DOM.

  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const tab = w < 1024;

  const [activePkg, setActivePkg] = useState<ResortPackage | null>(null);

  const visible = packages.filter((p) => p.active);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "52px 20px" : "88px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* HEADER — one reveal for the trio so they rise together. */}
        <Reveal>
        <p style={{ color: C.goldInk, letterSpacing: 4, fontSize: 12.5, textAlign: "center" }}>
          RESORT PACKAGES
        </p>
        <h2 style={{
          fontFamily: "'Cormorant Garamond',Georgia,serif",
          fontSize: mob ? 28 : 46,
          color: C.textH,
          textAlign: "center",
          marginBottom: 10,
        }}>
          Pick a Package
        </h2>
        <p style={{ color: C.textS, textAlign: "center", marginBottom: 48, fontSize: 14.5 }}>
          Fixed-price bundles — pick one, pay once, and skip building a booking piece by piece.
        </p>
        </Reveal>

        {/* GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : tab ? "1fr 1fr" : "repeat(3,1fr)",
          gap: 28,
        }}>
          {visible.map((p) => (
            <Reveal
              key={p.id}
              className="lux-room-card"
              onClick={() => setActivePkg(p)}
              style={{
                background: C.bgCard,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: C.shadowCard,
                cursor: "pointer",
                transition: "all .4s cubic-bezier(.22,1,.36,1)",
                // Grid already stretches every card to the tallest in the row.
                // Making the card a column lets the body below claim the extra
                // height, so the button can be pinned to the bottom instead of
                // floating wherever the text happens to end.
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ position: "relative", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" decoding="async" src={p.cover} srcSet={srcSetFor(p.cover)} sizes={SIZES.card} alt={p.title} style={{ width: "100%", height: 200, objectFit: "cover" }} className="room-img" />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.5),transparent 60%)" }} />
                <div style={{ position: "absolute", bottom: 12, left: 14, right: 14, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, background: "rgba(0,0,0,0.4)", padding: "3px 8px", borderRadius: 6, color: "#fff" }}>
                    <Icon name="users" size={13} style={{ marginRight: 5 }} />Up to {p.capacity}
                  </span>
                  <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>
                    {p.listPrice && <span style={{ textDecoration: "line-through", opacity: 0.6, marginRight: 6, fontSize: 13.5 }}>{fmt(p.listPrice)}</span>}
                    {fmt(p.price)}
                  </span>
                </div>
              </div>
              <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ color: C.textH, fontSize: 18 }}>{p.title}</h3>
                <p style={{ color: C.goldInk, fontSize: 12.5, marginBottom: 6 }}>{p.status.toUpperCase()} · {p.resource}</p>
                <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 16 }}>{p.blurb}</p>
                {p.requiresRoom && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                    {p.requiresRoom && <Badge variant="outline" style={{ fontSize: 10.5, letterSpacing: 1, color: C.goldInk, border: `1px solid ${gold}55`, borderRadius: 20, padding: "3px 8px" }}>ROOM DISCOUNTED</Badge>}
                  </div>
                )}
                <button
                  className="sw-btn"
                  onClick={(e) => { e.stopPropagation(); onBookPackage(p, p.resource, p.status); }}
                  style={{ ...outBtn, width: "100%", padding: "11px", borderRadius: 8, marginTop: "auto" }}
                >
                  BOOK PACKAGE
                </button>
              </div>
            </Reveal>
          ))}
          {visible.length === 0 && (
            <p style={{ color: C.textXS, fontSize: 14.5, gridColumn: "1/-1", textAlign: "center", padding: "32px 0" }}>No packages available right now.</p>
          )}
        </div>
      </div>

      {/* MODAL — the same two-column shape as the package modal on the home
          page, sharing MediaGallery so the slider, counter and thumbnails
          behave identically. This page was previously showing only `cover`
          even though every package carries a `gallery` array. */}
      <Dialog open={!!activePkg} onOpenChange={(open) => { if (!open) setActivePkg(null); }}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[min(56rem,calc(100%-2rem))]">
          {activePkg && (
            <div className="grid md:grid-cols-2">
              <MediaGallery
                shots={activePkg.gallery?.length ? activePkg.gallery : [{ src: activePkg.cover, label: activePkg.title }]}
                eyebrow="PACKAGE"
                compact={mob}
                title={
                  <DialogTitle asChild>
                    <div className="truncate font-serif text-[26px] leading-tight font-normal text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:text-3xl">
                      {activePkg.title}
                    </div>
                  </DialogTitle>
                }
              />

              <div className="flex flex-col">
                <div className="flex flex-col gap-5 p-6 sm:p-7">
                  <p className="text-sm text-accent-ink">
                    {activePkg.status.toUpperCase()} · Up to {activePkg.capacity} guests
                  </p>

                  <div>
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-serif text-[40px] leading-none font-normal text-foreground">{fmt(activePkg.price)}</span>
                      {activePkg.listPrice && (
                        <span className="text-[17px] text-faint line-through">{fmt(activePkg.listPrice)}</span>
                      )}
                    </div>
                    {activePkg.note && <p className="mt-1.5 text-[12.5px] text-faint">{activePkg.note}</p>}
                  </div>

                  <DialogDescription asChild>
                    <p className="text-[14.5px] leading-relaxed text-muted-foreground">{activePkg.blurb}</p>
                  </DialogDescription>

                  {activePkg.includes.length > 0 && (
                    <div>
                      <p className="mb-3 text-[10.5px] tracking-[2.5px] text-faint">WHAT&apos;S INCLUDED</p>
                      <ul className="flex flex-col">
                        {activePkg.includes.map((inc, i) => (
                          <li key={i} className="flex items-start gap-2 border-b border-border-soft py-2.5 last:border-0 last:pb-0">
                            <Icon name="check" size={12} className="mt-1 shrink-0 text-accent-ink" />
                            <span className="text-[14.5px] leading-snug text-body">{inc}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-auto border-t border-border-soft p-6 pt-5 sm:px-7">
                  <Button
                    className="sw-btn h-auto w-full rounded-lg border border-accent-ink bg-transparent py-3.5 text-xs font-bold tracking-wider text-accent-ink hover:bg-accent-ink/10"
                    onClick={() => onBookPackage(activePkg, activePkg.resource, activePkg.status)}
                  >
                    BOOK PACKAGE
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style jsx>{`
        .lux-room-card:hover .room-img { transform: scale(1.05); }
      `}</style>
    </div>
  );
}
