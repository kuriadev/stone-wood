"use client";

// ── Facility inspections for one reservation (capstone objective 2)
//
//   PrepModal        before the group arrives: tick each facility's
//                    before-use checklist.
//   CheckoutModal    as the group leaves: inspect each facility, record
//                    any damage (penalty = quantity × the rate list), and
//                    collect what's left (the bill works itself out) to
//                    complete the booking in one step.
//   SettleModal      for a group already checked out that didn't pay
//                    everything at the gate: the stay balance plus the
//                    penalties, the final payment, and the booking marked
//                    Completed.
//   BookingStatement the itemised tally SettleModal and the Sales invoice
//                    both show.
//   VisitRecord      everything about one reservation: details, progress,
//                    facilities, money and inspections (read-only).
//
// The facilities involved are worked out from the booking itself
// (lib/facilityUsage.ts), so the owner never has to remember which
// amenities or rooms a group used.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { useOps, type CheckoutDamageInput } from "@/contexts/OpsContext";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/contexts/ToastContext";
import { facilitiesForBooking, checklistFor } from "@/lib/facilityUsage";
import { bookingMoney, round2, manilaDate, manilaTime, livePayments } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot, getBookingResource, getBookingTier } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { MANUAL_METHODS, type InspectionItem, type Inspection } from "@/types/finance";
import { facilityIcon } from "@/lib/facilityUsage";
import { OVERTIME_RATE } from "@/lib/validators";
import type { Booking } from "@/types/booking";
import type { Facility } from "@/types/facility";
import { Icon } from "@/components/common/Icon";
import { Modal, Label, Segmented, Btn, Line, ErrorNote, Pill, useAdminStyle, FullSelect, STATUS_COLOR } from "@/components/admin/ui";
import { gold } from "@/lib/styles";
import { BookingHistory } from "@/components/admin/BookingHistory";

const iconOf = facilityIcon;

