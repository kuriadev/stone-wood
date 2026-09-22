"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, outBtn } from "@/lib/styles";
import type { Facility, FacilityStatus } from "@/types/facility";
import type { Booking } from "@/types/booking";
import { Icon } from "@/components/admin/Icon";
import { startOfToday, toDateStr } from "@/lib/validators";

interface FacilitiesTabProps {
  facilities: Facility[];
  setFacilities: React.Dispatch<React.SetStateAction<Facility[]>>;
  bookings: Booking[];
  mob: boolean;
}

const STATUS_COLOR: Record<FacilityStatus, string> = {
  "Available": "#4caf50",
  "In Use": "#4a9fd4",
  "Needs Cleaning": "#e0a020",
  "Under Maintenance": "#c0392b",
};

// Sensible defaults so every facility shows useful guidance even before
// staff has customized its checklist — editable per-facility below.
const DEFAULT_BEFORE: Record<string, string[]> = {
  "Swimming Pool": ["Check chlorine/pH levels", "Skim leaves & debris", "Test water clarity", "Check lifebuoys & signage are in place"],
  "Events Venue": ["Sweep & arrange chairs/tables", "Test sound system & lights", "Check restrooms are stocked", "Confirm decor/setup matches booking"],
  Room: ["Change linens & towels", "Check A/C & lights work", "Restock toiletries & water", "Inspect for damage from prior guest"],
};
const DEFAULT_AFTER: Record<string, string[]> = {
  "Swimming Pool": ["Skim leaves & floating trash", "Re-check chlorine/pH levels", "Return floats & equipment to storage", "Note any damage or needed repairs"],
  "Events Venue": ["Clear trash & leftover food", "Return chairs/tables to storage layout", "Check for damage to fixtures", "Turn off sound system & lights"],
  Room: ["Strip & send linens to laundry", "Check for left-behind guest items", "Inspect for damage", "Restock for next reservation"],
};

