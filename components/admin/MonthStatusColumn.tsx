"use client";

// ── One status column under the booking calendar
//
// A busy month put every booking of a status in one column, so Completed
// ran to 26 entries and the three columns ended up wildly different heights
// — the page scrolled past the calendar it belongs to, and the two short
// columns sat beside a very long one.
//
// Five rows are shown, the rest scroll. "View all" opens the column to a
// taller box that still scrolls rather than growing without limit, so the
// three columns stay the same height as each other whatever the month
// holds — measured at 392px each for 9, 0 and 26 bookings.

import { useState } from "react";
import { ActionButton, useAdminStyle } from "@/components/admin/ui";
import { fmtDate } from "@/lib/utils";
import { Icon } from "@/components/common/Icon";
import type { Booking } from "@/types/booking";

/** Rows visible before "View all". */
const PREVIEW = 5;
/** A row plus its gap, in px — what PREVIEW rows come to. */
const ROW = 57;

export function MonthStatusColumn({
  label, tone, rows, why,
}: {
  label: string;
  /** The status colour, for the dot and the dates. */
  tone: string;
  rows: Booking[];
  /** Why a booking is in this column, e.g. "Double booking" (Awaiting
   *  approval). Shown as small tags under the booking. */
  why?: (b: Booking) => string[];
}) {
  const { C, cBg, cBr } = useAdminStyle();
  const [expanded, setExpanded] = useState(false);
  const overflowing = rows.length > PREVIEW;

  return (
    <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "16px 16px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: tone, flexShrink: 0 }} />
        <span style={{ color: C.textH, fontSize: 13, fontWeight: 600, minWidth: 0 }}>{label}</span>
        <span style={{ color: C.textS, fontSize: 12, marginLeft: "auto", flexShrink: 0 }}>{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>None this month.</p>
      ) : (
        <>
          <div className="sw-thinscroll"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              /* A max, not a fixed height: the grid stretches the three
                 columns to match each other, and this stops a long month
                 being the one that decides how tall they all are.
                 Expanded is capped too — "view all" on 26 bookings should
                 not make the page four screens long. */
              maxHeight: expanded ? 480 : PREVIEW * ROW,
              overflowY: "auto",
              // A clear gap between the dates and the scrollbar, which sits
              // in the card's own padding rather than on the text.
              paddingRight: overflowing ? 14 : 0,
              marginRight: overflowing ? -8 : 0,
            }}
          >
            {rows.map((bk) => (
              <div key={bk.id} style={{ borderTop: `1px solid ${cBr}`, paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: C.textH, fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{bk.name}</span>
                  <span style={{ color: tone, fontSize: 11.5, whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(bk.date)}</span>
                </div>
                <div style={{ color: C.textS, fontSize: 12, marginTop: 4 }}>
                  {bk.guests} guest{bk.guests === 1 ? "" : "s"} ·{" "}
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{bk.id}</span>
                </div>
                {why && why(bk).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {why(bk).map((t) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, border: `1px solid ${tone}66`, color: tone, background: `${tone}14` }}>
                        <Icon name="alert" size={11} /> {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {overflowing && (
            <div style={{ display: "grid", marginTop: 12 }}>
              <ActionButton size="sm" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `View all (${rows.length})`}
              </ActionButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
