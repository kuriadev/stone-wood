"use client";

// ── Facility Management (capstone objective 2)
//
// The day-of work on facilities (preparing before a group arrives,
// inspecting before it leaves) happens in Daily Operations, which opens the
// preparation and check-out windows from InspectionModals.tsx. This module
// is where the facilities themselves and their records are kept:
//
//   Facilities         every amenity and room: status, checklists, and
//                      for amenities, add / edit / retire. What the owner
//                      adds here also appears on the public website.
//   Inspections        each visit's preparation and check-out record
//   Damage records     every damaged item and the penalty it carried
//   Damage rates       the price list penalties are computed from

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import {
  facilitiesForBooking, checklistFor, facilityIcon, amenityArea, isCoreAmenity, AMENITY_ICONS, AREA_LABEL, type AmenityIcon,
} from "@/lib/facilityUsage";
import { bookingMoney, manilaDate } from "@/lib/finance";
import { fmt, fmtDate } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import type { AmenityArea, Facility, FacilityStatus } from "@/types/facility";
import { gold } from "@/lib/styles";
import { Icon } from "@/components/common/Icon";
import { VisitRecord } from "@/components/admin/InspectionModals";
import {
  PageHead, Segmented, TableShell, td, Btn, Pill, Modal, Label, ErrorNote, useAdminStyle, Row, Cell, FullSelect, ViewTabs, ConfirmDialog,
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
const STATUSES: FacilityStatus[] = ["Available", "In Use", "Needs Cleaning", "Under Maintenance"];

type View = "Facilities" | "Inspections" | "Damages" | "Rates";

async function send(url: string, method: string, body: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || json.success === false) return { ok: false, error: json.error ?? "Something went wrong. Try again." };
    return { ok: true };
  } catch {
    return { ok: false, error: "No connection to the server. Check the internet and try again." };
  }
}

export function FacilitiesTab({ facilities, bookings, mob }: FacilitiesTabProps) {
  const { C } = useAdminStyle();
  const [view, setView] = useState<View>("Facilities");

  const needsClean = facilities.filter((f) => f.status === "Needs Cleaning").length;
  const down = facilities.filter((f) => f.status === "Under Maintenance" && f.active !== false).length;

  return (
    <div>
      <PageHead title="Facility Management" mob={mob}
        subtitle="The resort's amenities and rooms, their condition, and every inspection and damage record. Preparing and checking out groups is done in Daily Operations." />

      <p style={{ color: C.textS, fontSize: 13, margin: "-10px 0 18px" }}>
        {needsClean > 0 ? `${needsClean} need${needsClean === 1 ? "s" : ""} cleaning. ` : "Nothing waiting for cleaning. "}
        {down > 0 ? `${down} under maintenance (can't be booked).` : ""}
      </p>

      <ViewTabs<View> value={view} onChange={setView} views={[
        { value: "Facilities", label: "Facilities", content: <FacilityList facilities={facilities} mob={mob} /> },
        { value: "Inspections", label: "Inspection records", content: <Inspections bookings={bookings} facilities={facilities} /> },
        { value: "Damages", label: "Damage records", content: <Damages bookings={bookings} /> },
        { value: "Rates", label: "Damage rates", content: <DamageRates /> },
      ]} />
    </div>
  );
}

