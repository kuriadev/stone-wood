"use client";

// ── Facility inspections for one reservation (capstone objective 2)
//
//   PrepModal       before the group arrives: tick each facility's
//                   before-use checklist.
//   CheckoutModal   before the group leaves: inspect each facility, record
//                   any damage (penalty = quantity × the rate list), and
//                   collect the balance and the penalty on the spot.
//   VisitRecord     read-only record of a finished visit.
//
// The facilities involved are worked out from the booking itself
// (lib/facilityUsage.ts), so the owner never has to remember which
// amenities or rooms a group used.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { useOps, type CheckoutDamageInput, type PayInput } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { facilitiesForBooking, checklistFor } from "@/lib/facilityUsage";
import { bookingMoney, round2, manilaDate, manilaTime, livePayments } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { MANUAL_METHODS, type InspectionItem, type Inspection } from "@/types/finance";
import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import { Icon, type IconName } from "@/components/common/Icon";
import { Modal, Label, Segmented, Btn, Line, ErrorNote, Pill, useAdminStyle, FullSelect } from "@/components/admin/ui";

const ICONS = new Set(["pool", "flame", "billiards", "mic", "car", "tent", "bed"]);
const iconOf = (f: Facility): IconName => (ICONS.has(f.icon) ? (f.icon as IconName) : "toolbox");

function Checklist({ items, onToggle }: { items: { label: string; done: boolean }[]; onToggle: (i: number) => void }) {
  const { C, inp } = useAdminStyle();
  if (items.length === 0) return <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>No checklist for this facility.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((c, i) => (
        <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: c.done ? C.textS : C.textB, fontSize: 13, cursor: "pointer" }}>
          <Checkbox checked={c.done} onCheckedChange={() => onToggle(i)} style={{ marginTop: 2 }} />
          <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
        </label>
      ))}
    </div>
  );
}

function BookingSummary({ b }: { b: Booking }) {
  const slot = SLOTS[getBookingSlot(b)];
  return <>{b.id} · {fmtDate(b.date)} · {slot.label} ({slot.hours}){b.arrivalTime ? ` · arriving ${b.arrivalTime}` : ""} · {b.guests} guests</>;
}

