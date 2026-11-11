"use client";

/* "Up to N guests" on a room, as a gold pill with the people icon, so the
 * limit stands out from the bed list beside it instead of trailing it. */

import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { Icon } from "@/components/common/Icon";

export function GuestCapBadge({ n, size = 12.5 }: { n: number; size?: number }) {
  const { isDark } = useTheme();
  const C = T(isDark);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        background: "rgba(201,168,76,0.14)",
        border: "1px solid rgba(201,168,76,0.45)",
        color: C.goldInk,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        verticalAlign: "middle",
      }}
    >
      <Icon name="users" size={size + 0.5} strokeWidth={2} />
      Up to {n} guests
    </span>
  );
}
