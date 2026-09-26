"use client";

// ── Facilities (capstone objective 2)
//
// Organised around GUESTS, not around each facility: the owner thinks
// "the Santos group arrives at 7, the Reyes group is leaving", so that is
// how this screen is laid out.
//
//   Today          groups due today (and any past visit never checked out)
//   Coming up      the next 14 days — prepare ahead
//   Checked out    finished visits, with their inspection and damage record
//
// Clicking a guest opens the preparation or check-out window
// (InspectionModals.tsx). A compact strip at the top still shows each
// facility's status, because "Under Maintenance" blocks bookings.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { facilitiesForBooking, checklistFor } from "@/lib/facilityUsage";
import { bookingMoney, manilaDate, manilaTime } from "@/lib/finance";
import { isInResort } from "@/lib/occupancy";
import { fmt, fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import type { Booking } from "@/types/booking";
import type { Facility, FacilityStatus } from "@/types/facility";
import { gold } from "@/lib/styles";
import { Icon, type IconName } from "@/components/common/Icon";
import { PrepModal, CheckoutModal, VisitRecord } from "@/components/admin/InspectionModals";
import {
  PageHead, Segmented, TableShell, td, Btn, Pill, Modal, Label, ErrorNote, useAdminStyle, STATUS_COLOR, Row, Cell, FullSelect, ViewTabs,
} from "@/components/admin/ui";

interface FacilitiesTabProps {
  facilities: Facility[];
  setFacilities: React.Dispatch<React.SetStateAction<Facility[]>>;
  bookings: Booking[];
  mob: boolean;
}

const F_COLOR: Record<FacilityStatus, string> = {
  Available: "#2e9e4e",
  "In Use": "#3a8fc4",
  "Needs Cleaning": "#d4a800",
  "Under Maintenance": "#d44",
};
const ICONS = new Set(["pool", "flame", "billiards", "mic", "car", "tent", "bed"]);
const iconOf = (f: Facility): IconName => (ICONS.has(f.icon) ? (f.icon as IconName) : "toolbox");

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function FacilitiesTab({ facilities, setFacilities, bookings, mob }: FacilitiesTabProps) {
  const { C, rowBg, inp } = useAdminStyle();
  const ops = useOps();
  const [view, setView] = useState<"Guests" | "Rates">("Guests");
  const [open, setOpen] = useState<{ kind: "prep" | "checkout" | "record"; booking: Booking } | null>(null);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  // A live clock, so "On site now" changes as a slot starts or ends.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = manilaDate(now);
  const horizon = addDays(today, 14);

  const real = bookings.filter((b) => !b.id.startsWith("TMP-"));
  const active = (b: Booking) => b.status === "Pending" || b.status === "Confirmed";
  const todayList = real.filter((b) => active(b) && b.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = real.filter((b) => active(b) && b.date > today && b.date <= horizon).sort((a, b) => a.date.localeCompare(b.date));
  const q = search.toLowerCase().trim();
  const done = real.filter((b) => b.status === "Completed")
    .filter((b) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.contact.includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  const doneShown = showAll ? done : done.slice(0, 12);

  const prepOf = (b: Booking) => ops.inspections.find((i) => i.bookingId === b.id && i.stage === "Preparation");

  const usesText = (b: Booking) => {
    const used = facilitiesForBooking(b, facilities);
    const rooms = used.filter((f) => f.category === "Room").map((f) => f.name.split(" –")[0]);
    const venue = used.some((f) => f.name === "Events Venue");
    const pool = used.some((f) => f.name === "Swimming Pool");
    return [pool && "Pool & amenities", venue && "Events venue", ...rooms].filter(Boolean).join(", ") || "—";
  };

  const when = (b: Booking) => {
    const slot = SLOTS[getBookingSlot(b)];
    const late = b.date < today;
    return (
      <>
        <span style={{ color: late ? "#d44" : C.textB }}>{b.date === today ? "Today" : fmtDate(b.date)}{late ? " (past, not checked out)" : ""}</span>
        <div style={{ color: C.textS, fontSize: 11.5 }}>{slot.label} · {slot.hours}{b.arrivalTime ? ` · arrives ${b.arrivalTime}` : ""}</div>
      </>
    );
  };

  const prepCell = (b: Booking) => {
    const p = prepOf(b);
    return p
      ? <Pill color="#2e9e4e"><Icon name="check" size={11} />Prepared {manilaDate(p.inspectedAt) === today ? manilaTime(p.inspectedAt) : fmtDate(manilaDate(p.inspectedAt))}</Pill>
      : <Pill color="#d4a800">Not prepared</Pill>;
  };

  const guest = (b: Booking) => (
    <>
      <span style={{ color: C.textH, fontWeight: 600 }}>{b.name}</span>
      {isInResort(b, now) && <Pill color="#2e9e4e" style={{ marginLeft: 8 }}>On site now</Pill>}
      <div style={{ color: C.textS, fontSize: 11.5 }}><span style={{ color: gold, fontFamily: "monospace" }}>{b.id}</span> · {b.guests} guests · {b.source ?? "Online"}</div>
    </>
  );

  const needsClean = facilities.filter((f) => f.status === "Needs Cleaning").length;

  return (
    <div>
      <PageHead title="Facilities" mob={mob}
        subtitle="Prepare for arriving guests, and inspect the facilities before each group leaves." />

      {/* ── Facility status strip ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {facilities.map((f) => (
          <button key={f.id} type="button" onClick={() => setEditFacility(f)} title={`${f.status}. Click to change status, notes or checklists.`}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${F_COLOR[f.status]}55`, color: C.textB, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: F_COLOR[f.status], flexShrink: 0 }} />
            <Icon name={iconOf(f)} size={14} />
            {f.category === "Room" ? f.name.split(" –")[0] : f.name}
          </button>
        ))}
      </div>
      <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 20px" }}>
        {needsClean > 0 ? `${needsClean} need${needsClean === 1 ? "s" : ""} cleaning. ` : "Nothing waiting for cleaning. "}
        <span style={{ color: F_COLOR.Available }}>Available</span>, <span style={{ color: F_COLOR["In Use"] }}>in use</span>, <span style={{ color: F_COLOR["Needs Cleaning"] }}>needs cleaning</span>, <span style={{ color: F_COLOR["Under Maintenance"] }}>under maintenance (can't be booked)</span>. Click one to change it.
      </p>

      <ViewTabs value={view} onChange={setView} views={[
        { value: "Guests" as const, label: "Guests", content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <section>
            <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: "0 0 10px" }}>Today <span style={{ color: C.textS, fontWeight: 400 }}>({todayList.length})</span></h3>
            <TableShell head={["Guest", "When", "Uses", "Preparation", "Owed", ""]} minWidth={880}
              empty={todayList.length === 0 ? "No groups today." : undefined}>
              {todayList.map((b, i) => {
                const m = bookingMoney(b, ops.payments, ops.damages);
                return (
                  <Row key={b.id} style={{ background: rowBg(i) }}>
                    <Cell style={td}>{guest(b)}</Cell>
                    <Cell style={td}>{when(b)}</Cell>
                    <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{usesText(b)}</Cell>
                    <Cell style={td}>{b.status === "Pending" ? <Pill color={STATUS_COLOR.Pending}>Awaiting approval</Pill> : prepCell(b)}</Cell>
                    <Cell style={{ ...td, color: m.due > 0 ? "#d4a800" : C.textS, whiteSpace: "nowrap" }}>{m.due > 0 ? fmt(m.due) : "Paid"}</Cell>
                    <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Btn size="sm" icon="clipboard-check" onClick={() => setOpen({ kind: "prep", booking: b })}>Prepare</Btn>
                        <Btn size="sm" kind="blue" icon="logout" onClick={() => setOpen({ kind: "checkout", booking: b })}>Check out</Btn>
                      </div>
                    </Cell>
                  </Row>
                );
              })}
            </TableShell>
          </section>

          <section>
            <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: "0 0 10px" }}>Coming up <span style={{ color: C.textS, fontWeight: 400 }}>(next 14 days, {upcoming.length})</span></h3>
            <TableShell head={["Guest", "When", "Uses", "Status", "Preparation", ""]} minWidth={820}
              empty={upcoming.length === 0 ? "No reservations in the next 14 days." : undefined}>
              {upcoming.map((b, i) => (
                <Row key={b.id} style={{ background: rowBg(i) }}>
                  <Cell style={td}>{guest(b)}</Cell>
                  <Cell style={td}>{when(b)}</Cell>
                  <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{usesText(b)}</Cell>
                  <Cell style={td}><Pill color={STATUS_COLOR[b.status]}>{b.status}</Pill></Cell>
                  <Cell style={td}>{prepCell(b)}</Cell>
                  <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm" icon="clipboard-check" onClick={() => setOpen({ kind: "prep", booking: b })}>Prepare</Btn></Cell>
                </Row>
              ))}
            </TableShell>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>Checked out <span style={{ color: C.textS, fontWeight: 400 }}>({done.length})</span></h3>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, booking or phone" aria-label="Search finished visits" style={{ ...inp, width: 260, padding: "8px 10px" }} />
            </div>
            <TableShell head={["Guest", "Visit", "Uses", "Damage", "Owed", ""]} minWidth={780}
              empty={doneShown.length === 0 ? (q ? "No finished visits match." : "No finished visits yet.") : undefined}>
              {doneShown.map((b, i) => {
                const m = bookingMoney(b, ops.payments, ops.damages);
                return (
                  <Row key={b.id} style={{ background: rowBg(i), cursor: "pointer" }} onClick={() => setOpen({ kind: "record", booking: b })}>
                    <Cell style={td}>{guest(b)}</Cell>
                    <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</Cell>
                    <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{usesText(b)}</Cell>
                    <Cell style={td}>{m.penaltyTotal > 0 ? <Pill color="#d44">{fmt(m.penaltyTotal)} penalty</Pill> : <span style={{ color: C.textS, fontSize: 12.5 }}>None</span>}</Cell>
                    <Cell style={{ ...td, color: m.due > 0 ? "#d4a800" : C.textS }}>{m.due > 0 ? fmt(m.due) : "Settled"}</Cell>
                    <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm">View record</Btn></Cell>
                  </Row>
                );
              })}
            </TableShell>
            {done.length > 12 && (
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <Btn size="sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${done.length}`}</Btn>
              </div>
            )}
          </section>
        </div>
        ) },
        { value: "Rates" as const, label: "Damage rates", content: <DamageRates /> },
      ]} />

      {open?.kind === "prep" && <PrepModal booking={open.booking} facilities={facilities} onClose={() => setOpen(null)} />}
      {open?.kind === "checkout" && <CheckoutModal booking={open.booking} facilities={facilities} mob={mob} onClose={() => setOpen(null)} />}
      {open?.kind === "record" && <VisitRecord booking={open.booking} onClose={() => setOpen(null)} />}
      {editFacility && (
        <FacilityModal facility={editFacility} onClose={() => setEditFacility(null)}
          onSave={(next) => { setFacilities((fs) => fs.map((f) => f.id === next.id ? next : f)); setEditFacility(null); }} />
      )}
    </div>
  );
}

// ── One facility: status, notes and its two checklists ────────────────
function FacilityModal({ facility, onClose, onSave }: { facility: Facility; onClose: () => void; onSave: (f: Facility) => void }) {
  const { C, inp } = useAdminStyle();
  const { toast } = useToast();
  const [status, setStatus] = useState<FacilityStatus>(facility.status);
  const [notes, setNotes] = useState(facility.notes);
  const [before, setBefore] = useState(checklistFor(facility, "before").join("\n"));
  const [after, setAfter] = useState(checklistFor(facility, "after").join("\n"));
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = () => {
    onSave({
      ...facility,
      status,
      notes,
      lastCheckedAt: status === "Available" && facility.status !== "Available" ? new Date().toISOString() : facility.lastCheckedAt,
      beforeUseChecklist: lines(before),
      afterUseChecklist: lines(after),
    });
    toast(status === "Under Maintenance"
      ? `${facility.name} is under maintenance. It can't be booked online or at the desk until it's set back to Available.`
      : `${facility.name} saved.`, status === "Under Maintenance" ? "warning" : "success");
  };

  return (
    <Modal title={facility.name}
      subtitle={facility.lastUsedGuestName ? `Last used by ${facility.lastUsedGuestName} (${facility.lastUsedBookingId})` : "Not used yet"}
      onClose={onClose} width={760}
      footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" onClick={save}>Save</Btn>
      </div>}>
      <Label>Status</Label>
      <Segmented<FacilityStatus> value={status} onChange={setStatus} size="sm"
        options={(["Available", "In Use", "Needs Cleaning", "Under Maintenance"] as FacilityStatus[]).map((s) => ({ value: s, label: s }))} />
      <div style={{ marginTop: 14 }}>
        <Label htmlFor="f-notes">Notes</Label>
        <Input id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pool filter needs replacing" style={inp} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginTop: 14 }}>
        <div>
          <Label htmlFor="f-before">Before-use checklist (one per line)</Label>
          <Textarea id="f-before" rows={6} value={before} onChange={(e) => setBefore(e.target.value)} style={{ ...inp, resize: "vertical" }} />
        </div>
        <div>
          <Label htmlFor="f-after">After-use checklist (one per line)</Label>
          <Textarea id="f-after" rows={6} value={after} onChange={(e) => setAfter(e.target.value)} style={{ ...inp, resize: "vertical" }} />
        </div>
      </div>
    </Modal>
  );
}

// ── Damage rate list ──────────────────────────────────────────────────
function DamageRates() {
  const { C, rowBg, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState({ name: "", category: "Furniture", unit: "pc", rate: "" });
  const [error, setError] = useState("");
  const categories = useMemo(() => Array.from(new Set(["Furniture", "Pool", "Room", "Amenity", ...ops.damageRates.map((r) => r.category)])), [ops.damageRates]);

  const saveRate = async (id: number) => {
    setError("");
    const r = await ops.saveRate({ id, rate: Number(draft[id]) });
    if (!r.ok) return setError(r.error);
    setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
    toast("Rate updated. Penalties already recorded keep the rate they were charged at.", "success");
  };
  const toggle = async (id: number, active: boolean) => {
    const r = await ops.saveRate({ id, active });
    if (!r.ok) setError(r.error);
  };
  const add = async () => {
    setError("");
    const r = await ops.saveRate({ name: adding.name, category: adding.category, unit: adding.unit, rate: Number(adding.rate) });
    if (!r.ok) return setError(r.error);
    setAdding({ name: "", category: adding.category, unit: "pc", rate: "" });
    toast("Item added to the rate list.", "success");
  };

  const cell = { ...inp, padding: "7px 9px" };
  return (
    <div>
      <p style={{ color: C.textS, fontSize: 13, marginTop: 0, maxWidth: 720 }}>
        The price charged for each damaged or lost item. At check-out the penalty is quantity × this rate.
        The starting prices are samples; replace them with the resort's real replacement costs.
      </p>
      <TableShell head={["Item", "Category", "Unit", "Rate (₱)", "In use", ""]} minWidth={720}>
        {ops.damageRates.map((r, i) => {
          const edited = draft[r.id] !== undefined && Number(draft[r.id]) !== r.rate;
          return (
            <Row key={r.id} style={{ background: rowBg(i), opacity: r.active ? 1 : 0.5 }}>
              <Cell style={{ ...td, color: C.textH }}>{r.name}</Cell>
              <Cell style={{ ...td, color: C.textB }}>{r.category}</Cell>
              <Cell style={{ ...td, color: C.textS }}>{r.unit}</Cell>
              <Cell style={{ ...td, width: 140 }}>
                <Input type="number" min={0} aria-label={`Rate for ${r.name}`} value={draft[r.id] ?? String(r.rate)} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} style={cell} />
              </Cell>
              <Cell style={td}>
                <label style={{ color: C.textS, fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
                  <Checkbox checked={r.active} onCheckedChange={(v) => toggle(r.id, v === true)} aria-label={`${r.name} in use`} /> {r.active ? "Yes" : "Retired"}
                </label>
              </Cell>
              <Cell style={{ ...td, textAlign: "right" }}>{edited && <Btn size="sm" kind="green" onClick={() => saveRate(r.id)}>Save</Btn>}</Cell>
            </Row>
          );
        })}
        <Row>
          <Cell style={td}><Input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="New item" aria-label="New item name" style={cell} /></Cell>
          <Cell style={td}>
            <FullSelect value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })} aria-label="Category" style={cell}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </FullSelect>
          </Cell>
          <Cell style={td}><Input value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value })} aria-label="Unit" style={{ ...cell, width: 70 }} /></Cell>
          <Cell style={td}><Input type="number" min={0} value={adding.rate} onChange={(e) => setAdding({ ...adding, rate: e.target.value })} placeholder="0" aria-label="Rate" style={cell} /></Cell>
          <Cell style={td} />
          <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm" kind="primary" icon="plus" onClick={add}>Add</Btn></Cell>
        </Row>
      </TableShell>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
