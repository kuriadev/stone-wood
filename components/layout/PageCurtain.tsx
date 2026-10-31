"use client";

import { Icon, type IconName } from "@/components/common/Icon";

// ── The curtain between pages
//
// A nav click raises a dark curtain from the bottom, the destination's icon
// and name rise onto it, and once the new page has rendered (and its data
// arrived) the curtain lifts off the top. ClientShell drives the phases;
// this only draws them. Styles are in app/intro.css, next to the first-load
// intro it echoes.

export type CurtainPhase = "idle" | "in" | "out";

/** The pages that get a curtain, by path. Anything else navigates plainly. */
export const CURTAIN_PAGES: Record<string, { label: string; eyebrow: string; icon: IconName }> = {
  "/": { label: "Home", eyebrow: "Welcome back", icon: "home" },
  "/rooms": { label: "Rooms", eyebrow: "Rest easy", icon: "bed" },
  "/packages": { label: "Packages", eyebrow: "Choose your stay", icon: "gift" },
  "/gallery": { label: "Gallery", eyebrow: "A look inside", icon: "image" },
  "/about": { label: "About Us", eyebrow: "Our story", icon: "leaf" },
  "/book": { label: "Book Now", eyebrow: "Reserve your date", icon: "calendar" },
  "/my-booking": { label: "Your Booking", eyebrow: "Manage a reservation", icon: "bookmark" },
  "/customer": { label: "Guest Service", eyebrow: "We're here to help", icon: "message" },
};

export function PageCurtain({ phase, path }: { phase: CurtainPhase; path: string | null }) {
  const page = path ? CURTAIN_PAGES[path] : undefined;
  if (phase === "idle" || !page) return null;
  return (
    <div className={`sw-curtain sw-curtain--${phase}`} role="status" aria-live="polite">
      <span className="sw-curtain__edge" />
      {/* Keyed on the path so a second click mid-way replays the title. */}
      <div key={path} className="sw-curtain__inner">
        <span className="sw-curtain__ring">
          <svg className="sw-curtain__circle" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="38" pathLength={1} />
          </svg>
          <Icon name={page.icon} size={26} />
        </span>
        <span className="sw-curtain__eyebrow">{page.eyebrow}</span>
        <span className="sw-curtain__title">{page.label}</span>
        <span className="sw-curtain__rule" />
      </div>
    </div>
  );
}
