"use client";

// ── Packages, turned by the page scroll ──
//
// Wide screens (1024px+): a wheel of the kinds (Shared, Exclusive, Events)
// on the left and the package card on the right, pinned while the page
// scrolls past them. Each step of scrolling turns to the next kind; after
// the last one the page carries on. The selected kind's line and
// description sit under its name on the wheel.
//
// Narrower screens, or a single kind: the plain PackageShowcase with its
// tabs, scrolling normally.
//
// Used by the home page and the Packages page.

import { useEffect, useRef, useState } from "react";
import { useWidth } from "@/hooks/useWidth";
import { THEME_COLORS } from "@/lib/theme";
import { PackageShowcase, TIERS, tierOf, type TierKey, type PackageShowcaseProps } from "@/components/sections/PackageShowcase";
import OptionWheel from "@/components/common/OptionWheel";
import "./PackageTierScroll.css";

type Props = Omit<PackageShowcaseProps, "tier" | "onTierChange" | "hideTabs">;

/** The site nav's height: the pinned block is centred below it. */
const NAV_H = 74;

export function PackageTierScroll(props: Props) {
  const C = THEME_COLORS;
  const w = useWidth();
  // The wheel needs room beside the card, and a pointer: phones and small
  // tablets keep the tabs, which suit a thumb.
  const wide = w >= 1024;

  const kinds = TIERS.filter((t) => props.packages.some((p) => tierOf(p) === t.key));
  const [tier, setTier] = useState<TierKey>("SHARED");
  const at = Math.max(0, kinds.findIndex((k) => k.key === tier));
  const current = kinds[at];
  /* The pinned block must fit under the nav, or part of the card is hidden
     with no way to scroll to it. Measured once pinned (`fitH`, the block's
     height); a screen too short for it gets the tabs instead, which scroll
     normally. Re-checked whenever the window is resized. */
  const fitH = useRef(0);
  const [tooShort, setTooShort] = useState(false);
  useEffect(() => {
    const read = () => {
      if (fitH.current) setTooShort(fitH.current > window.innerHeight - NAV_H - 24);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  const wheelOn = wide && kinds.length > 1 && !tooShort;
  const count = kinds.length;
  const keys = kinds.map((k) => k.key).join();

  // The track is the pinned block's height plus one STEP per kind after
  // the first.
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState({ h: 0, top: 96, step: 600 });
  /* Sized and placed by the tallest kind's card. The cards differ (Events
     is shorter than Barkada Pool + Room), and when the track followed the
     card on screen it resized with every turn: the footer slid up and down
     mid-scroll, and the shift could turn the wheel again. All the kinds'
     cards share one grid cell, so its height is the tallest's and holds
     still as the wheel turns. */
  const tallest = useRef(0);
  /* A kind picked on the wheel, while the page glides to its place. The
     scroll would otherwise re-pick the kind under the glide on the way
     (back to the old one, or through the one in between), so the card
     flicked back and forth before landing. Until the glide ends, or the
     person scrolls themselves, the picked kind stays. */
  const picked = useRef<{ i: number; until: number } | null>(null);

  useEffect(() => {
    if (!wheelOn) return;
    const el = pinRef.current;
    if (!el) return;
    /* The block's own height, read from its parts rather than from `el`:
       el carries the held min-height, so a reading taken while the page was
       still settling (756px, against 699px once loaded) held itself in place
       and could switch the wheel off for good. The stacked cards cell is
       already the tallest kind's height, so it does not change on a turn. */
    const natural = () => Math.max(
      el.querySelector<HTMLElement>(".sw-pkgscroll__cards")?.offsetHeight ?? 0,
      el.querySelector<HTMLElement>(".sw-pkgwheel")?.offsetHeight ?? 0,
    );
    const measure = () => {
      const vh = window.innerHeight;
      tallest.current = natural() || el.offsetHeight;
      const t = tallest.current;
      fitH.current = t;
      if (t > vh - NAV_H - 24) { setTooShort(true); return; }
      // Centred under the nav when it fits; when it is taller than the
      // screen, pinned by its foot so the Book button stays in view.
      const room = vh - NAV_H;
      const top = t <= room - 24 ? NAV_H + (room - t) / 2 : vh - t - 16;
      const step = Math.round(vh * 0.7);
      setPin((p) => (p.h === t && p.top === top && p.step === step ? p : { h: t, top, step }));
    };
    /* Not judged until the page has loaded and its fonts are in: read any
       sooner, before this file's stylesheet and the web fonts apply, the
       block came out 740px instead of 699px, too tall for a 1349x803
       screen, and the wheel was switched off for the tabs on every visit. */
    const ro = new ResizeObserver(measure);
    let live = true;
    const start = () => {
      if (!live) return;
      measure();
      ro.observe(el);
      // el never shrinks below its min-height; its parts do.
      el.querySelectorAll(".sw-pkgscroll__cards, .sw-pkgwheel").forEach((part) => ro.observe(part));
      window.addEventListener("resize", measure);
    };
    const loaded = document.readyState === "complete"
      ? Promise.resolve()
      : new Promise<void>((res) => window.addEventListener("load", () => res(), { once: true }));
    void Promise.all([loaded, document.fonts.ready]).then(start);
    return () => { live = false; ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [wheelOn]);

  useEffect(() => {
    if (!wheelOn) return;
    const order = keys.split(",") as TierKey[];
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const track = trackRef.current;
        if (!track) return;
        const d = pin.top - track.getBoundingClientRect().top;
        const i = Math.min(order.length - 1, Math.max(0, Math.round(d / pin.step)));
        const lock = picked.current;
        if (lock) {
          // Arrived (within a few px of its place), or the glide took too long.
          if (Math.abs(d - lock.i * pin.step) < 4 || performance.now() > lock.until) picked.current = null;
          else return;
        }
        setTier((t) => (order[i] && order[i] !== t ? order[i] : t));
      });
    };
    // The person taking over the scroll ends the glide's hold at once.
    const release = () => { picked.current = null; };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("scrollend", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("scrollend", onScroll);
    };
  }, [wheelOn, pin.top, pin.step, keys]);

  // Picking a kind on the wheel (a click, a drag, the arrow keys) scrolls
  // the page to that kind's place, so the scroll and the wheel agree.
  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track || !kinds[i]) return;
    setTier(kinds[i].key);
    const y = window.scrollY + track.getBoundingClientRect().top - pin.top + i * pin.step;
    picked.current = { i, until: performance.now() + 1500 };
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  if (!wheelOn) return <PackageShowcase {...props} />;

  return (
    <div ref={trackRef} className="sw-pkgscroll" style={{ height: pin.h + (count - 1) * pin.step }}>
      <div ref={pinRef} className="sw-pkgwheel-layout sw-pkgscroll__pin" style={{ top: pin.top, minHeight: pin.h || undefined }}>
        {current && (
          <aside className="sw-pkgwheel" aria-label="Choose a kind of package">
            <div className="sw-pkgwheel__wheel">
              <OptionWheel
                items={kinds.map((k) => k.label)}
                defaultSelected={at}
                selected={at}
                captureWheel={false}
                onChange={(i) => goTo(i)}
                textColor="#7d7466"
                activeColor="#c9a84c"
                side="left"
                fontSize={2.8}
                spacing={2.9}
                curve={1}
                tilt={14}
                blur={1.6}
                fade={0.32}
                smoothing={220}
                inset={18}
                draggable
              />
              {/* The selected kind's line, under its name. */}
              <div key={current.key} className="sw-pkgwheel__desc" aria-live="polite">
                <p style={{ color: C.textH }}>{current.tagline}</p>
                <p style={{ color: C.textS }}>{current.blurb}</p>
              </div>
            </div>
            <div className="sw-pkgwheel__steps" aria-hidden="true">
              {kinds.map((k, i) => <span key={k.key} className={i === at ? "is-on" : undefined} />)}
            </div>
          </aside>
        )}
        {/* Every kind's card, stacked in one grid cell, only the current one
            shown. The cell is as tall as the tallest from the first paint, so
            turning the wheel never resizes the block (or moves the footer),
            and the cards cross-fade instead of swapping. */}
        <div className="sw-pkgscroll__cards">
          {kinds.map((k) => {
            const on = k.key === tier;
            return (
              <div key={k.key} className={on ? "is-on" : undefined} aria-hidden={on ? undefined : true} inert={!on}>
                <PackageShowcase {...props} showTierIntro={false} tier={k.key} onTierChange={setTier} hideTabs />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
