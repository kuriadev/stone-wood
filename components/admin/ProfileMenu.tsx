"use client";

/* The signed-in admin.
 *
 * It lives at the FOOT OF THE SIDEBAR, where it replaced a bare "SIGN OUT"
 * button: signing out is one account action among several, so it belongs in
 * the account menu rather than taking the only permanent slot down there.
 * `variant="sidebar"` is that full-width card (avatar, name, role, chevron);
 * `variant="bar"` is the original compact pill, kept for any header that
 * still wants one.
 *
 * This replaces a pill that did one thing — open the account modal — with the
 * menu that pattern is normally the entry point to: who you are signed in as,
 * then the handful of actions that belong to the account rather than to the
 * page you happen to be on.
 *
 * Built on the shadcn DropdownMenu already in components/ui, so focus
 * trapping, Escape, arrow-key roving and the outside-click close come from
 * Radix rather than from another hand-rolled popover.
 *
 * Every icon comes from the shared registry, which is Lucide's outline set at
 * one stroke weight. Nothing here mixes a filled glyph into an outline menu.
 */

import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { SPACE, TAP_MIN } from "@/lib/spacing";
import { Icon } from "@/components/common/Icon";
import type { IconName } from "@/components/common/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One stroke weight for every icon in this menu. */
const STROKE = 1.75;

interface ProfileMenuProps {
  onAccountSettings: () => void;
  onSignOut: () => void;
  /** "sidebar": a full-width card at the foot of the nav. "bar": a compact
   *  pill for a page header. */
  variant?: "sidebar" | "bar";
}

/** What the account is, under the username. Not a stored role — there is one
 *  account and it belongs to whoever runs the resort. */
const ROLE = "Resort manager";

export function ProfileMenu({ onAccountSettings, onSignOut, variant = "bar" }: ProfileMenuProps) {
  const { isDark, toggle } = useTheme();
  const C = T(isDark);

  // The username the admin actually signed in with, rather than the word
  // "Admin". Falls back to that if the request fails, so the menu is never
  // blank.
  const [username, setUsername] = useState("Admin");
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/account", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (alive && json?.success && json.username) setUsername(json.username);
      } catch {
        /* keep the fallback */
      }
    })();
    return () => { alive = false; };
  }, []);

  const initial = (username.trim()[0] ?? "A").toUpperCase();

  const avatar = (size: number) => (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `${gold}22`,
        border: `1px solid ${gold}66`,
        color: C.goldInk,
        fontSize: size * 0.42,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        letterSpacing: 0,
      }}
    >
      {initial}
    </span>
  );

  const item = (
    icon: IconName,
    text: string,
    onSelect: () => void,
    opts?: { danger?: boolean; hint?: string },
  ) => (
    <DropdownMenuItem
      onSelect={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACE.sm,
        minHeight: 40,
        padding: `0 ${SPACE.sm}px`,
        borderRadius: 8,
        fontSize: 13.5,
        color: opts?.danger ? C.dangerInk : C.textB,
        cursor: "pointer",
      }}
    >
      <Icon name={icon} size={16} strokeWidth={STROKE} />
      <span style={{ flex: 1 }}>{text}</span>
      {opts?.hint && (
        <span style={{ color: C.textXS, fontSize: 11.5 }}>{opts.hint}</span>
      )}
    </DropdownMenuItem>
  );

  const sidebarTrigger = (
    <button
      type="button"
      className="sw-gold-hover"
      aria-label={`Account menu for ${username}`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: SPACE.sm,
        minHeight: TAP_MIN,
        padding: `${SPACE.xs}px ${SPACE.sm}px`,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        background: "transparent",
        color: C.textB,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {avatar(34)}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block",
            color: C.textH,
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {username}
        </span>
        <span style={{ display: "block", color: C.textS, fontSize: 11.5, letterSpacing: 0 }}>{ROLE}</span>
      </span>
      <Icon name="chevron-down" size={15} strokeWidth={STROKE} style={{ flexShrink: 0 }} />
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? sidebarTrigger : (
        <button
          type="button"
          className="sw-gold-hover"
          aria-label={`Account menu for ${username}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: SPACE.xs,
            minHeight: TAP_MIN,
            padding: `0 ${SPACE.sm}px 0 6px`,
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.textB,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {avatar(30)}
          <span
            style={{
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {username}
          </span>
          <Icon name="chevron-down" size={14} strokeWidth={STROKE} />
        </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={variant === "sidebar" ? "start" : "end"}
        side={variant === "sidebar" ? "top" : "bottom"}
        sideOffset={8}
        style={{
          minWidth: 248,
          padding: SPACE.xs,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: C.shadow,
        }}
      >
        {/* Who you are signed in as. Not an item — it does nothing. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACE.sm,
            padding: `${SPACE.sm}px ${SPACE.sm}px ${SPACE.md}px`,
          }}
        >
          {avatar(40)}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: C.textH,
                fontSize: 14,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {username}
            </div>
            <div style={{ color: C.textS, fontSize: 12 }}>{ROLE}</div>
          </div>
        </div>

        <DropdownMenuSeparator style={{ background: C.borderLight }} />

        {item("lock", "Username & password", onAccountSettings)}
        {item(isDark ? "sun" : "moon", isDark ? "Light theme" : "Dark theme", toggle)}
        {item("home", "View public site", () => window.open("/", "_blank", "noopener"))}

        <DropdownMenuSeparator style={{ background: C.borderLight }} />

        {item("logout", "Sign out", onSignOut, { danger: true })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
