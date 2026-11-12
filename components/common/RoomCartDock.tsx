"use client";

// ── The rooms a guest added, floating beside the theme button
//
// "compact" (every public page but Book Now): a small frosted pill with the
// room's photo and name and a way to carry on to the booking. "full" (Book
// Now, until the room step): the rooms laid out with photo, beds, capacity
// and price, each removable, and a fold to shrink it back to the pill. Book
// Now stops showing it at the room step, where the rooms are already
// picked and on screen.
//
// Frosted glass so it never reads as a solid block over the page, and kept
// beside the theme button rather than across the content.

import { imageAt } from "@/lib/img";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { useRoomCart, roomCart } from "@/hooks/useRoomCart";
import { useTheme } from "@/contexts/ThemeContext";
import { Icon } from "@/components/common/Icon";
import { fmt } from "@/lib/utils";
import { gold } from "@/lib/styles";
import "./RoomCartDock.css";

/** Pages where the pill has no place: the admin and staff sign-in, and
 *  Book Now, which shows the full card itself while it is useful. */
const HIDDEN_ON = ["/admin", "/login", "/book"];

export function RoomCartDock({ variant = "compact", note }: {
  variant?: "compact" | "full";
  /** A line under the rooms on the full card (Book Now's own advice). */
  note?: string;
}) {
  const ids = useRoomCart();
  const { rooms } = useApp();
  const { isDark } = useTheme();
  const router = useRouter();
  const path = usePathname() ?? "/";
  const [shrunk, setShrunk] = useState(false);
  // The full card shows the guest what they added when Book Now opens, then
  // gets out of the way: the first real scroll folds it to the pill, so it
  // never sits on the form they are filling in. Opened again by hand, it
  // stays open.
  const [autoFolded, setAutoFolded] = useState(false);
  useEffect(() => {
    if (variant !== "full" || autoFolded) return;
    const onScroll = () => {
      if (window.scrollY > 160) { setShrunk(true); setAutoFolded(true); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant, autoFolded]);

  const added = ids.map((id) => rooms.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  if (!added.length) return null;
  if (variant === "compact" && HIDDEN_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const theme = isDark ? "sw-dock--dark" : "sw-dock--light";
  const title = added.length === 1 ? added[0].name : `${added.length} rooms added`;
  const showFull = variant === "full" && !shrunk;

  if (!showFull) {
    return (
      <div className={`sw-dock sw-dock--pill ${theme}`} role="status" aria-live="polite">
        <span className="sw-dock__thumbs" aria-hidden="true">
          {added.slice(0, 2).map((r, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={r.id} src={imageAt(r.img, 96)} alt="" style={{ marginLeft: i ? -12 : 0, zIndex: 2 - i }} />
          ))}
        </span>
        <button
          type="button"
          className="sw-dock__main"
          onClick={() => (variant === "full" ? (setShrunk(false), setAutoFolded(true)) : router.push("/book"))}
          aria-label={variant === "full" ? `Show the rooms added to your booking: ${title}` : `Added to your booking: ${title}. Continue booking`}
        >
          <span className="sw-dock__eyebrow">{added.length === 1 ? "Room added" : "Added to your booking"}</span>
          <span className="sw-dock__title">{title}</span>
        </button>
        {variant === "compact" ? (
          <button type="button" className="sw-dock__cta" onClick={() => router.push("/book")} aria-label="Continue booking">
            <span className="sw-dock__cta-text">Book</span>
            <Icon name="arrow-right" size={14} />
          </button>
        ) : (
          <button type="button" className="sw-dock__icon" onClick={() => { setShrunk(false); setAutoFolded(true); }} aria-label="Show details">
            <Icon name="chevron-up" size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <section className={`sw-dock sw-dock--card ${theme}`} aria-label="Rooms added to your booking">
      <header className="sw-dock__head">
        <span className="sw-dock__eyebrow" style={{ color: gold }}>Added to your booking{added.length > 1 ? ` · ${added.length}` : ""}</span>
        <button type="button" className="sw-dock__icon" onClick={() => setShrunk(true)} aria-label="Make this smaller" title="Make this smaller">
          <Icon name="chevron-down" size={15} />
        </button>
      </header>
      <ul className="sw-dock__list">
        {added.map((r) => (
          <li key={r.id} className="sw-dock__room">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageAt(r.img, 160)} alt="" />
            {/* Name and one short line; the beds are on the Room step. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="sw-dock__name" title={r.name}>{r.name}</p>
              <p className="sw-dock__meta">Up to {r.capacity} guests · <span className="sw-dock__amt">{fmt(r.price)}</span> / stay</p>
            </div>
            <button type="button" className="sw-dock__remove" onClick={() => roomCart.remove(r.id)} aria-label={`Remove ${r.name}`} title="Remove">
              <Icon name="x" size={14} />
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="sw-dock__note">{note}</p>}
    </section>
  );
}
