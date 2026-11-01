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
  const wheelOn = wide && kinds.length > 1;
  const count = kinds.length;
  const keys = kinds.map((k) => k.key).join();

  // The track is the pinned block's height plus one STEP per kind after
  // the first.
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState({ h: 0, top: 96, step: 600 });
  // Placed by the tallest card seen, so the block doesn't shift up and down
  // as kinds with taller cards come and go.
  const tallest = useRef(0);

  useEffect(() => {
    if (!wheelOn) return;
    const el = pinRef.current;
    if (!el) return;
    const measure = () => {
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      tallest.current = Math.max(tallest.current, h);
      const t = tallest.current;
      // Centred under the nav when it fits; when it is taller than the
      // screen, pinned by its foot so the Book button stays in view.
      const room = vh - NAV_H;
      const top = t <= room - 24 ? NAV_H + (room - t) / 2 : vh - t - 16;
      setPin({ h, top, step: Math.round(vh * 0.7) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
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
        setTier((t) => (order[i] && order[i] !== t ? order[i] : t));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); };
  }, [wheelOn, pin.top, pin.step, keys]);

  // Picking a kind on the wheel (a click, a drag, the arrow keys) scrolls
  // the page to that kind's place, so the scroll and the wheel agree.
  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track || !kinds[i]) return;
    setTier(kinds[i].key);
    const y = window.scrollY + track.getBoundingClientRect().top - pin.top + i * pin.step;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  if (!wheelOn) return <PackageShowcase {...props} />;

  return (
    <div ref={trackRef} className="sw-pkgscroll" style={{ height: pin.h + (count - 1) * pin.step }}>
      <div ref={pinRef} className="sw-pkgwheel-layout sw-pkgscroll__pin" style={{ top: pin.top }}>
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
        <div style={{ minWidth: 0 }}>
          <PackageShowcase {...props} showTierIntro={false} tier={tier} onTierChange={setTier} hideTabs />
        </div>
      </div>
    </div>
  );
}