export function FacilitiesTab({ facilities, setFacilities, bookings, mob }: FacilitiesTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const [editNotesId, setEditNotesId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [checklistEditor, setChecklistEditor] = useState<{ id: number; which: "before" | "after" } | null>(null);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  // Page-level view — the per-facility HISTORY dropdown below stays for a
  // quick "what's used this one" glance, while this toggle gives the admin
  // a dedicated place to browse every facility's reservation history at
  // once, filterable by facility and searchable by guest/ID.
  const [pageView, setPageView] = useState<"checklist" | "history">("checklist");
  const [historyFacility, setHistoryFacility] = useState<number | "all">("all");
  const [historySearch, setHistorySearch] = useState("");

  const cBg = isDark ? "#0c0b09" : "#ffffff";
  const cBr = isDark ? "#1a1714" : "#e4ddd1";

  const counts = (["Available", "In Use", "Needs Cleaning", "Under Maintenance"] as FacilityStatus[]).map(
    (s) => [s, facilities.filter((f) => f.status === s).length] as [FacilityStatus, number]
  );

  const setStatus = (id: number, status: FacilityStatus) => {
    setFacilities((fs) => fs.map((f) => {
      if (f.id !== id) return f;
      const next: Facility = { ...f, status };
      if (status === "Available") next.lastCheckedAt = new Date().toISOString();
      return next;
    }));
    const f = facilities.find((x) => x.id === id);
    if (f) {
      const msg = status === "Under Maintenance"
        ? `${f.name} marked "Under Maintenance" — it will no longer be bookable online or via Walk-In.`
        : `${f.name} marked "${status}".`;
      toast(msg, status === "Available" ? "success" : status === "Under Maintenance" ? "warning" : "info");
    }
  };

  const openNotes = (f: Facility) => { setEditNotesId(f.id); setNotesDraft(f.notes); };
  const saveNotes = () => {
    setFacilities((fs) => fs.map((f) => f.id === editNotesId ? { ...f, notes: notesDraft } : f));
    setEditNotesId(null);
  };

  const checklistKey = (f: Facility) => f.category === "Room" ? "Room" : f.name;
  const getChecklist = (f: Facility, which: "before" | "after") => {
    const custom = which === "before" ? f.beforeUseChecklist : f.afterUseChecklist;
    return custom ?? (which === "before" ? DEFAULT_BEFORE : DEFAULT_AFTER)[checklistKey(f)] ?? [];
  };
  const openChecklistEditor = (f: Facility, which: "before" | "after") => {
    setChecklistEditor({ id: f.id, which });
    setChecklistDraft(getChecklist(f, which).join("\n"));
  };
  const saveChecklist = () => {
    if (!checklistEditor) return;
    const lines = checklistDraft.split("\n").map((s) => s.trim()).filter(Boolean);
    setFacilities((fs) => fs.map((f) => f.id === checklistEditor.id
      ? { ...f, [checklistEditor.which === "before" ? "beforeUseChecklist" : "afterUseChecklist"]: lines }
      : f));
    setChecklistEditor(null);
  };

  const fmtWhen = (iso?: string | null) => {
    if (!iso) return "Never checked";
    return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  // Which of today's reservations actually use this facility — ties the
  // before/after guidance to real customer bookings instead of being
  // generic advice divorced from what's actually happening today.
  // Local date, not UTC: toISOString() reports the previous day in Manila
  // (UTC+8) from midnight until 8am, which would mis-scope "today".
  const todayStr = toDateStr(startOfToday());
  const todaysActive = bookings.filter((b) => b.date === todayStr && b.status !== "Cancelled");
  const reservationsFor = (f: Facility): Booking[] => {
    if (f.category === "Room") {
      return todaysActive.filter((b) => b.rooms.includes(f.roomId ?? -1));
    }
    if (f.name === "Swimming Pool") {
      return todaysActive.filter((b) => (b.resource ?? "Pool") !== "Venue");
    }
    if (f.name === "Events Venue") {
      return todaysActive.filter((b) => b.resource === "Venue" || b.resource === "Pool+Venue");
    }
    return [];
  };

  // Full reservation history for a facility — every booking (any date,
  // any status, including archived) that used it, newest first, so the
  // admin can see who reserved it and what they used beyond just today.
  const matchesFacility = (f: Facility, b: Booking): boolean => {
    if (f.category === "Room") return b.rooms.includes(f.roomId ?? -1);
    if (f.name === "Swimming Pool") return (b.resource ?? "Pool") !== "Venue";
    if (f.name === "Events Venue") return b.resource === "Venue" || b.resource === "Pool+Venue";
    return false;
  };
  const historyFor = (f: Facility): Booking[] =>
    bookings
      .filter((b) => matchesFacility(f, b))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));

  const historyStatusColor: Record<string, string> = {
    Paid: "#f5c518", Confirmed: "#4caf50", Completed: "#4a9fd4", Cancelled: "#c0392b",
  };

  // Combined reservation history across every facility, for the dedicated
  // "RESERVATION HISTORY" page view — one row per (facility, booking) pair,
  // newest first, optionally narrowed to a single facility or search term.
  type HistoryRow = { booking: Booking; facility: Facility };
  const allHistoryRows: HistoryRow[] = facilities
    .flatMap((f) => historyFor(f).map((booking) => ({ booking, facility: f })))
    .sort((a, b) => (a.booking.date < b.booking.date ? 1 : a.booking.date > b.booking.date ? -1 : (b.booking.createdAt ?? 0) - (a.booking.createdAt ?? 0)));

  const hq = historySearch.toLowerCase().trim();
  const filteredHistoryRows = allHistoryRows.filter((row) => {
    if (historyFacility !== "all" && row.facility.id !== historyFacility) return false;
    if (!hq) return true;
    return (
      row.booking.name.toLowerCase().includes(hq) ||
      row.booking.id.toLowerCase().includes(hq) ||
      row.booking.package.toLowerCase().includes(hq) ||
      row.facility.name.toLowerCase().includes(hq)
    );
  });

  const groups: { label: string; items: Facility[] }[] = [
    { label: "RESORT AMENITIES", items: facilities.filter((f) => f.category === "Amenity") },
    { label: "ROOMS", items: facilities.filter((f) => f.category === "Room") },
  ];

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>CARETAKER CHECKLIST</p>
        <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Facilities</h2>
        <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>
          Automatically flagged "Needs Cleaning" when a booking using them is marked Completed. Marking a facility
          <strong style={{ color: "#e55" }}> "Under Maintenance" </strong>
          hides it from customers on both Online Booking and Walk-In immediately.
        </p>
      </div>

      {/* Checklist / Reservation History page toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {([
          { key: "checklist", label: "CARETAKER CHECKLIST" },
          { key: "history", label: `RESERVATION HISTORY (${allHistoryRows.length})` },
        ] as const).map((v) => (
          <button
            key={v.key}
            onClick={() => setPageView(v.key)}
            style={{ padding: "8px 18px", fontSize: 12.5, fontWeight: 700, borderRadius: 20, cursor: "pointer", letterSpacing: 1, background: pageView === v.key ? `${gold}18` : "transparent", color: pageView === v.key ? gold : C.textS, border: `1px solid ${pageView === v.key ? gold + "55" : cBr}` }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {pageView === "history" ? (
        <div>
          <p style={{ color: C.textS, fontSize: 13.5, marginBottom: 18, lineHeight: 1.6 }}>
            Every reservation that has used a facility or room, across all statuses — filter by facility or search by guest, ID, or package to see what a given reservation used.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <select
              value={historyFacility === "all" ? "all" : String(historyFacility)}
              onChange={(e) => setHistoryFacility(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="sw-input"
              style={{ ...C.inp, borderRadius: 6, width: mob ? "100%" : 240 }}
            >
              <option value="all">All facilities</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search by guest, ID, or package…"
              className="sw-input"
              style={{ ...C.inp, borderRadius: 6, flex: 1, minWidth: mob ? "100%" : 260 }}
            />
          </div>
          <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                    {["Date", "Facility", "Guest", "Package", "Guests", "Food Used", "Status"].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", color: C.textXS, fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryRows.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.textXS, fontSize: 13.5 }}>No reservations match.</td></tr>
                  )}
                  {filteredHistoryRows.map((row, idx) => (
                    <tr key={`${row.facility.id}-${row.booking.id}`} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#090909" : "#080808") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                      <td style={{ padding: "10px 12px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{row.booking.date}</td>
                      <td style={{ padding: "10px 12px", color: C.textH, fontSize: 13.5, whiteSpace: "nowrap" }}>{row.facility.icon} {row.facility.name}</td>
                      <td style={{ padding: "10px 12px", color: C.textH, fontSize: 13.5 }}>
                        {row.booking.name} {row.booking.archived && <span style={{ color: C.textXS, fontSize: 10.5 }}>(archived)</span>}
                      </td>
                      <td style={{ padding: "10px 12px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{row.booking.package}</td>
                      <td style={{ padding: "10px 12px", color: C.textS, fontSize: 12.5 }}>{row.booking.guests}</td>
                      <td style={{ padding: "10px 12px", color: C.textS, fontSize: 12.5 }}>
                        {row.booking.foodOrder && row.booking.foodOrder.length > 0
                          ? row.booking.foodOrder.map((it) => `${it.name} ×${it.qty}`).join(", ")
                          : <span style={{ color: C.textXS, fontStyle: "italic" }}>None</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11.5 }}>
                        <span style={{ background: `${historyStatusColor[row.booking.status] ?? gold}18`, color: historyStatusColor[row.booking.status] ?? gold, padding: "3px 8px", borderRadius: 20, border: `1px solid ${historyStatusColor[row.booking.status] ?? gold}44`, letterSpacing: 1, whiteSpace: "nowrap" }}>{row.booking.status.toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: mob ? 10 : 14, marginBottom: 28 }}>
        {counts.map(([s, v]) => (
          <div key={s} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? "14px 12px" : "18px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: STATUS_COLOR[s] }} />
            <div style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 1.5, marginBottom: 8 }}>{s.toUpperCase()}</div>
            <div style={{ color: STATUS_COLOR[s], fontSize: mob ? 22 : 28, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>{v}</div>
          </div>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 28 }}>
          <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 12 }}>{g.label}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {g.items.map((f) => {
              const linkedBooking = f.lastUsedBookingId ? bookings.find((b) => b.id === f.lastUsedBookingId) : null;
              const todaysReservations = reservationsFor(f);
              const expanded = expandedId === f.id;
              const history = historyId === f.id;
              return (
                <div key={f.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ color: C.textH, fontSize: 15, fontWeight: 600 }}>{f.name}</span>
                        <span style={{ background: `${STATUS_COLOR[f.status]}18`, color: STATUS_COLOR[f.status], fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: `1px solid ${STATUS_COLOR[f.status]}44`, letterSpacing: 1 }}>{f.status.toUpperCase()}</span>
                        {todaysReservations.length > 0 && (
                          <span style={{ background: "rgba(76,175,80,0.1)", color: "#4caf50", fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(76,175,80,0.25)", letterSpacing: 1 }}>
                            {todaysReservations.length} reservation{todaysReservations.length > 1 ? "s" : ""} today
                          </span>
                        )}
                      </div>
                      <div style={{ color: C.textS, fontSize: 12.5 }}>
                        {linkedBooking ? <>Last used by <strong style={{ color: C.textH }}>{f.lastUsedGuestName}</strong> ({f.lastUsedBookingId})</> : "No usage recorded yet"}
                        {" · "}Checked: {fmtWhen(f.lastCheckedAt)}
                      </div>
                      {editNotesId === f.id ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <input value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Notes (e.g. pool filter needs replacing)" className="sw-input" style={{ ...C.inp, borderRadius: 6, flex: 1 }} />
                          <button onClick={saveNotes} style={{ ...outBtn, padding: "6px 12px", fontSize: 11.5 }}>SAVE</button>
                        </div>
                      ) : (
                        <div onClick={() => openNotes(f)} style={{ color: f.notes ? C.textB : C.textXS, fontSize: 12.5, marginTop: 6, cursor: "pointer", fontStyle: f.notes ? "normal" : "italic" }}>
                          {f.notes || "+ add note"}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => setExpandedId(expanded ? null : f.id)} style={{ background: "transparent", color: gold, border: `1px solid ${gold}44`, padding: "6px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}>
                        {expanded ? "HIDE CHECKLIST ▲" : "CHECKLIST ▼"}
                      </button>
                      <button onClick={() => setHistoryId(history ? null : f.id)} style={{ background: "transparent", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.4)", padding: "6px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}>
                        {history ? "HIDE HISTORY ▲" : `HISTORY (${historyFor(f).length}) ▼`}
                      </button>
                      {f.status !== "Available" && (
                        <button onClick={() => setStatus(f.id, "Available")} style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.25)", padding: "6px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}><Icon name="check" size={12} style={{ marginRight: 5 }} />MARK CHECKED</button>
                      )}
                      {f.status !== "In Use" && (
                        <button onClick={() => setStatus(f.id, "In Use")} style={{ background: "rgba(74,159,212,0.08)", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.25)", padding: "6px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}>IN USE</button>
                      )}
                      {f.status !== "Under Maintenance" && (
                        <button onClick={() => setStatus(f.id, "Under Maintenance")} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "6px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}>MAINTENANCE</button>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${cBr}`, display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                      {/* Before use */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <p style={{ color: gold, fontSize: 11.5, letterSpacing: 2, margin: 0 }}>BEFORE USE</p>
                          <button
                            onClick={() => openChecklistEditor(f, "before")}
                            aria-label={`Edit the before-use checklist for ${f.name}`}
                            title="Edit checklist"
                            style={{
                              background: "none",
                              border: "none",
                              color: C.textXS,
                              cursor: "pointer",
                              padding: 0,
                              // A square box round a 14px glyph gives the icon a
                              // real click target without it reading as a second
                              // button next to the heading.
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 24,
                              height: 24,
                              // Hit area is 24px; layout height stays 14px to
                              // match the glyph, so the heading row does not
                              // grow taller than the pencil-less third column
                              // and push its list out of alignment.
                              margin: "-5px 0",
                              borderRadius: 5,
                              transition: "color .18s ease, background .18s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = gold; e.currentTarget.style.background = `${gold}14`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = C.textXS; e.currentTarget.style.background = "none"; }}
                          >
                            {/* Decorative: the button above already carries the label. */}
                            <Icon name="pencil" size={14} />
                          </button>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 16, color: C.textS, fontSize: 13.5, lineHeight: 1.8 }}>
                          {getChecklist(f, "before").map((item, i) => <li key={i}>{item}</li>)}
                          {getChecklist(f, "before").length === 0 && <li style={{ listStyle: "none", marginLeft: -16, color: C.textXS, fontStyle: "italic" }}>No checklist yet.</li>}
                        </ul>
                      </div>
                      {/* After use */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <p style={{ color: gold, fontSize: 11.5, letterSpacing: 2, margin: 0 }}>AFTER USE</p>
                          <button
                            onClick={() => openChecklistEditor(f, "after")}
                            aria-label={`Edit the after-use checklist for ${f.name}`}
                            title="Edit checklist"
                            style={{
                              background: "none",
                              border: "none",
                              color: C.textXS,
                              cursor: "pointer",
                              padding: 0,
                              // A square box round a 14px glyph gives the icon a
                              // real click target without it reading as a second
                              // button next to the heading.
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 24,
                              height: 24,
                              // Hit area is 24px; layout height stays 14px to
                              // match the glyph, so the heading row does not
                              // grow taller than the pencil-less third column
                              // and push its list out of alignment.
                              margin: "-5px 0",
                              borderRadius: 5,
                              transition: "color .18s ease, background .18s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = gold; e.currentTarget.style.background = `${gold}14`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = C.textXS; e.currentTarget.style.background = "none"; }}
                          >
                            {/* Decorative: the button above already carries the label. */}
                            <Icon name="pencil" size={14} />
                          </button>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 16, color: C.textS, fontSize: 13.5, lineHeight: 1.8 }}>
                          {getChecklist(f, "after").map((item, i) => <li key={i}>{item}</li>)}
                          {getChecklist(f, "after").length === 0 && <li style={{ listStyle: "none", marginLeft: -16, color: C.textXS, fontStyle: "italic" }}>No checklist yet.</li>}
                        </ul>
                      </div>
                      {/* Today's reservations using it */}
                      <div>
                        {/* margin, not marginBottom: a bare <p> keeps the UA default
                            margin-top of 1em, which sat this heading 11px lower
                            than BEFORE/AFTER USE, whose <p> zeroes it. */}
                        <p style={{ color: gold, fontSize: 11.5, letterSpacing: 2, margin: "0 0 8px" }}>TODAY'S RESERVATIONS</p>
                        {todaysReservations.length === 0 ? (
                          <p style={{ color: C.textXS, fontSize: 13.5, fontStyle: "italic", margin: 0 }}>No reservations use this today.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {todaysReservations.map((b) => (
                              <div key={b.id} style={{ fontSize: 13.5, color: C.textS }}>
                                <strong style={{ color: C.textH }}>{b.name}</strong> · {b.guests} guests · {b.package}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {history && (() => {
                    const rows = historyFor(f);
                    return (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${cBr}` }}>
                        <p style={{ color: "#4a9fd4", fontSize: 11.5, letterSpacing: 2, marginBottom: 10 }}>
                          RESERVATION HISTORY — who reserved this and what they used
                        </p>
                        {rows.length === 0 ? (
                          <p style={{ color: C.textXS, fontSize: 13.5, fontStyle: "italic", margin: 0 }}>No reservations have used this yet.</p>
                        ) : (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                              <thead>
                                <tr style={{ borderBottom: `1px solid ${cBr}` }}>
                                  {["Date", "Guest", "Package", "Guests", "Food Used", "Status"].map((h) => (
                                    <th key={h} style={{ padding: "6px 10px", color: C.textXS, fontSize: 10.5, letterSpacing: 1.5, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((b) => (
                                  <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}` }}>
                                    <td style={{ padding: "8px 10px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.date}</td>
                                    <td style={{ padding: "8px 10px", color: C.textH, fontSize: 13.5 }}>
                                      {b.name} {b.archived && <span style={{ color: C.textXS, fontSize: 10.5 }}>(archived)</span>}
                                    </td>
                                    <td style={{ padding: "8px 10px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.package}</td>
                                    <td style={{ padding: "8px 10px", color: C.textS, fontSize: 12.5 }}>{b.guests}</td>
                                    <td style={{ padding: "8px 10px", color: C.textS, fontSize: 12.5 }}>
                                      {b.foodOrder && b.foodOrder.length > 0
                                        ? b.foodOrder.map((it) => `${it.name} ×${it.qty}`).join(", ")
                                        : <span style={{ color: C.textXS, fontStyle: "italic" }}>None</span>}
                                    </td>
                                    <td style={{ padding: "8px 10px", fontSize: 11.5 }}>
                                      <span style={{ background: `${historyStatusColor[b.status] ?? gold}18`, color: historyStatusColor[b.status] ?? gold, padding: "3px 8px", borderRadius: 20, border: `1px solid ${historyStatusColor[b.status] ?? gold}44`, letterSpacing: 1, whiteSpace: "nowrap" }}>{b.status.toUpperCase()}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </>
      )}

      {/* Checklist edit modal */}
      {checklistEditor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: "24px 22px", width: "100%", maxWidth: 420, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, marginBottom: 14 }}>
              Edit {checklistEditor.which === "before" ? "Before-Use" : "After-Use"} Checklist
            </h3>
            <p style={{ color: C.textS, fontSize: 12.5, marginBottom: 10 }}>One step per line.</p>
            <textarea value={checklistDraft} onChange={(e) => setChecklistDraft(e.target.value)} rows={6} className="sw-input" style={{ ...C.inp, borderRadius: 6, resize: "none", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setChecklistEditor(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6 }}>CANCEL</button>
              <button onClick={saveChecklist} style={{ ...outBtn, flex: 2, borderRadius: 6 }}>SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
