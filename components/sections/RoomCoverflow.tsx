"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { fmt } from "@/lib/utils";
import { srcSetFor, SIZES } from "@/lib/img";
import { SPACE } from "@/lib/spacing";
import type { Room } from "@/types/room";
import { Coverflow } from "@/components/common/Coverflow";
import { Icon } from "@/components/common/Icon";

/**
 * The rooms, as a coverflow deck.
 *
 * Lives here rather than inside each page because the Rooms page and the home
 * page both show it, and a card that looked different in the two places would
 * read as two different products.
 *
 * The photo is the same responsive <img> the room grid uses — `loading="lazy"`
 * and a srcSet — so a deck of twelve rooms does not pull twelve full-size
 * images on mount. Only the seven nearest cards are mounted at all
 * (see Coverflow), which keeps that true however long the list grows.
 */

interface RoomCoverflowProps {
  rooms: Room[];
  /** Called when the centre card is tapped. */
  onSelect: (room: Room) => void;
  /** The centre card's button. The off-centre cards render it too, but they
   *  are `inert`, so only this one can be reached. */
  ctaLabel: string;
}

export function RoomCoverflow({ rooms, onSelect, ctaLabel }: RoomCoverflowProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  const cardWidth = mob ? 256 : 340;
  const cardHeight = mob ? 384 : 448;
  const imgHeight = mob ? 200 : 248;

  return (
    <Coverflow
      items={rooms}
      getKey={(r) => r.id}
      label="Rooms"
      cardWidth={cardWidth}
      cardHeight={cardHeight}
      onSelect={(r) => onSelect(r)}
      render={(r, active) => (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: C.bgCard,
            border: `1px solid ${active ? `${C.border}` : C.borderLight}`,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: active ? C.shadow : C.shadowCard,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img
              loading="lazy"
              decoding="async"
              src={r.img}
              srcSet={srcSetFor(r.img)}
              sizes={SIZES.card}
              alt={r.name}
              style={{ width: "100%", height: imgHeight, objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top,rgba(0,0,0,0.5),transparent 60%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: SPACE.sm,
                left: SPACE.md,
                right: SPACE.md,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  background: "rgba(0,0,0,0.4)",
                  padding: "4px 8px",
                  borderRadius: 6,
                  color: "#fff",
                }}
              >
                <Icon name="users" size={13} style={{ marginRight: 4 }} />
                {r.capacity} guests
              </span>
              <span
                style={{
                  color: "#fff",
                  fontWeight: 700,
                  fontFamily: "'Satoshi',system-ui,sans-serif",
                }}
              >
                {fmt(r.price)}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: SPACE.lg,
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3 style={{ color: C.textH, fontSize: mob ? 16 : 18, margin: 0 }}>{r.name}</h3>
            <p style={{ color: C.goldInk, fontSize: 13.5, margin: "4px 0 8px" }}>
              <Icon name="bed" size={13} style={{ marginRight: 4 }} />
              {r.beds}
            </p>
            <p
              style={{
                color: C.textS,
                fontSize: 14,
                lineHeight: 1.55,
                margin: 0,
                // The deck is a fixed height, so a long description clamps
                // rather than pushing the button out of the card.
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {r.desc}
            </p>

            <span
              className="sw-btn-out"
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACE.xs,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: SPACE.sm,
                color: C.textH,
                fontSize: 12.5,
                letterSpacing: 2,
                fontWeight: 600,
              }}
            >
              {ctaLabel}
              <Icon name="arrow-right" size={14} />
            </span>
          </div>
        </div>
      )}
    />
  );
}
