"use client";

/* A Dashboard panel's header that folds the panel away, like a dropdown.
 * The whole header is the button; the arrow on the right says which way it
 * will go. Open by default, and each person's choice is remembered on this
 * browser. Folding only tucks the list away: the header and its count stay. */

import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { useAdminStyle } from "@/components/admin/ui";
import { useStaff } from "@/contexts/StaffContext";

export function useFold(name: string): [boolean, () => void] {
  const { me } = useStaff();
  const key = `sw_fold:${name}:${me?.id ?? "me"}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v !== null) setOpen(v === "1"); } catch { /* storage off */ }
  }, [key]);
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* private mode */ }
    return !o;
  });
  return [open, toggle];
}

export function FoldHeader({ id, icon, iconColor, title, folded, open, onToggle }: {
  /** The heading's id, for the section's aria-labelledby. */
  id: string;
  icon: IconName;
  iconColor: string;
  title: ReactNode;
  /** A short summary shown beside the title while folded. */
  folded?: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const { C, cBr } = useAdminStyle();
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`${id}-body`} className="sw-hit"
      style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <Icon name={icon} size={17} style={{ color: iconColor, flexShrink: 0 }} />
      <h2 id={id} style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textH, flex: 1, minWidth: 0 }}>
        {title}
        {!open && folded && <span style={{ color: C.textS, fontWeight: 400, fontSize: 13 }}> · {folded}</span>}
      </h2>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${cBr}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.textB, flexShrink: 0 }}>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </span>
      <span className="sr-only">{open ? "Fold away" : "Show"}</span>
    </button>
  );
}
