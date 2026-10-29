"use client";

/* ── Live guest messages, on the Dashboard
 *
 * The full inbox lives in Guest Messages. This is the rail beside the day's
 * work: the owner sees a guest asking about Room 3 while they are checking
 * someone in, instead of finding it an hour later on another screen.
 *
 * It shows, archives and routes. It deliberately does NOT compose replies —
 * the reply window (templates, the /api/customer-reply send) belongs to
 * Guest Messages, and a second copy of it here would be a second thing to
 * keep correct. "Reply" opens that message there.
 *
 * Styling goes through T(isDark) and the --sw-* tokens like the rest of the
 * admin, so the panel is right in both themes rather than only the dark one.
 */

import { useMemo, useState } from "react";
import { useAdminStyle, ActionButton, FilterSelect } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import { fmtDate } from "@/lib/utils";
import type { CustomerMessage } from "@/types/admin";
import type { Booking } from "@/types/booking";

/** Stored value → what the owner reads. Matches Guest Messages exactly. */
const TYPE_LABEL: Record<string, string> = {
  Inquiry: "Question",
  Feedback: "Feedback",
  Complaint: "Concern",
  Refund: "Refund request",
  Suggestion: "Suggestion",
  Other: "Other",
};

/** The chips, in the order the owner asked for them. These four always show,
 *  even at zero, so the row does not jump about as messages arrive. */
const CHIPS = ["Refund", "Inquiry", "Feedback", "Complaint"] as const;

const TYPE_COLOR: Record<string, string> = {
  Refund: "#e07a3a",
  Inquiry: "#4a9fd4",
  Feedback: "#2e9e4e",
  Complaint: "#e55",
  Suggestion: "#9a7bd0",
  Other: "#8a7a66",
};

interface GuestMessagesPanelProps {
  messages: CustomerMessage[];
  onArchive: (m: CustomerMessage) => void;
  onRestore: (m: CustomerMessage) => void;
  /** Opens this message in the full Guest Messages screen. */
  onReply: (m: CustomerMessage) => void;
  onOpenAll: () => void;
  /** The booking a message is about, when one can be worked out. */
  bookingFor: (m: CustomerMessage) => Booking | null;
  mob: boolean;
}

export function GuestMessagesPanel({
  messages, onArchive, onRestore, onReply, onOpenAll, bookingFor, mob,
}: GuestMessagesPanelProps) {
  const { C, cBg, cBr, soft } = useAdminStyle();
  const [view, setView] = useState<"inbox" | "archive">("inbox");
  const [type, setType] = useState<string>("All");

  const inbox = useMemo(() => messages.filter((m) => !m.archivedAt), [messages]);
  const archived = useMemo(() => messages.filter((m) => !!m.archivedAt), [messages]);
  const base = view === "inbox" ? inbox : archived;
  const shown = type === "All" ? base : base.filter((m) => m.type === type);

  const countOf = (t: string) => base.filter((m) => m.type === t).length;

  return (
    <section
      aria-labelledby="dash-messages"
      style={{ border: `1px solid ${cBr}`, borderRadius: 12, background: cBg, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flex: 1 }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${cBr}` }}>
        <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, background: soft, border: `1px solid ${cBr}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}>
          <Icon name="message" size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="dash-messages" style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.textH }}>Live guest messages</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#2e9e4e", flexShrink: 0 }} />
            <span style={{ color: C.textS, fontSize: 12 }}>New messages show up here on their own</span>
          </div>
        </div>
        {inbox.length > 0 && (
          <span style={{ padding: "4px 8px", borderRadius: 10, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", background: "rgba(74,159,212,0.18)", color: "#4a9fd4" }}>
            {inbox.length} new
          </span>
        )}
      </div>

      {/* ── Inbox / Archive, then the type: two selects instead of seven
          pills over three lines. ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "12px 16px 12px" }}>
        <FilterSelect<typeof view>
          label="Box"
          value={view}
          onChange={setView}
          menuWidth={200}
          fullWidthOnPhone={false}
          options={[
            { value: "inbox", label: "Inbox", count: inbox.length },
            { value: "archive", label: "Archive", count: archived.length },
          ]}
        />
        <FilterSelect<typeof type>
          label="Type"
          value={type}
          onChange={setType}
          menuWidth={220}
          fullWidthOnPhone={false}
          options={[
            { value: "All" as typeof type, label: "All messages", count: base.length },
            ...CHIPS.map((t) => ({ value: t as typeof type, label: TYPE_LABEL[t], count: countOf(t) })),
          ]}
        />
      </div>

      {/* ── The feed ── */}
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, overflowY: mob ? "visible" : "auto", minHeight: 0 }}>
        {shown.length === 0 ? (
          <p style={{ color: C.textS, fontSize: 13, margin: 0, padding: "20px 0", textAlign: "center" }}>
            {view === "inbox" ? "No messages waiting." : "Nothing archived yet."}
          </p>
        ) : shown.map((m) => {
          const colour = TYPE_COLOR[m.type] ?? "#8a7a66";
          const booking = bookingFor(m);
          return (
            <article
              key={m.id}
              style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                {!m.archivedAt && (
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: colour, flexShrink: 0, marginTop: 6 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>{m.name}</div>
                  <div style={{ color: C.textXS, fontSize: 11.5, overflowWrap: "anywhere" }}>
                    {m.email}{m.date ? ` · ${m.date}` : ""}
                  </div>
                </div>
                <span style={{
                  padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                  textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
                  background: `color-mix(in srgb, ${colour} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${colour} 40%, transparent)`,
                  color: colour,
                }}>
                  {TYPE_LABEL[m.type] ?? m.type}
                </span>
              </div>

              {/* Which booking this is about, when it can be worked out from
                  the SW- reference in the text or the sender's address. */}
              {booking && (
                <span style={{
                  alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "3px 8px", borderRadius: 7, background: soft, border: `1px solid ${cBr}`,
                  color: C.goldInk, fontSize: 11.5, fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap",
                }}>
                  <Icon name="calendar" size={11} />
                  {booking.id} · {fmtDate(booking.date)}
                </span>
              )}

              <p style={{ color: C.textB, fontSize: 13, lineHeight: 1.6, margin: 0, overflowWrap: "anywhere" }}>{m.message}</p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <ActionButton size="sm" kind="primary" icon="mail" onClick={() => onReply(m)}>Reply</ActionButton>
                {m.archivedAt
                  ? <ActionButton size="sm" onClick={() => onRestore(m)}>Restore</ActionButton>
                  : <ActionButton size="sm" onClick={() => onArchive(m)}>Archive</ActionButton>}
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button" onClick={onOpenAll}
        style={{ width: "100%", padding: 10, borderTop: `1px solid ${cBr}`, borderRight: "none", borderBottom: "none", borderLeft: "none", background: soft, color: C.goldInk, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
      >
        Open all messages <Icon name="arrow-right" size={13} />
      </button>
    </section>
  );
}
