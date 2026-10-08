"use client";

// ── Add a charge on the day: overtime, extra guests, or a room
//
// For money the group owes on top of what they booked (lib/charges.ts has the
// rules and prices). The price shown here is the same calculation the server
// repeats before saving. Saving raises the booking's total; the money is then
// collected like any balance, at Check out, Settle or Record a payment, so it
// reaches Sales and the day's cash count.

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { chargeKindsFor, priceCharge, type ChargeKind } from "@/lib/charges";
import { bookingMoney } from "@/lib/finance";
import { SLOTS, TURNOVER_WINDOW } from "@/lib/resort";
import { fmt, fmtDate, getBookingSlot, roomsTakenOn } from "@/lib/utils";
import { OVERTIME_MAX, OVERTIME_RATE, SHARED_PER_HEAD_RATE } from "@/lib/validators";
import type { Booking } from "@/types/booking";
import { Btn, ErrorNote, FullSelect, Label, Line, Modal, Segmented, useAdminStyle } from "@/components/admin/ui";

const KIND_LABEL: Record<ChargeKind, string> = { overtime: "Overtime", guests: "Extra guests", room: "A room" };

export function AddChargeModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C, soft, inp } = useAdminStyle();
  const { rooms, bookings } = useApp();
  const ops = useOps();
  const { toast } = useToast();

  const blocked = chargeKindsFor(booking);
  const kinds = (Object.keys(KIND_LABEL) as ChargeKind[]);
  const [kind, setKind] = useState<ChargeKind>(kinds.find((k) => !blocked[k]) ?? "overtime");
  const [hours, setHours] = useState("1");
  const [extra, setExtra] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slot = getBookingSlot(booking);
  const hoursLeft = OVERTIME_MAX - (booking.overtime ?? 0);
  // Rooms someone else has that day (the server checks again).
  const taken = roomsTakenOn(booking.date, slot, bookings.filter((x) => x.id !== booking.id), booking.overtime ?? 0);
  const roomChoices = rooms.filter((r) => !(booking.rooms ?? []).includes(r.id));

  const priced = priceCharge(booking, { kind, hours: Number(hours), guests: Number(extra), roomId: Number(roomId) }, rooms);
  const due = bookingMoney(booking, ops.payments, ops.damages).due;

  const save = async () => {
    setError("");
    if (!priced.ok) return setError(priced.error);
    setBusy(true);
    const r = await ops.addCharge(booking.id, { kind, hours: Number(hours), guests: Number(extra), roomId: Number(roomId) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(`Added ${priced.label} for ${booking.name}: +${fmt(priced.amount)}. Collect it at check-out or settle.`, "success");
    onClose();
  };

  return (
    <Modal title="Add a charge" subtitle={`${booking.name} · ${booking.id} · ${fmtDate(booking.date)}, ${SLOTS[slot].label}`} onClose={onClose} width={560}
      footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" icon="plus" disabled={busy || !priced.ok} onClick={() => void save()}>
          {busy ? "Saving…" : priced.ok ? `Add ${fmt(priced.amount)}` : "Add charge"}
        </Btn>
      </div>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ color: C.textS, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          For anything the group takes on top of what they booked. It&apos;s added to the booking&apos;s total and collected with the balance, so it shows in Sales and in the day&apos;s cash count.
        </p>

        <div>
          <Label>What for</Label>
          <Segmented<ChargeKind> value={kind} onChange={(k) => { setKind(k); setError(""); }} size="sm" label="What for"
            options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k], disabled: !!blocked[k], hint: blocked[k] ?? undefined }))} />
          {blocked[kind] && <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0" }}>{blocked[kind]}</p>}
        </div>

        {kind === "overtime" && !blocked.overtime && (
          <div>
            <Label>Hours</Label>
            <Segmented<string> value={hours} onChange={setHours} size="sm" label="Hours"
              options={Array.from({ length: hoursLeft }, (_, i) => String(i + 1)).map((h) => ({ value: h, label: `${h} hr` }))} />
            <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.6 }}>
              {fmt(OVERTIME_RATE)} per hour after {SLOTS.Day.end}. It uses the cleaning time ({TURNOVER_WINDOW}), so it&apos;s only possible when no Night group is booked that day.
              {(booking.overtime ?? 0) > 0 && <> Already has {booking.overtime} hr.</>}
            </p>
          </div>
        )}

        {kind === "guests" && !blocked.guests && (
          <div>
            <Label htmlFor="ch-guests">How many more guests came?</Label>
            <Input id="ch-guests" type="number" min={1} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. 3" style={inp} />
            <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0" }}>
              {fmt(SHARED_PER_HEAD_RATE)} each. Booked for {booking.guests}.
            </p>
          </div>
        )}

        {kind === "room" && !blocked.room && (
          <div>
            <Label htmlFor="ch-room">Room</Label>
            <FullSelect id="ch-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} style={inp}>
              <option value="">Choose a room</option>
              {roomChoices.map((r) => (
                <option key={r.id} value={r.id} disabled={taken.has(r.id)}>
                  {r.name} · {fmt(r.price * SLOTS[slot].span)}{taken.has(r.id) ? " (taken that day)" : ""}
                </option>
              ))}
            </FullSelect>
          </div>
        )}

        {priced.ok && (
          <div style={{ background: soft, borderRadius: 10, padding: "8px 16px" }}>
            <Line label={`Charge: ${priced.label}`} value={`+ ${fmt(priced.amount)}`} />
            <Line label="New booking total" value={fmt(booking.total + priced.amount)} />
            <Line label="To collect from the guest" value={fmt(due + priced.amount)} strong />
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