function Checklist({ items, onToggle }: { items: { label: string; done: boolean }[]; onToggle: (i: number) => void }) {
  const { C, inp } = useAdminStyle();
  if (items.length === 0) return <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>No checklist for this facility.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((c, i) => (
        <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: c.done ? C.textS : C.textB, fontSize: 13, cursor: "pointer" }}>
          <Checkbox checked={c.done} onCheckedChange={() => onToggle(i)} style={{ marginTop: 4 }} />
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
  // A booking has one preparation. Opening it again shows what was saved,
  // so the owner edits it rather than starting a blank list.
  const last = ops.inspections.find((i) => i.bookingId === booking.id && i.stage === "Preparation");
  const [items, setItems] = useState<InspectionItem[]>(() => used.map((f) => {
    const saved = last?.items.find((x) => x.facilityId === f.id);
    return {
      facilityId: f.id, facilityName: f.name, condition: "OK",
      checklist: checklistFor(f, "before").map((label) => ({ label, done: !!saved?.checklist.find((c) => c.label === label)?.done })),
    };
  }));
  const [notes, setNotes] = useState(last?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (fi: number, ci: number) => setItems((xs) => xs.map((x, i) => i !== fi ? x : { ...x, checklist: x.checklist.map((c, j) => j === ci ? { ...c, done: !c.done } : c) }));
  const all = items.every((x) => x.checklist.every((c) => c.done));
  const tickAll = () => setItems((xs) => xs.map((x) => ({ ...x, checklist: x.checklist.map((c) => ({ ...c, done: !all })) })));
  const left = items.reduce((s, x) => s + x.checklist.filter((c) => !c.done).length, 0);

  const save = async () => {
    setError("");
    if (left > 0 && notes.trim().length < 3) return setError(`${left} check${left === 1 ? " isn't" : "s aren't"} ticked. Tick ${left === 1 ? "it" : "them"}, or say in the notes why not.`);
    setBusy(true);
    const r = await ops.savePreparation({ bookingId: booking.id, items, notes });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(last ? `Preparation for ${booking.name} updated.` : `Facilities prepared for ${booking.name}.`, "success");
    onClose();
  };

  return (
    <Modal title={`Prepare for ${booking.name}`} subtitle={<BookingSummary b={booking} />} onClose={onClose} width={980}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: left ? "#d4a800" : "#2e9e4e", fontSize: 13 }}>{left ? `${left} item${left === 1 ? "" : "s"} not ticked yet` : "Everything is ticked"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={tickAll}>{all ? "Untick all" : "Tick all"}</Btn>
            <Btn kind="primary" icon="clipboard-check" disabled={busy} onClick={save}>{busy ? "Saving…" : last ? "Update preparation" : "Mark as prepared"}</Btn>
          </div>
        </div>
      }>
      {last && (
        <p style={{ color: "#2e9e4e", fontSize: 13, marginTop: 0 }}>
          <Icon name="check-circle" size={14} style={{ marginRight: 8, verticalAlign: -2 }} />
          Prepared on {fmtDate(manilaDate(last.inspectedAt))} at {manilaTime(last.inspectedAt)}. Changes here update that record.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 12 }}>
        {items.map((x, fi) => {
          const f = used[fi];
          return (
            <div key={x.facilityId} style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <span style={{ color: C.textH, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><Icon name={iconOf(f)} size={15} />{x.facilityName}</span>
                {f.status !== "Available" && <Pill color={f.status === "Under Maintenance" ? "#d44" : "#d4a800"}>{f.status}</Pill>}
              </div>
              <Checklist items={x.checklist} onToggle={(ci) => toggle(fi, ci)} />
            </div>
          );
        })}
      </div>
      {used.length === 0 && <p style={{ color: C.textS }}>This booking doesn't use any listed facility.</p>}
      <div style={{ marginTop: 16 }}>
        <Label htmlFor="prep-notes">{left > 0 ? "Why isn't everything ticked?" : "Notes (optional)"}</Label>
        <Input id="prep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Extra chairs set up in the venue" style={inp} />
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

// ── Finishing a stay: inspection + final payment, in one window ───────
//
// What happens at the gate as a group leaves: inspect what they used,
// price any damage, and collect what's left. The bill is worked out here
// as the owner goes — the booking total, minus what the guest already paid
// (usually the online down payment), plus the penalties being recorded —
// and the amount to collect fills itself in. One button then:
//
//   1. checks the group in first, if nobody did when they arrived
//      (a stay finished after the fact, from Bookings or an overdue card);
//   2. saves the check-out inspection and damage (/api/checkout), which
//      flags the facilities "Needs Cleaning";
//   3. records the payment in Sales and completes the booking
//      (/api/settle) — or, if the guest pays only part, keeps it under
//      To settle with the rest still owed.
//
// Each step is its own validated route, so a failure part-way leaves the
// booking at a real step (checked out, waiting to settle), never half-done.
interface DamageDraft extends CheckoutDamageInput { key: number; custom: boolean; adjusting: boolean }

export function CheckoutModal({ booking, facilities, onClose, mob }: {
  booking: Booking; facilities: Facility[]; onClose: () => void;
  mob: boolean;
}) {
  const { C, cBr, soft, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const used = facilitiesForBooking(booking, facilities);
  const rates = ops.damageRates.filter((r) => r.active);
  const money = bookingMoney(booking, ops.payments, ops.damages);
  // Read once: checking in part-way through saving must not flip the title.
  const [wasCheckedIn] = useState(() => !!booking.checkedInAt);

  const [items, setItems] = useState<InspectionItem[]>(() => used.map((f) => ({
    facilityId: f.id, facilityName: f.name, condition: "OK",
    checklist: checklistFor(f, "after").map((label) => ({ label, done: false })),
  })));
  const [damages, setDamages] = useState<Record<number, DamageDraft[]>>({});
  const [outOfService, setOutOfService] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (fi: number, ci: number) => setItems((xs) => xs.map((x, i) => i !== fi ? x : { ...x, checklist: x.checklist.map((c, j) => j === ci ? { ...c, done: !c.done } : c) }));
  const allTicked = items.every((x) => x.checklist.every((c) => c.done));
  const tickAll = () => setItems((xs) => xs.map((x) => ({ ...x, checklist: x.checklist.map((c) => ({ ...c, done: !allTicked })) })));
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
  const toCollect = round2(money.balance + money.penaltyDue + newPenalty);

  // ── The payment. Left untouched, the amount follows the bill as damage
  // is added, so "collect everything" needs no typing at all.
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>("Cash");
  const [reference, setReference] = useState("");
  const [closeUnpaid, setCloseUnpaid] = useState(false);
  const [unpaidNote, setUnpaidNote] = useState("");
  const paying = amount === "" ? toCollect : Math.min(toCollect, Math.max(0, round2(Number(amount) || 0)));
  const left = round2(toCollect - paying);
  const completes = left <= 0 || closeUnpaid;

  const save = async () => {
    setError("");
    if (allDamages.some((x) => x.custom && (x.itemName.trim().length < 2 || x.unitRate < 0))) return setError("Name each item that isn't on the rate list, and give it a price.");
    if (allDamages.some((x) => x.adjusting && x.adjustment !== 0 && x.adjustmentReason.trim().length < 3)) return setError("Give a reason for every adjusted penalty.");
    if (paying > 0 && method !== "Cash" && !reference.trim()) return setError(`Enter the ${method} reference number.`);
    if (left > 0 && closeUnpaid && unpaidNote.trim().length < 3) return setError("Say why the guest is leaving with money still owed.");

    setBusy(true);
    if (!booking.checkedInAt) {
      const r = await ops.checkIn(booking.id);
      if (!r.ok) { setBusy(false); return setError(r.error); }
    }
    const r = await ops.checkout({
      bookingId: booking.id,
      items,
      damages: allDamages.map((x) => ({
        facilityName: x.facilityName, rateId: x.custom ? null : x.rateId, itemName: x.itemName, quantity: x.quantity,
        unitRate: x.unitRate, adjustment: x.adjusting ? x.adjustment : 0, adjustmentReason: x.adjusting ? x.adjustmentReason : "", description: x.description,
      })),
      maintenanceFacilityIds: outOfService,
      notes,
    });
    if (!r.ok) { setBusy(false); return setError(r.error); }

    const damageNote = newPenalty > 0 ? ` ${fmt(newPenalty)} in damage penalties.` : "";
    // Nothing paid and nothing to close: the booking simply waits under
    // To settle, as checked out, until the guest pays.
    if (paying <= 0 && !completes) {
      setBusy(false);
      toast(`${booking.name} checked out.${damageNote} ${fmt(left)} is still to collect under To settle.`, "warning");
      return onClose();
    }
    const s = await ops.settle({
      bookingId: booking.id,
      payment: paying > 0 ? { amount: paying, method, reference: reference.trim() } : null,
      closeUnpaid: left > 0 && closeUnpaid,
      note: unpaidNote.trim(),
    });
    setBusy(false);
    if (!s.ok) {
      // The check-out is saved; only the money is missing, and Settle
      // under To settle picks it up from there.
      toast(`${booking.name} is checked out, but the payment wasn't saved: ${s.error} Settle it under To settle.`, "error");
      return onClose();
    }
    if (!completes) toast(`${booking.name} checked out.${damageNote} ${fmt(paying)} recorded; ${fmt(left)} still to collect under To settle.`, "warning");
    else if (left > 0) toast(`${booking.name} completed with ${fmt(left)} unpaid. It stays under Sales → Receivables.`, "warning");
    else toast(`${booking.name}'s stay is complete.${damageNote}${paying > 0 ? ` ${fmt(paying)} recorded in Sales.` : " Nothing was owed."}`, "success");
    onClose();
  };

  const damagedCount = items.filter((x) => x.condition === "Damaged").length;
  const buttonLabel = busy ? "Saving…"
    : completes ? (paying > 0 ? `Complete stay · collect ${fmt(paying)}` : "Complete stay")
      : paying > 0 ? `Check out · record ${fmt(paying)}` : "Check out, collect later";

  return (
    <Modal title={wasCheckedIn ? `Check out ${booking.name}` : `Complete ${booking.name}'s stay`} subtitle={<BookingSummary b={booking} />} onClose={onClose} width={1160}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.textS, fontSize: 13.5 }}>
            {damagedCount ? <><strong style={{ color: "#d44" }}>{fmt(newPenalty)}</strong> in penalties · </> : "No damage · "}
            {left > 0
              ? <strong style={{ color: "#d4a800" }}>{fmt(left)} {closeUnpaid ? "left unpaid" : "still owed after this"}</strong>
              : "Fully paid after this"}
          </span>
          <Btn kind="primary" icon={completes ? "check" : "logout"} disabled={busy} onClick={save}>{buttonLabel}</Btn>
        </div>
      }>
      {!wasCheckedIn && (
        <p style={{ color: "#3a8fc4", fontSize: 13, marginTop: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Icon name="info" size={14} style={{ marginTop: 4, flexShrink: 0 }} />
          This group was never checked in. Completing the stay records the check-in and check-out now.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,1.7fr) minmax(300px,1fr)", gap: 20, alignItems: "start" }}>
        {/* ── Inspection ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: C.textS, fontSize: 13 }}>
              Inspect each facility the group used. Mark it <strong style={{ color: C.textB }}>Damaged</strong> to add a penalty from the rate list.
            </span>
            {items.some((x) => x.checklist.length > 0) && <Btn size="sm" onClick={tickAll}>{allTicked ? "Untick all" : "Tick all"}</Btn>}
          </div>
          {items.map((x, fi) => {
            const f = used[fi];
            const ds = damages[f.id] ?? [];
            return (
              <div key={x.facilityId} style={{ border: `1px solid ${x.condition === "Damaged" ? "rgba(229,85,85,0.45)" : cBr}`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ color: C.textH, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><Icon name={iconOf(f)} size={15} />{x.facilityName}</span>
                  <div style={{ width: 200 }}>
                    <Segmented value={x.condition} onChange={(c) => setCondition(fi, c)} size="sm" options={[
                      { value: "OK", label: "OK" },
                      { value: "Damaged", label: "Damaged" },
                    ]} />
                  </div>
                </div>
                <Checklist items={x.checklist} onToggle={(ci) => toggle(fi, ci)} />

                {x.condition === "Damaged" && (
                  <div style={{ marginTop: 12, borderTop: `1px dashed ${cBr}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    {ds.map((d) => (
                      <div key={d.key} style={{ background: soft, borderRadius: 8, padding: "12px 12px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,2fr) 80px minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
                          <div>
                            <Label>Damaged item</Label>
                            <FullSelect aria-label="Damaged item" value={d.custom ? "custom" : String(d.rateId ?? "")} style={{ ...inp, padding: "8px 36px 8px 12px" }}
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
                            <Input type="number" min={1} value={d.quantity} onChange={(e) => patchDamage(f.id, d.key, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...inp, padding: "8px 12px" }} />
                          </div>
                          <div style={{ color: C.textH, fontWeight: 600, fontSize: 14, paddingBottom: 8, textAlign: "right" }}>
                            {d.quantity} × {fmt(d.unitRate)} = {fmt(lineAmount(d))}
                          </div>
                          <button type="button" onClick={() => removeDamage(f.id, d.key)} aria-label="Remove item" style={{ background: "transparent", border: "none", color: C.textS, cursor: "pointer", paddingBottom: 8 }}><Icon name="trash" size={15} /></button>
                        </div>
                        {d.custom && (
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 8 }}>
                            <Input value={d.itemName} onChange={(e) => patchDamage(f.id, d.key, { itemName: e.target.value })} placeholder="Item name" style={{ ...inp, padding: "8px 12px" }} />
                            <Input type="number" min={0} value={d.unitRate || ""} onChange={(e) => patchDamage(f.id, d.key, { unitRate: Math.max(0, Number(e.target.value) || 0) })} placeholder="Price each (₱)" style={{ ...inp, padding: "8px 12px" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Input value={d.description} onChange={(e) => patchDamage(f.id, d.key, { description: e.target.value })} placeholder="What happened (optional)" style={{ ...inp, padding: "8px 12px", flex: "1 1 220px", width: "auto" }} />
                          <label style={{ color: C.textS, fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
                            <Checkbox checked={d.adjusting} onCheckedChange={(v) => patchDamage(f.id, d.key, { adjusting: v === true })} /> Adjust amount
                          </label>
                        </div>
                        {d.adjusting && (
                          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, marginTop: 8 }}>
                            <Input type="number" value={d.adjustment || ""} onChange={(e) => patchDamage(f.id, d.key, { adjustment: Number(e.target.value) || 0 })} placeholder="− or + ₱" aria-label="Adjustment" style={{ ...inp, padding: "8px 12px" }} />
                            <Input value={d.adjustmentReason} onChange={(e) => patchDamage(f.id, d.key, { adjustmentReason: e.target.value })} placeholder="Reason, e.g. only a small crack, repairable" style={{ ...inp, padding: "8px 12px" }} />
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <Btn size="sm" icon="plus" onClick={() => addDamage(fi)}>Add another item</Btn>
                      <label style={{ color: C.textS, fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
                        <Checkbox checked={outOfService.includes(f.id)} onCheckedChange={(v) => setOutOfService((o) => v === true ? [...o, f.id] : o.filter((id) => id !== f.id))} />
                        Take out of service (Under Maintenance)
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {used.length === 0 && <p style={{ color: C.textS }}>This booking doesn&apos;t use any listed facility.</p>}
          <div>
            <Label htmlFor="co-notes">Inspection notes (optional)</Label>
            <Textarea id="co-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, resize: "none" }}
              placeholder="e.g. Group left the area clean" />
          </div>
        </div>

        {/* ── The bill and the payment ── */}
        <div style={{ position: mob ? "static" : "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>Bill</div>
            <Line label="Booking total" value={fmt(booking.total)} />
            <Line label="Already paid" value={`− ${fmt(Math.min(money.paid, booking.total))}`} color={money.paid > 0 ? "#2e9e4e" : undefined} />
            {money.penaltyDue > 0 && <Line label="Earlier unpaid penalties" value={fmt(money.penaltyDue)} color="#d44" />}
            <Line label={`Damage penalties${allDamages.length ? ` (${allDamages.length} item${allDamages.length === 1 ? "" : "s"})` : ""}`} value={fmt(newPenalty)} color={newPenalty > 0 ? "#d44" : undefined} />
            <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 8, paddingTop: 4 }}>
              <Line label="To collect now" value={fmt(toCollect)} strong color={toCollect > 0 ? "#d4a800" : "#2e9e4e"} />
            </div>
          </div>

          {toCollect > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <Label htmlFor="co-amount">Amount received</Label>
                  {amount !== "" && paying !== toCollect && (
                    <button type="button" onClick={() => setAmount("")} style={{ background: "none", border: "none", padding: 0, color: C.goldInk, fontSize: 12, cursor: "pointer" }}>
                      Use the full {fmt(toCollect)}
                    </button>
                  )}
                </div>
                <Input id="co-amount" type="number" min={0} max={toCollect} value={amount === "" ? String(toCollect) : amount} onChange={(e) => setAmount(e.target.value)} style={inp} />
              </div>
              <div>
                <Label>Paid with</Label>
                <Segmented value={method} onChange={setMethod} size="sm" options={MANUAL_METHODS.map((m) => ({ value: m, label: m }))} />
              </div>
              {method !== "Cash" && paying > 0 && (
                <div>
                  <Label htmlFor="co-ref">{method} reference number</Label>
                  <Input id="co-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={inp} />
                </div>
              )}
              {left > 0 && (
                <>
                  <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>
                    {fmt(left)} will still be owed. The booking waits under <strong style={{ color: C.textB }}>To settle</strong> until it&apos;s paid.
                  </p>
                  <label style={{ color: C.textS, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Checkbox checked={closeUnpaid} onCheckedChange={(v) => setCloseUnpaid(v === true)} style={{ marginTop: 4 }} />
                    Complete it anyway: the guest leaves with {fmt(left)} unpaid (it stays a receivable in Sales)
                  </label>
                  {closeUnpaid && (
                    <div>
                      <Label htmlFor="co-unpaid">Why is it left unpaid?</Label>
                      <Textarea id="co-unpaid" rows={2} value={unpaidNote} onChange={(e) => setUnpaidNote(e.target.value)} style={{ ...inp, resize: "none" }} placeholder="e.g. Will send the rest by GCash tomorrow" />
                    </div>
                  )}
                </>
              )}
              <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>
                The stay balance is paid first, then any damage. Each goes into Sales as its own payment{method === "Cash" ? ", and goes into today's cash box" : ""}.
              </p>
            </div>
          ) : (
            <p style={{ color: "#2e9e4e", fontSize: 13.5, margin: 0 }}>
              <Icon name="check-circle" size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
              Nothing to collect. Everything is already paid.
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </Modal>
  );
}

// ── The itemised tally of one booking ─────────────────────────────────
// What the guest was charged, what they paid, and what is left: the
// per-booking liquidation. Used by SettleModal and by the Sales invoice.
export function BookingStatement({ booking }: { booking: Booking }) {
  const { C, cBr } = useAdminStyle();
  const ops = useOps();
  const money = bookingMoney(booking, ops.payments, ops.damages);
  const slot = SLOTS[getBookingSlot(booking)];
  const overtimeFee = slot.id === "Day" ? (booking.overtime || 0) * OVERTIME_RATE : 0;
  const damages = ops.damages.filter((d) => d.bookingId === booking.id && !d.voided);
  const pays = livePayments(ops.payments).filter((p) => p.bookingId === booking.id)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const sub = { color: C.textS, fontSize: 11.5, letterSpacing: 1.5, margin: "12px 0 4px", fontWeight: 600 } as const;

  return (
    <div>
      <div style={sub}>CHARGES</div>
      <Line label={`${booking.package} · ${slot.label}, ${fmtDate(booking.date)} · ${booking.guests} guests`} value={fmt(round2(booking.total - overtimeFee))} />
      {overtimeFee > 0 && <Line label={`Overtime (${booking.overtime} hr)`} value={fmt(overtimeFee)} />}
      {damages.map((d) => (
        <Line key={d.id} label={`Damage: ${d.itemName} × ${d.quantity} (${d.facilityName})`} value={fmt(d.amount)} color="#d44" />
      ))}
      <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 4, paddingTop: 4 }}>
        <Line label="Total charges" value={fmt(round2(booking.total + money.penaltyTotal))} strong />
      </div>

      <div style={sub}>PAYMENTS</div>
      {pays.map((p) => (
        <Line key={p.id} label={`${p.type} · ${p.method}${p.reference ? ` · ref ${p.reference}` : ""} · ${fmtDate(manilaDate(p.receivedAt))}`}
          value={`${p.type === "Refund" ? "+" : "−"} ${fmt(p.amount)}`} color={p.type === "Refund" ? "#d44" : "#2e9e4e"} />
      ))}
      {pays.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: "4px 0" }}>No payments yet.</p>}

      <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 8, paddingTop: 4 }}>
        {money.balance > 0 && <Line label="Stay balance" value={fmt(money.balance)} color="#d4a800" />}
        {money.penaltyDue > 0 && <Line label="Unpaid penalties" value={fmt(money.penaltyDue)} color="#d44" />}
        <Line label={money.due > 0 ? "Amount due" : "Fully paid"} value={fmt(money.due)} strong color={money.due > 0 ? "#d4a800" : "#2e9e4e"} />
      </div>
      {booking.settledAt && (
        <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0" }}>
          Settled {fmtDate(manilaDate(booking.settledAt))}, {manilaTime(booking.settledAt)}{booking.settlementNote ? `. Closed unpaid: ${booking.settlementNote}` : ""}
        </p>
      )}
    </div>
  );
}

// ── Settle: per-booking liquidation + final payment ───────────────────
export function SettleModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, soft, inp } = useAdminStyle();
  const ops = useOps();
  const { toast } = useToast();
  const money = bookingMoney(booking, ops.payments, ops.damages);
  const owed = money.due;

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>("Cash");
  const [reference, setReference] = useState("");
  const [closeUnpaid, setCloseUnpaid] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const paying = amount === "" ? owed : Math.min(owed, Math.max(0, Number(amount) || 0));
  const left = round2(owed - paying);
  const completes = left <= 0 || closeUnpaid;

  const save = async () => {
    setError("");
    if (paying > 0 && method !== "Cash" && !reference.trim()) return setError(`Enter the ${method} reference number.`);
    if (left > 0 && closeUnpaid && note.trim().length < 3) return setError("Say why it's being settled with money still owed.");
    if (paying <= 0 && !completes) return setError("Enter the amount received, or settle it as unpaid with a reason.");
    setBusy(true);
    const r = await ops.settle({
      bookingId: booking.id,
      payment: paying > 0 ? { amount: paying, method, reference: reference.trim() } : null,
      closeUnpaid: left > 0 && closeUnpaid,
      note: note.trim(),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (completes) {
      toast(left > 0
        ? `${booking.name} settled with ${fmt(left)} unpaid. It stays under Sales → Receivables.`
        : `${booking.name} settled and completed.${paying > 0 ? ` ${fmt(paying)} recorded in Sales.` : ""}`, left > 0 ? "warning" : "success");
    } else {
      toast(`${fmt(paying)} recorded. ${fmt(left)} is still owed before ${booking.name} can be settled.`, "info");
    }
    onClose();
  };

  return (
    <Modal title={`Settle ${booking.name}`} subtitle={<BookingSummary b={booking} />} onClose={onClose} width={860}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.textS, fontSize: 13.5 }}>
            {paying > 0 ? <>Collecting <strong style={{ color: "#2e9e4e" }}>{fmt(paying)}</strong> by {method}</> : "Nothing to collect"}
            {left > 0 && <> · <strong style={{ color: "#d44" }}>{fmt(left)} {closeUnpaid ? "left unpaid" : "still owed"}</strong></>}
          </span>
          <Btn kind="primary" icon={completes ? "check" : "cash"} disabled={busy} onClick={save}>
            {busy ? "Saving…" : completes ? "Settle & complete" : "Record payment"}
          </Btn>
        </div>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ background: soft, borderRadius: 10, padding: "4px 16px 12px" }}>
          <BookingStatement booking={booking} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {owed > 0 ? (
            <>
              <div>
                <Label htmlFor="st-amount">Amount received now</Label>
                <Input id="st-amount" type="number" min={0} max={owed} value={amount === "" ? String(owed) : amount} onChange={(e) => setAmount(e.target.value)} style={inp} />
              </div>
              <div>
                <Label>Paid with</Label>
                <Segmented value={method} onChange={setMethod} size="sm" options={MANUAL_METHODS.map((m) => ({ value: m, label: m }))} />
              </div>
              {method !== "Cash" && (
                <div>
                  <Label htmlFor="st-ref">{method} reference number</Label>
                  <Input id="st-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={inp} />
                </div>
              )}
              {left > 0 && (
                <label style={{ color: C.textS, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Checkbox checked={closeUnpaid} onCheckedChange={(v) => setCloseUnpaid(v === true)} style={{ marginTop: 4 }} />
                  Settle anyway: the guest leaves with {fmt(left)} unpaid (it stays a receivable in Sales)
                </label>
              )}
              {left > 0 && closeUnpaid && (
                <div>
                  <Label htmlFor="st-note">Why is it left unpaid?</Label>
                  <Textarea id="st-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, resize: "none" }} placeholder="e.g. Will send the rest by GCash tomorrow" />
                </div>
              )}
              <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>
                The stay balance is paid first, then the damage penalties. Each is recorded in Sales as its own payment.
              </p>
            </>
          ) : (
            <p style={{ color: "#2e9e4e", fontSize: 14, margin: 0 }}>
              <Icon name="check-circle" size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
              Nothing is owed. Settle to complete the booking.
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </Modal>
  );
}

// ── Everything about one reservation ──────────────────────────────────
// Opened from any card or record: the guest and booking details, how far
// the day has got, the facilities it uses, the money statement, and the
// inspections. Read-only; the steps themselves are buttons on the card.
export function VisitRecord({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, soft, cBr } = useAdminStyle();
  const ops = useOps();
  const { rooms, facilities } = useApp();
  const b = booking;
  const slot = SLOTS[getBookingSlot(b)];
  const prep = ops.inspections.find((i) => i.bookingId === b.id && i.stage === "Preparation");
  const checkout = ops.inspections.find((i) => i.bookingId === b.id && i.stage === "Checkout");
  const damages = ops.damages.filter((d) => d.bookingId === b.id && !d.voided);
  const used = facilitiesForBooking(b, facilities);
  const roomNames = rooms.filter((r) => (b.rooms || []).includes(r.id)).map((r) => r.name);
  const resource = getBookingResource(b);
  const at = (iso?: string | null) => (iso ? `${fmtDate(manilaDate(iso))}, ${manilaTime(iso)}` : null);

  const fields: [string, React.ReactNode][] = [
    ["Visit", b.date ? fmtDate(b.date) : "—"],
    ["Time", `${slot.label} · ${slot.hours}${b.arrivalTime ? ` · arrives ${b.arrivalTime}` : ""}`],
    ["Package", b.package],
    ["Guests", String(b.guests)],
    ["Uses", resource === "Pool+Venue" ? "Pool + events venue" : resource === "Venue" ? "Events venue" : `Pool (${getBookingTier(b)})`],
    ["Rooms", roomNames.length ? roomNames.join(", ") : "None"],
    ...(slot.id === "Day" && b.overtime ? [["Overtime", `${b.overtime} hr`] as [string, string]] : []),
    ["Contact", b.contact || "—"],
    ["Email", b.email || "—"],
    ["Source", b.source ?? "Online"],
    ["Booked on", b.createdAt ? at(new Date(b.createdAt).toISOString()) : "—"],
  ];

  const steps: { label: string; when: string | null; done: boolean }[] = [
    { label: "Booked", when: b.createdAt ? at(new Date(b.createdAt).toISOString()) : null, done: true },
    { label: "Confirmed", when: at(b.confirmedAt), done: b.status === "Confirmed" || b.status === "Completed" },
    { label: "Prepared", when: at(prep?.inspectedAt), done: !!prep },
    { label: "Checked in", when: at(b.checkedInAt), done: !!b.checkedInAt },
    { label: "Checked out", when: at(b.checkedOutAt), done: !!b.checkedOutAt },
    { label: "Settled", when: at(b.settledAt), done: !!b.settledAt || b.status === "Completed" },
  ];

  const Stage = ({ i, title }: { i: Inspection; title: string }) => (
    <div style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <strong style={{ color: C.textH }}>{title}</strong>
        <span style={{ color: C.textS, fontSize: 12.5 }}>{at(i.inspectedAt)}</span>
      </div>
      {i.items.map((it) => {
        const done = it.checklist.filter((c) => c.done).length;
        return (
          <div key={it.facilityId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "4px 0" }}>
            <span style={{ color: C.textB }}>{it.facilityName}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: done < it.checklist.length ? "#d4a800" : C.textS }}>{done}/{it.checklist.length} checked</span>
              {i.stage === "Checkout" && <Pill color={it.condition === "Damaged" ? "#d44" : "#2e9e4e"}>{it.condition}</Pill>}
            </span>
          </div>
        );
      })}
      {i.notes && <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0" }}>Note: {i.notes}</p>}
    </div>
  );

  const heading = { color: C.textH, fontWeight: 600, fontSize: 14, margin: "0 0 8px" } as const;

  return (
    <Modal title={b.name}
      subtitle={<><span style={{ fontFamily: "monospace" }}>{b.id}</span> · <span style={{ color: STATUS_COLOR[b.status] }}>{b.status}</span>{b.checkedOutAt && b.status === "Confirmed" ? " · checked out, to settle" : b.checkedInAt && b.status === "Confirmed" ? " · on site" : ""}</>}
      onClose={onClose} width={1040}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, alignItems: "start" }}>
        {/* ── The reservation ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {fields.map(([l, v]) => (
              <div key={l} style={{ background: soft, borderRadius: 8, padding: "8px 12px", minWidth: 0 }}>
                <div style={{ color: C.textS, fontSize: 11.5 }}>{l}</div>
                <div style={{ color: C.textH, fontSize: 13.5, overflowWrap: "anywhere" }}>{v}</div>
              </div>
            ))}
          </div>
          {(b.notes || b.cancelReason || b.settlementNote) && (
            <div style={{ background: soft, borderRadius: 8, padding: "12px 12px", fontSize: 13, color: C.textB, display: "flex", flexDirection: "column", gap: 4 }}>
              {b.notes && <div><span style={{ color: C.textS }}>Notes: </span>{b.notes}</div>}
              {b.status === "Cancelled" && b.cancelReason && <div style={{ color: "#d44" }}>Cancelled: {b.cancelReason}</div>}
              {b.settlementNote && <div style={{ color: "#d4a800" }}>Settled unpaid: {b.settlementNote}</div>}
            </div>
          )}

          <div>
            <p style={heading}>Progress</p>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {steps.map((st) => (
                <li key={st.label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, padding: "4px 0" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: st.done ? "rgba(46,158,78,0.15)" : "transparent", border: `1px solid ${st.done ? "#2e9e4e" : cBr}`, color: "#2e9e4e" }}>
                    {st.done && <Icon name="check" size={11} />}
                  </span>
                  <span style={{ color: st.done ? C.textH : C.textS, flex: 1 }}>{st.label}</span>
                  <span style={{ color: C.textS, fontSize: 12 }}>{st.when ?? (st.done ? "" : "Not yet")}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p style={heading}>Facilities used</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {used.map((f) => (
                <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 12px", borderRadius: 16, border: `1px solid ${cBr}`, color: C.textB, fontSize: 12.5 }}>
                  <Icon name={iconOf(f)} size={13} />{f.category === "Room" ? f.name.split(" –")[0] : f.name}
                </span>
              ))}
              {used.length === 0 && <span style={{ color: C.textS, fontSize: 13 }}>None listed.</span>}
            </div>
          </div>
        </div>

        {/* ── Money and inspections ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: soft, borderRadius: 10, padding: "4px 16px 12px" }}>
            <BookingStatement booking={b} />
          </div>
          {prep && <Stage i={prep} title="Preparation" />}
          {checkout && <Stage i={checkout} title="Check-out inspection" />}
          {damages.some((d) => d.description || d.adjustment !== 0) && (
            <div style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "12px 16px" }}>
              <strong style={{ color: C.textH, display: "block", marginBottom: 8 }}>Damage notes</strong>
              {damages.filter((d) => d.description || d.adjustment !== 0).map((d) => (
                <div key={d.id} style={{ color: C.textS, fontSize: 12.5, padding: "4px 0" }}>
                  <span style={{ color: C.textB }}>{d.itemName}:</span> {d.description}
                  {d.adjustment !== 0 ? `${d.description ? " · " : ""}adjusted ${d.adjustment > 0 ? "+" : "−"}${fmt(Math.abs(d.adjustment))} (${d.adjustmentReason})` : ""}
                </div>
              ))}
            </div>
          )}
          {!prep && !checkout && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>No inspections recorded yet.</p>}
        </div>
      </div>
      <div style={{ marginTop: 20 }}><BookingHistory bookingId={b.id} /></div>
    </Modal>
  );
}