// ── Preparation ───────────────────────────────────────────────────────
export function PrepModal({ booking, facilities, onClose }: { booking: Booking; facilities: Facility[]; onClose: () => void }) {
  const { C, cBr, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const used = facilitiesForBooking(booking, facilities);
  const last = ops.inspections.find((i) => i.bookingId === booking.id && i.stage === "Preparation");
  const [items, setItems] = useState<InspectionItem[]>(() => used.map((f) => ({
    facilityId: f.id, facilityName: f.name, condition: "OK",
    checklist: checklistFor(f, "before").map((label) => ({ label, done: false })),
  })));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (fi: number, ci: number) => setItems((xs) => xs.map((x, i) => i !== fi ? x : { ...x, checklist: x.checklist.map((c, j) => j === ci ? { ...c, done: !c.done } : c) }));
  const all = items.every((x) => x.checklist.every((c) => c.done));
  const tickAll = () => setItems((xs) => xs.map((x) => ({ ...x, checklist: x.checklist.map((c) => ({ ...c, done: !all })) })));
  const left = items.reduce((s, x) => s + x.checklist.filter((c) => !c.done).length, 0);

  const save = async () => {
    setBusy(true); setError("");
    const r = await ops.savePreparation({ bookingId: booking.id, items, notes });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`Facilities prepared for ${booking.name}.`, "success");
    onClose();
  };

  return (
    <Modal title={`Prepare for ${booking.name}`} subtitle={<BookingSummary b={booking} />} onClose={onClose} width={980}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: left ? "#d4a800" : "#2e9e4e", fontSize: 13 }}>{left ? `${left} item${left === 1 ? "" : "s"} not ticked yet` : "Everything is ticked"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={tickAll}>{all ? "Untick all" : "Tick all"}</Btn>
            <Btn kind="primary" icon="clipboard-check" disabled={busy} onClick={save}>{busy ? "Saving…" : "Mark as prepared"}</Btn>
          </div>
        </div>
      }>
      {last && (
        <p style={{ color: "#2e9e4e", fontSize: 13, marginTop: 0 }}>
          <Icon name="check-circle" size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Already prepared on {fmtDate(manilaDate(last.inspectedAt))} at {manilaTime(last.inspectedAt)}. Saving again adds a new record.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 12 }}>
        {items.map((x, fi) => {
          const f = used[fi];
          return (
            <div key={x.facilityId} style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <span style={{ color: C.textH, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}><Icon name={iconOf(f)} size={15} />{x.facilityName}</span>
                {f.status !== "Available" && <Pill color={f.status === "Under Maintenance" ? "#d44" : "#d4a800"}>{f.status}</Pill>}
              </div>
              <Checklist items={x.checklist} onToggle={(ci) => toggle(fi, ci)} />
            </div>
          );
        })}
      </div>
      {used.length === 0 && <p style={{ color: C.textS }}>This booking doesn't use any listed facility.</p>}
      <div style={{ marginTop: 14 }}>
        <Label htmlFor="prep-notes">Notes (optional)</Label>
        <Input id="prep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Extra chairs set up in the venue" style={inp} />
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

// ── Check-out ─────────────────────────────────────────────────────────
interface DamageDraft extends CheckoutDamageInput { key: number; custom: boolean; adjusting: boolean }

export function CheckoutModal({ booking, facilities, onClose, mob }: { booking: Booking; facilities: Facility[]; onClose: () => void; mob: boolean }) {
  const { C, cBr, soft, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const used = facilitiesForBooking(booking, facilities);
  const rates = ops.damageRates.filter((r) => r.active);
  const money = bookingMoney(booking, ops.payments, ops.damages);

  const [items, setItems] = useState<InspectionItem[]>(() => used.map((f) => ({
    facilityId: f.id, facilityName: f.name, condition: "OK",
    checklist: checklistFor(f, "after").map((label) => ({ label, done: false })),
  })));
  const [damages, setDamages] = useState<Record<number, DamageDraft[]>>({});
  const [outOfService, setOutOfService] = useState<number[]>([]);
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>("Cash");
  const [reference, setReference] = useState("");
  const [partial, setPartial] = useState(false);
  const [balanceAmt, setBalanceAmt] = useState("");
  const [penaltyAmt, setPenaltyAmt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (fi: number, ci: number) => setItems((xs) => xs.map((x, i) => i !== fi ? x : { ...x, checklist: x.checklist.map((c, j) => j === ci ? { ...c, done: !c.done } : c) }));
  const setCondition = (fi: number, cond: "OK" | "Damaged") => {
    setItems((xs) => xs.map((x, i) => i === fi ? { ...x, condition: cond } : x));
    const id = used[fi].id;
    if (cond === "Damaged" && !(damages[id]?.length)) addDamage(fi);
    if (cond === "OK") { setDamages((d) => ({ ...d, [id]: [] })); setOutOfService((o) => o.filter((x) => x !== id)); }
  };
  const addDamage = (fi: number) => {
    const f = used[fi];
    // Start on the most likely kind of item for this facility.
    const guess = f.category === "Room" ? "Room" : f.name === "Swimming Pool" ? "Pool" : f.name === "Events Venue" ? "Furniture" : "Amenity";
    const first = rates.find((r) => r.category === guess) ?? rates[0];
    setDamages((d) => ({
      ...d,
      [f.id]: [...(d[f.id] ?? []), {
        key: Date.now() + Math.random(), facilityName: f.name, custom: !first, adjusting: false,
        rateId: first?.id ?? null, itemName: first?.name ?? "", quantity: 1, unitRate: first?.rate ?? 0,
        adjustment: 0, adjustmentReason: "", description: "",
      }],
    }));
  };
  const patchDamage = (fid: number, key: number, p: Partial<DamageDraft>) =>
    setDamages((d) => ({ ...d, [fid]: (d[fid] ?? []).map((x) => x.key === key ? { ...x, ...p } : x) }));
  const removeDamage = (fid: number, key: number) => setDamages((d) => ({ ...d, [fid]: (d[fid] ?? []).filter((x) => x.key !== key) }));

  const lineAmount = (x: DamageDraft) => round2(Math.max(0, x.quantity * x.unitRate + (x.adjusting ? x.adjustment : 0)));
  const allDamages = useMemo(() => Object.values(damages).flat(), [damages]);
  const newPenalty = round2(allDamages.reduce((s, x) => s + lineAmount(x), 0));
  const penaltyDue = round2(money.penaltyDue + newPenalty);
  const balanceDue = money.balance;
  const payBal = partial ? Math.min(balanceDue, Math.max(0, Number(balanceAmt) || 0)) : balanceDue;
  const payPen = partial ? Math.min(penaltyDue, Math.max(0, Number(penaltyAmt) || 0)) : penaltyDue;
  const leftOwing = round2(balanceDue + penaltyDue - payBal - payPen);
  const collecting = round2(payBal + payPen);

  const save = async () => {
    setError("");
    if (allDamages.some((x) => x.custom && (x.itemName.trim().length < 2 || x.unitRate < 0))) return setError("Name each item that isn't on the rate list, and give it a price.");
    if (allDamages.some((x) => x.adjusting && x.adjustment !== 0 && x.adjustmentReason.trim().length < 3)) return setError("Give a reason for every adjusted penalty.");
    if (collecting > 0 && method !== "Cash" && !reference.trim()) return setError(`Enter the ${method} reference number.`);
    if (leftOwing > 0 && notes.trim().length < 3) return setError("Say why the guest is leaving without paying in full.");
    const pay = (amount: number): PayInput | null => amount > 0 ? { amount, method, reference: reference.trim() } : null;
    setBusy(true);
    const r = await ops.checkout({
      bookingId: booking.id,
      items,
      damages: allDamages.map((x) => ({
        facilityName: x.facilityName, rateId: x.custom ? null : x.rateId, itemName: x.itemName, quantity: x.quantity,
        unitRate: x.unitRate, adjustment: x.adjusting ? x.adjustment : 0, adjustmentReason: x.adjusting ? x.adjustmentReason : "", description: x.description,
      })),
      balancePayment: pay(payBal),
      penaltyPayment: pay(payPen),
      leaveUnpaid: leftOwing > 0,
      maintenanceFacilityIds: outOfService,
      notes,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(leftOwing > 0
      ? `${booking.name} checked out. ${fmt(leftOwing)} is still owed; it's listed under Sales → Receivables.`
      : `${booking.name} checked out and settled.${collecting > 0 ? ` ${fmt(collecting)} recorded in Sales.` : ""}`, leftOwing > 0 ? "warning" : "success");
    onClose();
  };

  const damagedCount = items.filter((x) => x.condition === "Damaged").length;

  return (
    <Modal title={`Check out ${booking.name}`} subtitle={<BookingSummary b={booking} />} onClose={onClose} width={1160}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.textS, fontSize: 13.5 }}>
            {collecting > 0 ? <>Collecting <strong style={{ color: "#2e9e4e" }}>{fmt(collecting)}</strong> by {method}</> : "Nothing to collect"}
            {leftOwing > 0 && <> · <strong style={{ color: "#d44" }}>{fmt(leftOwing)} left unpaid</strong></>}
          </span>
          <Btn kind="primary" icon="check" disabled={busy} onClick={save}>{busy ? "Saving…" : "Complete check-out"}</Btn>
        </div>
      }>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,1.7fr) minmax(300px,1fr)", gap: 20, alignItems: "start" }}>
        {/* ── Inspection ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: C.textS, fontSize: 13 }}>
            Inspect each facility the group used. Mark it <strong style={{ color: C.textB }}>Damaged</strong> to add a penalty from the rate list.
          </div>
          {items.map((x, fi) => {
            const f = used[fi];
            const ds = damages[f.id] ?? [];
            return (
              <div key={x.facilityId} style={{ border: `1px solid ${x.condition === "Damaged" ? "rgba(229,85,85,0.45)" : cBr}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ color: C.textH, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}><Icon name={iconOf(f)} size={15} />{x.facilityName}</span>
                  <div style={{ width: 200 }}>
                    <Segmented value={x.condition} onChange={(c) => setCondition(fi, c)} size="sm" options={[
                      { value: "OK", label: "OK" },
                      { value: "Damaged", label: "Damaged" },
                    ]} />
                  </div>
                </div>
                <Checklist items={x.checklist} onToggle={(ci) => toggle(fi, ci)} />

                {x.condition === "Damaged" && (
                  <div style={{ marginTop: 10, borderTop: `1px dashed ${cBr}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                    {ds.map((d) => (
                      <div key={d.key} style={{ background: soft, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,2fr) 80px minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
                          <div>
                            <Label>Damaged item</Label>
                            <FullSelect aria-label="Damaged item" value={d.custom ? "custom" : String(d.rateId ?? "")} style={{ ...inp, padding: "8px 36px 8px 10px" }}
                              onChange={(e) => {
                                if (e.target.value === "custom") return patchDamage(f.id, d.key, { custom: true, rateId: null, itemName: "", unitRate: 0 });
                                const r = rates.find((x) => x.id === Number(e.target.value));
                                if (r) patchDamage(f.id, d.key, { custom: false, rateId: r.id, itemName: r.name, unitRate: r.rate });
                              }}>
                              {rates.map((r) => <option key={r.id} value={r.id}>{r.name} — {fmt(r.rate)}/{r.unit}</option>)}
                              <option value="custom">Other item (not on the list)…</option>
                            </FullSelect>
                          </div>
                          <div>
                            <Label>Qty</Label>
                            <Input type="number" min={1} value={d.quantity} onChange={(e) => patchDamage(f.id, d.key, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...inp, padding: "8px 10px" }} />
                          </div>
                          <div style={{ color: C.textH, fontWeight: 600, fontSize: 14, paddingBottom: 8, textAlign: "right" }}>
                            {d.quantity} × {fmt(d.unitRate)} = {fmt(lineAmount(d))}
                          </div>
                          <button type="button" onClick={() => removeDamage(f.id, d.key)} aria-label="Remove item" style={{ background: "transparent", border: "none", color: C.textS, cursor: "pointer", paddingBottom: 8 }}><Icon name="trash" size={15} /></button>
                        </div>
                        {d.custom && (
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 8 }}>
                            <Input value={d.itemName} onChange={(e) => patchDamage(f.id, d.key, { itemName: e.target.value })} placeholder="Item name" style={{ ...inp, padding: "8px 10px" }} />
                            <Input type="number" min={0} value={d.unitRate || ""} onChange={(e) => patchDamage(f.id, d.key, { unitRate: Math.max(0, Number(e.target.value) || 0) })} placeholder="Price each (₱)" style={{ ...inp, padding: "8px 10px" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Input value={d.description} onChange={(e) => patchDamage(f.id, d.key, { description: e.target.value })} placeholder="What happened (optional)" style={{ ...inp, padding: "8px 10px", flex: "1 1 220px", width: "auto" }} />
                          <label style={{ color: C.textS, fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
                            <Checkbox checked={d.adjusting} onCheckedChange={(v) => patchDamage(f.id, d.key, { adjusting: v === true })} /> Adjust amount
                          </label>
                        </div>
                        {d.adjusting && (
                          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, marginTop: 8 }}>
                            <Input type="number" value={d.adjustment || ""} onChange={(e) => patchDamage(f.id, d.key, { adjustment: Number(e.target.value) || 0 })} placeholder="− or + ₱" aria-label="Adjustment" style={{ ...inp, padding: "8px 10px" }} />
                            <Input value={d.adjustmentReason} onChange={(e) => patchDamage(f.id, d.key, { adjustmentReason: e.target.value })} placeholder="Reason, e.g. only a small crack, repairable" style={{ ...inp, padding: "8px 10px" }} />
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Btn size="sm" icon="plus" onClick={() => addDamage(fi)}>Add another item</Btn>
                      <label style={{ color: C.textS, fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
                        <Checkbox checked={outOfService.includes(f.id)} onCheckedChange={(v) => setOutOfService((o) => v === true ? [...o, f.id] : o.filter((id) => id !== f.id))} />
                        Take out of service (Under Maintenance)
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {used.length === 0 && <p style={{ color: C.textS }}>This booking doesn't use any listed facility.</p>}
        </div>

        {/* ── Settlement ── */}
        <div style={{ position: mob ? "static" : "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Settlement</div>
            <Line label="Booking total" value={fmt(booking.total)} />
            <Line label="Paid so far" value={fmt(money.paid)} />
            <Line label="Balance due" value={fmt(balanceDue)} color={balanceDue > 0 ? "#d4a800" : undefined} />
            <Line label={`Damage penalties${damagedCount ? ` (${allDamages.length} item${allDamages.length === 1 ? "" : "s"})` : ""}`} value={fmt(newPenalty)} color={newPenalty > 0 ? "#d44" : undefined} />
            {money.penaltyDue > 0 && <Line label="Earlier unpaid penalties" value={fmt(money.penaltyDue)} color="#d44" />}
            <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 6, paddingTop: 4 }}>
              <Line label="To collect now" value={fmt(round2(balanceDue + penaltyDue))} strong />
            </div>
          </div>

          {(balanceDue + penaltyDue > 0) && (
            <>
              <div>
                <Label>Paid with</Label>
                <Segmented value={method} onChange={setMethod} size="sm" options={MANUAL_METHODS.map((m) => ({ value: m, label: m }))} />
              </div>
              {method !== "Cash" && (
                <div>
                  <Label htmlFor="co-ref">{method} reference number</Label>
                  <Input id="co-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={inp} />
                </div>
              )}
              <label style={{ color: C.textS, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Checkbox checked={partial} onCheckedChange={(v) => { setPartial(v === true); setBalanceAmt(String(balanceDue)); setPenaltyAmt(String(penaltyDue)); }} style={{ marginTop: 2 }} />
                The guest can't pay everything now
              </label>
              {partial && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <Label htmlFor="co-bal">Balance paid</Label>
                    <Input id="co-bal" type="number" min={0} max={balanceDue} value={balanceAmt} onChange={(e) => setBalanceAmt(e.target.value)} style={inp} />
                  </div>
                  <div>
                    <Label htmlFor="co-pen">Penalty paid</Label>
                    <Input id="co-pen" type="number" min={0} max={penaltyDue} value={penaltyAmt} onChange={(e) => setPenaltyAmt(e.target.value)} style={inp} />
                  </div>
                </div>
              )}
            </>
          )}
          <div>
            <Label htmlFor="co-notes">{leftOwing > 0 ? "Why is it left unpaid?" : "Notes (optional)"}</Label>
            <Textarea id="co-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, resize: "none" }}
              placeholder={leftOwing > 0 ? "e.g. Will send the rest by GCash tomorrow" : "e.g. Group left the area clean"} />
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </Modal>
  );
}

// ── Record of a finished visit ────────────────────────────────────────
export function VisitRecord({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, soft, cBr, inp } = useAdminStyle();
  const ops = useOps();
  const money = bookingMoney(booking, ops.payments, ops.damages);
  const insp = ops.inspections.filter((i) => i.bookingId === booking.id).sort((a, b) => a.inspectedAt.localeCompare(b.inspectedAt));
  const damages = ops.damages.filter((d) => d.bookingId === booking.id && !d.voided);
  const pays = livePayments(ops.payments).filter((p) => p.bookingId === booking.id);

  const Stage = ({ i }: { i: Inspection }) => (
    <div style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <strong style={{ color: C.textH }}>{i.stage === "Preparation" ? "Prepared" : "Checked out"}</strong>
        <span style={{ color: C.textS, fontSize: 12.5 }}>{fmtDate(manilaDate(i.inspectedAt))}, {manilaTime(i.inspectedAt)}</span>
      </div>
      {i.items.map((it) => {
        const done = it.checklist.filter((c) => c.done).length;
        return (
          <div key={it.facilityId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "3px 0" }}>
            <span style={{ color: C.textB }}>{it.facilityName}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: C.textS }}>{done}/{it.checklist.length} checked</span>
              {i.stage === "Checkout" && <Pill color={it.condition === "Damaged" ? "#d44" : "#2e9e4e"}>{it.condition}</Pill>}
            </span>
          </div>
        );
      })}
      {i.notes && <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0" }}>Note: {i.notes}</p>}
    </div>
  );

  return (
    <Modal title={booking.name} subtitle={<BookingSummary b={booking} />} onClose={onClose} width={900}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insp.map((i) => <Stage key={i.id} i={i} />)}
          {insp.length === 0 && <p style={{ color: C.textS, fontSize: 13 }}>No inspections were recorded for this visit.</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Damage</div>
            {damages.map((d) => (
              <div key={d.id} style={{ padding: "4px 0" }}>
                <Line label={`${d.itemName} × ${d.quantity} · ${d.facilityName}`} value={fmt(d.amount)} color="#d44" />
                {(d.adjustment !== 0 || d.description) && (
                  <div style={{ color: C.textS, fontSize: 12 }}>
                    {d.description}{d.adjustment !== 0 ? `${d.description ? " · " : ""}adjusted ${d.adjustment > 0 ? "+" : "−"}${fmt(Math.abs(d.adjustment))}: ${d.adjustmentReason}` : ""}
                  </div>
                )}
              </div>
            ))}
            {damages.length === 0 && <p style={{ color: "#2e9e4e", fontSize: 13, margin: "4px 0" }}>No damage recorded.</p>}
          </div>
          <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Payments</div>
            {pays.map((p) => <Line key={p.id} label={`${p.type} · ${p.method} · ${fmtDate(manilaDate(p.receivedAt))}`} value={`${p.type === "Refund" ? "−" : ""}${fmt(p.amount)}`} />)}
            <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 6, paddingTop: 4 }}>
              <Line label="Still owed" value={fmt(money.due)} strong color={money.due > 0 ? "#d4a800" : "#2e9e4e"} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
