"use client";

// ── Audit Log: everything that happened, in one place
//
// (The tab id is still "Activity", and the table activity_log; only the
// name the owner reads changed.)
//
// The activity log, newest first: bookings made, confirmed, moved and
// cancelled; payments, refunds and voids; check-ins, inspections and
// settlements; closings; changes to rooms, packages, amenities, prices and
// the calendar; sign-ins. Each row says when, who (the owner, a guest, or
// the system), and what, in a sentence. The log can't be edited or deleted
// (the database refuses), which is what makes it an audit trail.
//
// Filters: a date range, who did it, a kind of activity, a booking
// reference, and words in the description. Export downloads what's shown as
// a spreadsheet.

import { adminTabLabel } from "@/lib/labels";
import { useStaff } from "@/contexts/StaffContext";
import { ROLE_LABEL, type StaffRole } from "@/lib/permissions";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { downloadCsv, manilaDate } from "@/lib/finance";
import { gold } from "@/lib/styles";
import type { Activity } from "@/types/finance";
import { ACTOR_COLOR, fmtWhen } from "@/components/admin/BookingHistory";
import { AdminPageHeader, TableShell, Row, Cell, td, ActionButton, StatusBadge, useAdminStyle, usePaged, Pager, FullSelect, FilterBar, FilterField, DateRange } from "@/components/admin/ui";

/** The part of an action before the dot, as the owner reads it. */
const CATEGORIES: { value: string; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "booking", label: "Bookings" },
  { value: "date_change", label: "Reschedules" },
  { value: "stay", label: "Check-in, inspection, closing" },
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
  { value: "request", label: "Requests to the super admin" },
  { value: "staff", label: "Staff accounts" },
  { value: "upkeep", label: "Upkeep tasks" },
  { value: "settings", label: "Rates & settings" },
];

/** Who did it: the owner, a guest on the website, or the system itself
 *  (a deadline passing, an online payment arriving). */
const ACTORS: { value: "" | Activity["actor"]; label: string }[] = [
  { value: "", label: "Anyone" },
  { value: "Admin", label: "Staff (any)" },
  { value: "Guest", label: "Guests" },
  { value: "System", label: "The system" },
];

export function ActivityTab({ mob, onOpenBooking }: { mob: boolean; onOpenBooking?: (id: string) => void }) {
  const { C, rowBg, inp } = useAdminStyle();
  /* The owner audits everyone: pick one person to see everything they did.
     Everyone else sees their own lines (the server decides, /api/activity). */
  const staff = useStaff();
  const isOwner = staff.can("activity.viewAll");
  const [people, setPeople] = useState<{ id: string; name: string; role: StaffRole; active: boolean }[]>([]);
  const [person, setPerson] = useState("");
  useEffect(() => {
    if (!isOwner || !staff.staffEnabled) return;
    void fetch("/api/staff", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j?.success) setPeople(j.staff ?? []);
    }).catch(() => {});
  }, [isOwner, staff.staffEnabled]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState("");
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
    if (actor) p.set("actor", actor);
    if (person) p.set("staff", person);
    if (booking.trim()) p.set("booking", booking.trim().toUpperCase());
    if (words.trim()) p.set("q", words.trim());
    if (before) p.set("before", String(before));
    try {
      const res = await fetch(`/api/activity?${p}`);
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Couldn't load the audit log.");
      setRows((r) => (before ? [...r, ...(j.activity as Activity[])] : (j.activity as Activity[])));
      setMore(!!j.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the audit log.");
    } finally {
      setLoading(false);
    }
  }, [from, to, category, actor, person, booking, words]);

  // Reload when a filter changes; typing in the text boxes waits a moment.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = () => downloadCsv(`StoneWood_Audit_Log_${manilaDate()}.csv`, [
    ["When", "Who", "Action", "Booking", "What happened"],
    ...rows.map((a) => [fmtWhen(a.at), a.staffName ?? a.actor, a.action, a.bookingId ?? "", a.summary]),
  ]);

  const sel = { ...inp, padding: "8px 12px", width: "auto" } as const;
  const filtersOn = !!(from || to || category || actor || person || booking || words);

  return (
    <div>
      <AdminPageHeader title={adminTabLabel("Activity")} mob={mob}
        subtitle={isOwner
          ? "Everything that happened, who did it and when — every staff member's actions included. Entries can't be edited or deleted."
          : "What you've done, and the full history of any booking you look up. Entries can't be edited or deleted."}
        action={<ActionButton icon="download" onClick={exportCsv} disabled={rows.length === 0}>Download CSV</ActionButton>} />

      <FilterBar
        active={[!!booking, !!actor, !!person, !!category, !!from || !!to].filter(Boolean).length}
        onClear={() => { setFrom(""); setTo(""); setCategory(""); setActor(""); setPerson(""); setBooking(""); }}
        search={<Input value={words} onChange={(e) => setWords(e.target.value)} placeholder="Search the descriptions" aria-label="Search the audit log" style={{ ...sel, width: "100%" }} />}
      >
        <FilterField label="Booking">
          <Input value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="e.g. SW-10023" aria-label="Booking reference" style={{ ...sel, width: "100%" }} />
        </FilterField>
        <FilterField label="Who">
          <FullSelect value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Who did it" style={{ ...sel, width: "100%", paddingRight: 40 }}>
            {ACTORS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </FullSelect>
        </FilterField>
        {isOwner && people.length > 0 && (
          <FilterField label="Person">
            <FullSelect value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" style={{ ...sel, width: "100%", paddingRight: 40 }}>
              <option value="">Every person</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.role]}){p.active ? "" : " — deactivated"}</option>)}
            </FullSelect>
          </FilterField>
        )}
        <FilterField label="Kind of activity">
          <FullSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind of activity" style={{ ...sel, width: "100%", paddingRight: 40 }}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </FullSelect>
        </FilterField>
        <FilterField label="Dates" wide>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </FilterField>
      </FilterBar>

      {error && <p style={{ color: C.dangerInk, fontSize: 13.5 }}>{error}</p>}

      <TableShell head={["When", "Who", "What happened", "Booking"]} minWidth={760}
        empty={!loading && rows.length === 0 && !error ? (filtersOn ? "Nothing matches these filters." : "Nothing recorded yet.") : undefined}>
        {paged.rows.map((a, i) => (
          <Row key={a.id} style={{ background: rowBg(i) }}>
            <Cell style={{ ...td, color: C.textS, whiteSpace: "nowrap", fontSize: 12.5 }}>{fmtWhen(a.at)}</Cell>
            <Cell style={td}><StatusBadge color={ACTOR_COLOR[a.actor]}>{a.staffName ?? a.actor}</StatusBadge></Cell>
            <Cell style={{ ...td, color: C.textB }}>{a.summary}</Cell>
            <Cell style={{ ...td, whiteSpace: "nowrap" }}>
              {a.bookingId
                ? <button type="button" onClick={() => (onOpenBooking ? onOpenBooking(a.bookingId!) : setBooking(a.bookingId!))}
                    style={{ background: "none", border: "none", padding: 0, color: C.goldInk, fontFamily: "monospace", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{a.bookingId}</button>
                : <span style={{ color: C.textS }}>—</span>}
            </Cell>
          </Row>
        ))}
      </TableShell>
      <Pager {...paged} noun="entries" />

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        {loading ? <span style={{ color: C.textS, fontSize: 13 }}>Loading…</span>
          : more && <ActionButton onClick={() => void load(rows[rows.length - 1]?.id)}>Load older</ActionButton>}
      </div>
    </div>
  );
}
