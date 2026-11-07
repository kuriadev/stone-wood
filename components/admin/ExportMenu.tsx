"use client";

// ── "Export ▾": every admin screen's way out to a file, in one design
//
// The look Bookings started with: a ghost button with a download icon, the
// word "Export" and a chevron, opening a short menu (Excel, CSV, print /
// PDF, and sometimes more). Reports, Payments & Expenses and Activity
// History use the same, so staff find their exports in the same place.

import { Fragment, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { ActionButton } from "@/components/admin/ui";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ExportItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  /** A line above this item, to set it apart (print, import). */
  divider?: boolean;
}

export function ExportMenu({ items, busy = false, disabled = false, label = "Export", ariaLabel, size = "md", style }: {
  items: ExportItem[];
  /** While a file is being made: the button reads "Preparing…". */
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  /** To match the buttons beside it (Reports' header row is 40px tall). */
  style?: CSSProperties;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionButton icon="download" size={size} disabled={busy || disabled} aria-label={ariaLabel ?? label} style={style}>
          {busy ? "Preparing…" : label} <Icon name="chevron-down" size={14} />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ minWidth: 230 }}>
        {items.map((it) => (
          <Fragment key={it.label}>
            {it.divider && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={it.onSelect}><Icon name={it.icon ?? "download"} />{it.label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
