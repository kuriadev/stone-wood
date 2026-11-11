"use client";

/* "Why it's awaiting approval": the reasons an online booking couldn't be
 * confirmed by itself (lib/reviewReasons.ts), shown wherever the admin
 * decides on it: Accept, and Cancel (resort can't host). */

import { reviewReasons } from "@/lib/reviewReasons";
import { useAdminStyle } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";

export function ReviewReasonsNote({ notes }: { notes: string | null | undefined }) {
  const { C } = useAdminStyle();
  const reasons = reviewReasons(notes);
  if (reasons.length === 0) return null;
  return (
    <div role="note" style={{ border: "1px solid rgba(245,165,36,0.45)", background: "rgba(245,165,36,0.08)", borderRadius: 10, padding: "12px 14px" }}>
      <p style={{ margin: "0 0 8px", color: "#f5a524", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="alert" size={14} strokeWidth={2.2} /> Why it&apos;s awaiting approval
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
        {reasons.map((r, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.55 }}>
            <strong style={{ color: C.textH }}>{r.title}.</strong>{" "}
            <span style={{ color: C.textB }}>{r.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
