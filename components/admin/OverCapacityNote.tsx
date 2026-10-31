"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/common/Icon";
import { useAdminStyle } from "@/components/admin/ui";

/** The warning and tick-box shown when staff enter more guests than the
 *  resort's capacity (walk-in, or extra guests added on the day). Staff may
 *  go over on purpose -- the website never can -- but only after reading
 *  what it means. */
export function OverCapacityNote({ capacity, guests, checked, onChange }: {
  capacity: number;
  guests: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { C } = useAdminStyle();
  return (
    <div role="alert" style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(224,140,58,0.5)", background: "rgba(224,140,58,0.08)" }}>
      <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", color: C.textB, fontSize: 12.5, lineHeight: 1.5 }}>
        <Icon name="alert" size={15} style={{ color: "var(--sw-accent-copper)", flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>{guests} guests is {guests - capacity} over the resort&apos;s capacity of {capacity}.</strong>{" "}
          Only staff can allow this. Make sure the pool, chairs, food and staffing can take the larger group, and that
          other groups sharing the tour won&apos;t be crowded.
        </span>
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, color: C.textH, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        Allow more than {capacity} guests
      </label>
    </div>
  );
}
