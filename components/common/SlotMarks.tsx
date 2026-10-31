"use client";

// The tours already booked on a calendar date, as small icons above the
// day's number: a sun for a Day Tour, a moon for a Night Tour, a beach
// chair for a Staycation. Shared by the home page calendar and Book Now's.
//
// The row is always the same height, so a date with icons and one without
// keep their numbers on the same line.

import { Icon } from "@/components/common/Icon";
import { SLOTS } from "@/lib/resort";
import { SLOT_ICON } from "@/lib/utils";
import type { BookingSlot } from "@/types/booking";

const ORDER: BookingSlot[] = ["Day", "Night", "WholeDay"];

export function SlotMarks({ slots, size = 10 }: { slots?: Set<BookingSlot>; size?: number }) {
  return (
    <span aria-hidden="true" style={{ display: "flex", gap: 2, height: size, alignItems: "center", justifyContent: "center", opacity: 0.92 }}>
      {ORDER.filter((s) => slots?.has(s)).map((s) => (
        <Icon key={s} name={SLOT_ICON[s]} size={size} strokeWidth={2.25} />
      ))}
    </span>
  );
}

/** "Day Tour, Night Tour booked", for a screen reader. Empty when none. */
export function slotMarksLabel(slots?: Set<BookingSlot>): string {
  const names = ORDER.filter((s) => slots?.has(s)).map((s) => SLOTS[s].label);
  return names.length ? ` — ${names.join(", ")} booked` : "";
}

/** The key under a calendar: what each icon means. */
export function SlotMarksKey({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", alignItems: "center", marginTop: 8 }}>
      {ORDER.map((s) => (
        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, color, fontSize: 12 }}>
          <Icon name={SLOT_ICON[s]} size={13} />
          {SLOTS[s].label} booked
        </span>
      ))}
    </div>
  );
}