// ── Facilities: amenities (owner-managed) and rooms ───────────────────
function FacilityList({ facilities, mob }: { facilities: Facility[]; mob: boolean }) {
  const { C, rowBg } = useAdminStyle();
  const { reloadFacilities } = useApp();
  const { toast } = useToast();
  const [edit, setEdit] = useState<Facility | "new" | null>(null);
  const [retiring, setRetiring] = useState<Facility | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const amenities = facilities.filter((f) => f.category === "Amenity");
  const active = amenities.filter((f) => f.active !== false);
  const retired = amenities.filter((f) => f.active === false);
  const rooms = facilities.filter((f) => f.category === "Room");

  const setActive = async (f: Facility, on: boolean) => {
    const r = await send(`/api/facilities?id=${f.id}`, "PATCH", { active: on });
    if (!r.ok) return toast(r.error, "error");
    await reloadFacilities();
    toast(on ? `${f.name} is back in use.` : `${f.name} retired. Its past records are kept.`, on ? "success" : "info");
    setRetiring(null);
  };

  const statusCell = (f: Facility) => (
    <Pill color={F_COLOR[f.status]}><span style={{ width: 7, height: 7, borderRadius: "50%", background: F_COLOR[f.status] }} />{f.status}</Pill>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>Amenities <span style={{ color: C.textS, fontWeight: 400 }}>({active.length})</span></h3>
          <Btn kind="primary" icon="plus" onClick={() => setEdit("new")}>Add amenity</Btn>
        </div>
        <TableShell head={["Amenity", "Used by", "Website", "Status", ""]} minWidth={760}
          empty={active.length === 0 ? "No amenities yet. Add the resort's first one." : undefined}>
          {active.map((f, i) => (
            <Row key={f.id} style={{ background: rowBg(i) }}>
              <Cell style={td}>
                <span style={{ color: C.textH, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name={facilityIcon(f)} size={15} />{f.name}</span>
                {f.description && <div style={{ color: C.textS, fontSize: 12 }}>{f.description}</div>}
              </Cell>
              <Cell style={{ ...td, color: C.textB }}>{AREA_LABEL[amenityArea(f)]}</Cell>
              <Cell style={{ ...td, color: C.textS }}>{f.showOnSite === false ? "Hidden" : "Shown"}</Cell>
              <Cell style={td}>{statusCell(f)}</Cell>
              <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ display: "inline-flex", gap: 6 }}>
                  <Btn size="sm" icon="edit" onClick={() => setEdit(f)}>Edit</Btn>
                  {!isCoreAmenity(f) && <Btn size="sm" kind="red" onClick={() => setRetiring(f)}>Retire</Btn>}
                </div>
              </Cell>
            </Row>
          ))}
        </TableShell>
        {retired.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Btn size="sm" onClick={() => setShowRetired((s) => !s)}>{showRetired ? "Hide" : "Show"} retired ({retired.length})</Btn>
            {showRetired && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {retired.map((f) => (
                  <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.textS, fontSize: 13 }}>
                    <Icon name={facilityIcon(f)} size={14} />{f.name}
                    <Btn size="sm" onClick={() => setActive(f, true)}>Restore</Btn>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Rooms <span style={{ color: C.textS, fontWeight: 400 }}>({rooms.length})</span></h3>
        <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 10px" }}>Rooms are added and renamed in the Rooms module. Here you keep their status and checklists.</p>
        <TableShell head={["Room", "Last used by", "Status", ""]} minWidth={620}
          empty={rooms.length === 0 ? "No rooms." : undefined}>
          {rooms.map((f, i) => (
            <Row key={f.id} style={{ background: rowBg(i) }}>
              <Cell style={{ ...td, color: C.textH, fontWeight: 600 }}><Icon name="bed" size={15} style={{ marginRight: 8, verticalAlign: -2 }} />{f.name}</Cell>
              <Cell style={{ ...td, color: C.textS }}>{f.lastUsedGuestName ? `${f.lastUsedGuestName} (${f.lastUsedBookingId})` : "—"}</Cell>
              <Cell style={td}>{statusCell(f)}</Cell>
              <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm" icon="edit" onClick={() => setEdit(f)}>Edit</Btn></Cell>
            </Row>
          ))}
        </TableShell>
      </section>

      {edit && <FacilityModal facility={edit === "new" ? null : edit} mob={mob} onClose={() => setEdit(null)} />}
      {retiring && (
        <ConfirmDialog title={`Retire ${retiring.name}?`} onCancel={() => setRetiring(null)}
          confirm={<Btn kind="red" onClick={() => setActive(retiring, false)}>Retire</Btn>}>
          <p style={{ color: C.textS, fontSize: 14, margin: 0 }}>
            It stops appearing in new preparations and inspections and on the website. Past inspections and damage records that name it are kept, and you can restore it any time.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

// ── Add / edit one facility ───────────────────────────────────────────
function FacilityModal({ facility, mob, onClose }: { facility: Facility | null; mob: boolean; onClose: () => void }) {
  const { C, inp } = useAdminStyle();
  const { toast } = useToast();
  const { reloadFacilities } = useApp();
  const isNew = facility === null;
  const isRoom = facility?.category === "Room";
  const core = !!facility && isCoreAmenity(facility);

  const [name, setName] = useState(facility?.name ?? "");
  const [icon, setIcon] = useState<AmenityIcon | "bed">(facility ? facilityIcon(facility) : "palm");
  const [area, setArea] = useState<AmenityArea>(facility && !isRoom ? amenityArea(facility) : "Pool");
  const [description, setDescription] = useState(facility?.description ?? "");
  const [showOnSite, setShowOnSite] = useState(facility?.showOnSite !== false);
  const [status, setStatus] = useState<FacilityStatus>(facility?.status ?? "Available");
  const [notes, setNotes] = useState(facility?.notes ?? "");
  const [before, setBefore] = useState(facility ? checklistFor(facility, "before").join("\n") : "");
  const [after, setAfter] = useState(facility ? checklistFor(facility, "after").join("\n") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setError("");
    if (!isRoom && name.trim().length < 2) return setError("Give the amenity a name.");
    if (lines(before).length === 0 || lines(after).length === 0) return setError("Write at least one before-use and one after-use check.");
    setBusy(true);
    const common = { notes, beforeUseChecklist: lines(before), afterUseChecklist: lines(after) };
    const details = isRoom ? {} : { name: name.trim(), icon, area, description: description.trim(), showOnSite };
    const r = isNew
      ? await send("/api/facilities", "POST", { ...details, ...common })
      : await send(`/api/facilities?id=${facility.id}`, "PATCH", {
          ...details, ...common, status,
          lastCheckedAt: status === "Available" && facility.status !== "Available" ? new Date().toISOString() : facility.lastCheckedAt ?? null,
        });
    if (!r.ok) { setBusy(false); return setError(r.error); }
    await reloadFacilities();
    setBusy(false);
    toast(isNew
      ? `${name.trim()} added.${showOnSite ? " It now shows on the website." : ""}`
      : status === "Under Maintenance"
        ? `${facility.name} is under maintenance. It can't be booked until it's set back to Available.`
        : `${isRoom ? facility.name : name.trim()} saved.`, status === "Under Maintenance" ? "warning" : "success");
    onClose();
  };

  return (
    <Modal title={isNew ? "Add amenity" : facility.name}
      subtitle={isNew ? "It appears in preparations and inspections for the bookings that use it, and on the website." : facility.lastUsedGuestName ? `Last used by ${facility.lastUsedGuestName} (${facility.lastUsedBookingId})` : "Not used yet"}
      onClose={onClose} width={820}
      footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : isNew ? "Add amenity" : "Save"}</Btn>
      </div>}>
      {!isRoom && (
        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <Label htmlFor="f-name">Name</Label>
            <Input id="f-name" value={name} disabled={core} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kiddie Pool, Cottage 3" style={inp} />
            {core && <p style={{ color: C.textS, fontSize: 11.5, margin: "4px 0 0" }}>Fixed: bookings check this facility&apos;s availability by name.</p>}
          </div>
          <div>
            <Label htmlFor="f-desc">Description on the website</Label>
            <Input id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Shaded cottage by the pool for up to 10 guests." style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Which bookings use it</Label>
            <Segmented<AmenityArea> value={area} onChange={(v) => !core && setArea(v)} size="sm" label="Which bookings use it"
              options={(["Pool", "Venue", "Common"] as AmenityArea[]).map((a) => ({
                value: a, label: AREA_LABEL[a], disabled: core && a !== area,
                hint: a === "Pool" ? "Bookings with the pool" : a === "Venue" ? "Bookings with the events hall" : "Every booking",
              }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Icon</Label>
            <div role="radiogroup" aria-label="Icon" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AMENITY_ICONS.map((ic) => (
                <button key={ic} type="button" role="radio" aria-checked={icon === ic} aria-label={ic} onClick={() => setIcon(ic)}
                  style={{ width: 38, height: 38, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    background: icon === ic ? `${gold}1c` : "transparent", color: icon === ic ? gold : C.textS, border: `1px solid ${icon === ic ? gold + "88" : "rgba(150,130,100,0.3)"}` }}>
                  <Icon name={ic} size={17} />
                </button>
              ))}
            </div>
          </div>
          <label style={{ gridColumn: "1 / -1", color: C.textB, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <Checkbox checked={showOnSite} onCheckedChange={(v) => setShowOnSite(v === true)} /> Show on the website&apos;s amenities list
          </label>
        </div>
      )}

      {!isNew && (
        <div style={{ marginBottom: 14 }}>
          <Label>Status</Label>
          <Segmented<FacilityStatus> value={status} onChange={setStatus} size="sm"
            options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="f-notes">Notes (staff only)</Label>
        <Input id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pool filter needs replacing" style={inp} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <div>
          <Label htmlFor="f-before">Before-use checklist (one per line)</Label>
          <Textarea id="f-before" rows={6} value={before} onChange={(e) => setBefore(e.target.value)} placeholder={"e.g. Sweep the cottage\nWipe the table\nCheck the lights"} style={{ ...inp, resize: "vertical" }} />
        </div>
        <div>
          <Label htmlFor="f-after">After-use checklist (one per line)</Label>
          <Textarea id="f-after" rows={6} value={after} onChange={(e) => setAfter(e.target.value)} placeholder={"e.g. Count the chairs\nNo damage to the table\nTrash cleared"} style={{ ...inp, resize: "vertical" }} />
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

// ── Inspection records: every visit that has been checked out ─────────
function Inspections({ bookings, facilities }: { bookings: Booking[]; facilities: Facility[] }) {
  const { C, rowBg, inp } = useAdminStyle();
  const ops = useOps();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Booking | null>(null);

  const q = search.toLowerCase().trim();
  const done = bookings
    .filter((b) => !b.id.startsWith("TMP-") && (b.checkedOutAt || b.status === "Completed"))
    .filter((b) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.contact.includes(q))
    .sort((a, b) => (b.checkedOutAt ?? b.date).localeCompare(a.checkedOutAt ?? a.date));
  const shown = showAll ? done : done.slice(0, 15);

  const usesText = (b: Booking) => {
    const used = facilitiesForBooking(b, facilities);
    return used.map((f) => (f.category === "Room" ? f.name.split(" –")[0] : f.name)).join(", ") || "—";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>Every visit&apos;s preparation and check-out inspection. Click one to see the checklists, damage and payments.</p>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, booking or phone" aria-label="Search inspection records" style={{ ...inp, width: 260, padding: "8px 10px" }} />
      </div>
      <TableShell head={["Guest", "Visit", "Facilities", "Prepared", "Damage", "Settlement", ""]} minWidth={900}
        empty={shown.length === 0 ? (q ? "No visits match." : "No visits checked out yet.") : undefined}>
        {shown.map((b, i) => {
          const m = bookingMoney(b, ops.payments, ops.damages);
          const prepared = ops.inspections.some((x) => x.bookingId === b.id && x.stage === "Preparation");
          return (
            <Row key={b.id} style={{ background: rowBg(i), cursor: "pointer" }} onClick={() => setOpen(b)}>
              <Cell style={td}>
                <span style={{ color: C.textH, fontWeight: 600 }}>{b.name}</span>
                <div style={{ color: C.textS, fontSize: 11.5 }}><span style={{ color: gold, fontFamily: "monospace" }}>{b.id}</span> · {b.guests} guests</div>
              </Cell>
              <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</Cell>
              <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{usesText(b)}</Cell>
              <Cell style={td}>{prepared ? <Pill color="#2e9e4e">Yes</Pill> : <Pill color="#8a7a66">Not recorded</Pill>}</Cell>
              <Cell style={td}>{m.penaltyTotal > 0 ? <Pill color="#d44">{fmt(m.penaltyTotal)} penalty</Pill> : <span style={{ color: C.textS, fontSize: 12.5 }}>None</span>}</Cell>
              <Cell style={{ ...td, color: m.due > 0 ? "#d4a800" : C.textS, whiteSpace: "nowrap" }}>
                {b.status === "Completed" ? (m.due > 0 ? `${fmt(m.due)} unpaid` : "Settled") : "To settle"}
              </Cell>
              <Cell style={{ ...td, textAlign: "right" }}><Btn size="sm">View record</Btn></Cell>
            </Row>
          );
        })}
      </TableShell>
      {done.length > 15 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <Btn size="sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${done.length}`}</Btn>
        </div>
      )}
      {open && <VisitRecord booking={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Damage records ────────────────────────────────────────────────────
function Damages({ bookings }: { bookings: Booking[] }) {
  const { C, rowBg, inp } = useAdminStyle();
  const ops = useOps();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Booking | null>(null);

  const when = useMemo(() => new Map(ops.inspections.map((i) => [i.id, i.inspectedAt])), [ops.inspections]);
  const byId = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const q = search.toLowerCase().trim();
  const rows = ops.damages
    .filter((d) => !d.voided)
    .map((d) => ({ d, b: byId.get(d.bookingId), at: d.inspectionId !== null ? when.get(d.inspectionId) : undefined }))
    .filter(({ d, b }) => !q || d.itemName.toLowerCase().includes(q) || d.facilityName.toLowerCase().includes(q) ||
      d.bookingId.toLowerCase().includes(q) || (b?.name.toLowerCase().includes(q) ?? false));
  const total = rows.reduce((s, r) => s + r.d.amount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>
          {rows.length} damaged item{rows.length === 1 ? "" : "s"} recorded · {fmt(total)} in penalties. Penalty = quantity × the rate list (+ any adjustment, with its reason).
        </p>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, facility or guest" aria-label="Search damage records" style={{ ...inp, width: 260, padding: "8px 10px" }} />
      </div>
      <TableShell head={["Date", "Guest", "Facility", "Item", "Qty × rate", "Penalty"]} minWidth={860}
        empty={rows.length === 0 ? (q ? "No damage records match." : "No damage recorded yet.") : undefined}>
        {rows.map(({ d, b, at }, i) => (
          <Row key={d.id} style={{ background: rowBg(i), cursor: b ? "pointer" : "default" }} onClick={() => b && setOpen(b)}>
            <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{at ? fmtDate(manilaDate(at)) : b ? fmtDate(b.date) : "—"}</Cell>
            <Cell style={td}>
              <span style={{ color: C.textH }}>{b?.name ?? "—"}</span>
              <div style={{ color: gold, fontFamily: "monospace", fontSize: 11.5 }}>{d.bookingId}</div>
            </Cell>
            <Cell style={{ ...td, color: C.textB }}>{d.facilityName}</Cell>
            <Cell style={td}>
              <span style={{ color: C.textH }}>{d.itemName}</span>
              {(d.description || d.adjustment !== 0) && (
                <div style={{ color: C.textS, fontSize: 11.5 }}>
                  {d.description}{d.adjustment !== 0 ? `${d.description ? " · " : ""}adjusted ${d.adjustment > 0 ? "+" : "−"}${fmt(Math.abs(d.adjustment))}: ${d.adjustmentReason}` : ""}
                </div>
              )}
            </Cell>
            <Cell style={{ ...td, color: C.textS, whiteSpace: "nowrap" }}>{d.quantity} × {fmt(d.unitRate)}</Cell>
            <Cell style={{ ...td, color: "#d44", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(d.amount)}</Cell>
          </Row>
        ))}
      </TableShell>
      {open && <VisitRecord booking={open} onClose={() => setOpen(null)} />}
    </div>
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
        The starting prices are samples; replace them with the resort&apos;s real replacement costs.
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
