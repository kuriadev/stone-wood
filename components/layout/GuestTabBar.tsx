"use client";

import { useEffect } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import "./GuestTabBar.css";

// ── The guest's bottom tab bar, on phones
//
// The way people already use shopping and booking apps (Shopee, Grab,
// Agoda): the main places one thumb-tap away at the bottom of the screen,
// each an icon with a word under it, the current one lit. The top bar's
// menu still holds everything; this is the short way round.
//
// Only below 760px, and never in the admin or the staff sign-in (the
// Navbar isn't drawn there). While it is up, <html> carries .sw-tabbar so
// the floating theme button and the room dock sit above it (GuestTabBar.css).

const TABS: { page: string; label: string; icon: IconName }[] = [
  { page: "Home", label: "Home", icon: "home" },
  { page: "Rooms", label: "Rooms", icon: "bed" },
  { page: "Book Now", label: "Book", icon: "calendar" },
  { page: "Manage Booking", label: "My booking", icon: "bookmark" },
  { page: "Customer Service", label: "Help", icon: "message" },
];

export function GuestTabBar({ page, setPage }: { page: string; setPage: (p: string) => void }) {
  useEffect(() => {
    document.documentElement.classList.add("sw-tabbar");
    return () => document.documentElement.classList.remove("sw-tabbar");
  }, []);

  return (
    <nav className="sw-tabbar__bar" aria-label="Main">
      {TABS.map((t) => {
        const on = page === t.page;
        const book = t.page === "Book Now";
        return (
          <button
            key={t.page}
            type="button"
            className={`sw-tabbar__tab${on ? " is-on" : ""}${book ? " sw-tabbar__tab--book" : ""}`}
            aria-current={on ? "page" : undefined}
            onClick={() => { if (!on) setPage(t.page); }}
          >
            <span className="sw-tabbar__icon"><Icon name={t.icon} size={book ? 22 : 21} /></span>
            <span className="sw-tabbar__label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
