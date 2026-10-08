"use client";

/* The owner's phone, Viber, Messenger and email as a tappable list.
 *
 * Shown wherever the next step is a conversation with the owner rather than
 * a form — a refund after the resort cancelled is arranged that way. The
 * details themselves live in RESORT_CONTACT (lib/resort.ts). */

import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { contactChannels, type ContactChannel } from "@/lib/resort";
import { Icon, type IconName } from "@/components/common/Icon";

const ICONS: Record<ContactChannel["kind"], IconName> = {
  phone: "phone",
  viber: "phone",
  messenger: "message",
  email: "mail",
};

export function ResortContact({ mailSubject }: { mailSubject?: string }) {
  const { isDark } = useTheme();
  const C = T(isDark);

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      {contactChannels(mailSubject).map((c, i) => (
        <li
          key={c.kind}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}
        >
          <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0 }}>
            <Icon name={ICONS[c.kind]} size={15} strokeWidth={1.5} />
          </span>
          <span style={{ color: C.textS, fontSize: 12.5, minWidth: 96 }}>{c.label}</span>
          {c.href ? (
            <a
              href={c.href}
              target={c.href.startsWith("http") ? "_blank" : undefined}
              rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
              style={{ color: C.textH, fontSize: 14, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, overflowWrap: "anywhere" }}
            >
              {c.value}
            </a>
          ) : (
            <span style={{ color: C.textH, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{c.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
