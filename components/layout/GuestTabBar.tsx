"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/common/Icon";
import "./GuestTabBar.css";

// ── The guest's bottom tab bar, on phones
//
// The way people already use shopping and booking apps (Shopee, Grab,
// Agoda): the main places one thumb-tap away at the bottom of the screen,
// each an icon with a word under it, the current one lit. The top bar's
// menu still holds everything; this is the short way round.
//
// Only below 760px (CSS), and never in the admin or the staff sign-in.
// While it is up, <html> carries .sw-tabbar so
// the floating theme button and the room dock sit above it (GuestTabBar.css).

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/rooms", label: "Rooms", icon: "bed" },
  { href: "/book", label: "Book", icon: "calendar" },
  { href: "/my-booking", label: "My booking", icon: "bookmark" },
  { href: "/customer", label: "Help", icon: "message" },
];

/** Where the bar has no place: the admin and the staff sign-in. */
const HIDDEN = ["/admin", "/login"];

/* Drawn by ClientShell, in the site-wide layout, so it is in the very first
   HTML of every page. Inside each page's Navbar it arrived only once that
   page had rendered in the browser -- late on Book Now and the home page,
   which render there -- and it slid in over the content: the site's one
   layout shift. It reads the page from the URL itself. */
export function GuestTabBar() {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const hidden = HIDDEN.some((p) => path === p || path.startsWith(`${p}/`));

  useEffect(() => {
    if (hidden) return;
    document.documentElement.classList.add("sw-tabbar");
    return () => document.documentElement.classList.remove("sw-tabbar");
  }, [hidden]);

  if (hidden) return null;

  const go = (href: string) => {
    // The same top bar as the Navbar's links (ClientShell).
    const loader = globalThis.loader?.current;
    if (loader) loader.start(href, () => router.push(href));
    else router.push(href);
  };

  return (
    <nav className="sw-tabbar__bar" aria-label="Main">
      {TABS.map((t) => {
        const on = t.href === "/" ? path === "/" : path === t.href || path.startsWith(`${t.href}/`);
        const book = t.href === "/book";
        return (
          <button
            key={t.href}
            type="button"
            className={`sw-tabbar__tab${on ? " is-on" : ""}${book ? " sw-tabbar__tab--book" : ""}`}
            aria-current={on ? "page" : undefined}
            onClick={() => { if (!on) go(t.href); }}
          >
            <span className="sw-tabbar__icon"><Icon name={t.icon} size={book ? 22 : 21} /></span>
            <span className="sw-tabbar__label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
