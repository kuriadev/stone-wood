"use client";

// ── Activity: everything that happened, in one place
//
// The activity log, newest first: bookings made, confirmed, moved and
// cancelled; payments, refunds and voids; check-ins, inspections and
// settlements; closings; changes to rooms, packages, amenities, prices and
// the calendar; sign-ins. Each row says when, who (the owner, a guest, or
// the system), and what, in a sentence. The log can't be edited or deleted
// (the database refuses), which is what makes it an audit trail.
//
// Filters: a date range, a kind of activity, a booking reference, and words
// in the description. Export downloads what's shown as a spreadsheet.

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { downloadCsv, manilaDate } from "@/lib/finance";
import { gold } from "@/lib/styles";
import type { Activity } from "@/types/finance";
import { ACTOR_COLOR, fmtWhen } from "@/components/admin/BookingHistory";
import { PageHead, TableShell, Row, Cell, td, Btn, Pill, useAdminStyle, usePaged, Pager, FullSelect} from "@/components/admin/ui";

/** The part of an action before the dot, as the owner reads it. */
const CATEGORIES: { value: string; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "booking", label: "Bookings" },
  { value: "date_change", label: "Date changes" },
  { value: "stay", label: "Check-in, inspection, settle" },
  { value: "payment", label: "Payments" },
  { value: "refund", label: "Refunds" },
  { value: "expense", label: "Expenses" },
  { value: "day", label: "Daily closing" },
  { value: "facility", label: "Facilities and amenities" },
  { value: "rate", label: "Damage rates" },
  { value: "room", label: "Rooms" },
  { value: "package", label: "Packages" },
  { value: "inventory", label: "Inventory" },
  { value: "calendar", label: "Closed dates" },
  { value: "site", label: "Website (gallery, maintenance)" },
  { value: "message", label: "Customer messages" },
  { value: "email", label: "Emails" },
  { value: "guest", label: "Texts to guests" },
  { value: "security", label: "Sign-ins" },
];

export function ActivityTab({ mob, onOpenBooking }: { mob: boolean; onOpenBooking?: (id: string) => void }) {
  const { C, rowBg, inp } = useAdminStyle();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [booking, setBooking] = useState("");
  const [words, setWords] = useState("");
  const [rows, setRows] = useState<Activity[]>([]);
  const paged = usePaged(rows);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    setError("");
    const p = new URLSearchParams({ limit: "100" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (category) p.set("category", category);
    if (booking.trim()) p.set("booking", booking.trim().toUpperCase());
    if (words.trim()) p.set("q", words.trim());
    if (before) p.set("before", String(before));
    try {
      const res = await fetch(`/api/activity?${p}`);
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Couldn't load the activity log.");
      setRows((r) => (before ? [...r, ...(j.activity as Activity[])] : (j.activity as Activity[])));
      setMore(!!j.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the activity log.");
    } finally {
      setLoading(false);
    }
  }, [from, to, category, booking, words]);

  // Reload when a filter changes; typing in the text boxes waits a moment.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = () => downloadCsv(`StoneWood_Activity_${manilaDate()}.csv`, [
    ["When", "Who", "Action", "Booking", "What happened"],
    ...rows.map((a) => [fmtWhen(a.at), a.actor, a.action, a.bookingId ?? "", a.summary]),
  ]);

  const sel = { ...inp, padding: "8px 10px", width: "auto" } as const;
  const filtersOn = !!(from || to || category || booking || words);

  return (
    <div>
      <PageHead title="Activity" mob={mob} subtitle="Everything that happened, who did it and when. Entries can't be edited or deleted."
        action={<Btn icon="download" onClick={exportCsv} disabled={rows.length === 0}>Export</Btn>} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <Input value={words} onChange={(e) => setWords(e.target.value)} placeholder="Search the descriptions" aria-label="Search the activity" style={{ ...sel, flex: "1 1 220px" }} />
        <Input value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="Booking ref, e.g. SW-10023" aria-label="Booking reference" style={{ ...sel, width: 190 }} />
        <FullSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind of activity" style={{ ...sel, paddingRight: 38 }}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </FullSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" style={sel} />
        <span style={{ color: C.textS, fontSize: 13 }}>to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" style={sel} />
        {filtersOn && <Btn size="sm" onClick={() => { setFrom(""); setTo(""); setCategory(""); setBooking(""); setWords(""); }}>Clear</Btn>}
      </div>

      {error && <p style={{ color: "#e55", fontSize: 13.5 }}>{error}</p>}

      <TableShell head={["When", "Who", "What happened", "Booking"]} minWidth={760}
        empty={!loading && rows.length === 0 && !error ? (filtersOn ? "Nothing matches these filters." : "Nothing recorded yet.") : undefined}>
        {paged.rows.map((a, i) => (
          <Row key={a.id} style={{ background: rowBg(i) }}>
            <Cell style={{ ...td, color: C.textS, whiteSpace: "nowrap", fontSize: 12.5 }}>{fmtWhen(a.at)}</Cell>
            <Cell style={td}><Pill color={ACTOR_COLOR[a.actor]}>{a.actor}</Pill></Cell>
            <Cell style={{ ...td, color: C.textB }}>{a.summary}</Cell>
            <Cell style={{ ...td, whiteSpace: "nowrap" }}>
              {a.bookingId
                ? <button type="button" onClick={() => (onOpenBooking ? onOpenBooking(a.bookingId!) : setBooking(a.bookingId!))}
                    style={{ background: "none", border: "none", padding: 0, color: gold, fontFamily: "monospace", cursor: "pointer", fontSize: 13 }}>{a.bookingId}</button>
                : <span style={{ color: C.textS }}>—</span>}
            </Cell>
          </Row>
        ))}
      </TableShell>
      <Pager {...paged} noun="entries" />

      <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
        {loading ? <span style={{ color: C.textS, fontSize: 13 }}>Loading…</span>
          : more && <Btn onClick={() => void load(rows[rows.length - 1]?.id)}>Load older</Btn>}
      </div>
    </div>
  );
}
