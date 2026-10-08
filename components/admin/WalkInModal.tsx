"use client";

// ── Encode a walk-in reservation
//
// Landscape, three columns, so the whole form fits a laptop screen without
// scrolling: guest details | what they are booking | price and payment.
// The close button is in the top-right corner, and the total with the Save
// button sits in a footer that never scrolls away.
//
// Pricing and availability are unchanged from the old Walk-In tab: the same
// priceBooking() and checkBookingAvailability() the online Book Now flow and
// the server use. What is new is the payment section: the money taken at
// the desk is recorded in the payments ledger (see /api/bookings POST),
// instead of a "payment collected" checkbox that recorded nothing.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { fmt } from "@/lib/utils";
import { getPackageTier, checkBookingAvailability, isRoomOpen, roomsTakenOn } from "@/lib/utils";
import { priceBooking, bookingLabel } from "@/lib/pricing";
import { SLOTS } from "@/lib/resort";
import { manilaDate } from "@/lib/finance";
import {
  sanitizeName, sanitizeContact, isValidName, isValidPHNumber, isValidEmail,
  RESORT_MAX_CAPACITY, ROOM_BUNDLE_DISCOUNT_PCT,
} from "@/lib/validators";
import { DESK_METHODS } from "@/types/finance";
import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";
import type { Room } from "@/types/room";
import type { Facility } from "@/types/facility";
import type { ResortPackage } from "@/types/package";
import { gold } from "@/lib/styles";
import { Icon } from "@/components/common/Icon";
import { Modal, Label, Segmented, Btn, Line, ErrorNote, useAdminStyle, FullSelect } from "@/components/admin/ui";

type PayChoice = "Full" | "Downpayment" | "None";

export function WalkInModal({
  bookings, setBookings, rooms, packages, facilities, onClose, mob,
}: {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  packages: ResortPackage[];
  facilities: Facility[];
  onClose: () => void;
  mob: boolean;
}) {
  const { C, soft, cBr, inp } = useAdminStyle();
  const { toast } = useToast();

  const [wf, setWf] = useState({
    name: "", contact: "", email: "", guests: "10",
    slot: "Day" as BookingSlot, rooms: [] as number[], date: manilaDate(), notes: "",
  });
  const set = (k: keyof typeof wf, v: unknown) => setWf((f) => ({ ...f, [k]: v }));

  const [mode, setMode] = useState<"Custom" | "Package">("Custom");
  const [pkgId, setPkgId] = useState<number | null>(null);
  const pkg = mode === "Package" ? packages.find((p) => p.id === pkgId) ?? null : null;
  const isPkg = !!pkg;
  const requiresRoom = !!pkg?.requiresRoom;
  const bookableRooms = rooms.filter((r) => isRoomOpen(r.id, facilities));

  /* The walk-in desk could only ever book the pool: `resource` was the
     literal "Pool" for a custom tour, so the events venue -- which pricing,
     availability and the API have all handled all along -- was reachable
     online but not at the front desk. */
  const [resourceChoice, setResourceChoice] = useState<BookingResource>("Pool");
  const resource: BookingResource = isPkg ? pkg!.resource : resourceChoice;
  const usesPool = resource !== "Venue";

  const slot: BookingSlot = pkg?.slotMode === "WholeDay" ? "WholeDay" : isPkg && wf.slot === "WholeDay" ? "Day" : wf.slot;
  /* The desk does not sell overtime, so a walk-in is always booked for the
     slot as it stands. Availability, pricing and the saved record all still
     take the figure -- it is simply always zero here. */
  const overtime = 0;
  const takenRooms = roomsTakenOn(wf.date, slot, bookings, overtime);
  const showRooms = (!isPkg || requiresRoom) && usesPool;
  const toggleRoom = (id: number) => {
    if (requiresRoom) set("rooms", wf.rooms.includes(id) ? [] : [id]);
    else set("rooms", wf.rooms.includes(id) ? wf.rooms.filter((r) => r !== id) : [...wf.rooms, id]);
  };

  const label = bookingLabel({ packageTitle: pkg?.title, resource, slot, hasRoom: wf.rooms.length > 0 });
  const guests = isPkg ? pkg!.capacity : Number(wf.guests) || 0;
  const [tierChoice, setTierChoice] = useState<BookingTier | null>(null);
  // The venue is always exclusive, whatever else is chosen -- the same rule
  // the quote engine applies server-side (lib/bookingQuote.ts).
  const tier: BookingTier = isPkg
    ? pkg!.status
    : !usesPool
      ? "Exclusive"
      : slot === "WholeDay" ? "Exclusive" : (tierChoice ?? getPackageTier(guests));

  useEffect(() => {
    if (!isPkg && usesPool && tier === "Exclusive" && guests !== RESORT_MAX_CAPACITY) set("guests", String(RESORT_MAX_CAPACITY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, isPkg, usesPool]);

  const capacity = wf.date
    ? checkBookingAvailability(wf.date, slot, guests, tier, resource, bookings, facilities, overtime)
    : { ok: true as const };
  const selectedRooms = wf.rooms.map((id) => rooms.find((r) => r.id === id)).filter((r): r is Room => !!r);
  const price = priceBooking({
    pkg: isPkg ? { price: pkg!.price, requiresRoom } : null,
    resource, tier, slot, guests, overtime,
    roomPrices: selectedRooms.map((r) => r.price),
  });
  const total = price.total;
  const down = Math.ceil(total / 2);

  // ── Payment at the desk ────────────────────────────────────────────
  const [payChoice, setPayChoice] = useState<PayChoice>("Full");
  const [method, setMethod] = useState<(typeof DESK_METHODS)[number]>("Cash");
  const [reference, setReference] = useState("");
  const payNow = payChoice === "Full" ? total : payChoice === "Downpayment" ? down : 0;

  const roomOk = !requiresRoom || wf.rooms.length > 0;
  const roomsFree = wf.rooms.every((r) => !takenRooms.has(r));
  const emailOk = !wf.email.trim() || isValidEmail(wf.email);
  const refOk = payChoice === "None" || method === "Cash" || reference.trim().length > 0;

  const problems: string[] = [];
  if (!isValidName(wf.name)) problems.push("Enter the guest's name.");
  if (!isValidPHNumber(wf.contact)) problems.push("Enter an 11-digit PH mobile number (09…).");
  if (!emailOk) problems.push("That email address isn't valid.");
  if (mode === "Package" && !pkg) problems.push("Choose a package.");
  if (!roomOk) problems.push("Choose the room included in this package.");
  if (!roomsFree) problems.push("A chosen room is already booked for this slot.");
  if (guests <= 0) problems.push("Enter the number of guests.");
  if (!capacity.ok) problems.push(capacity.reason ?? "That date and slot is not available.");
  if (!refOk) problems.push(`Enter the ${method} reference number.`);
  const [tried, setTried] = useState(false);

  const save = () => {
    setTried(true);
    if (problems.length) return;
    setBookings((b) => [...b, {
      id: `TMP-${Date.now()}`,
      name: sanitizeName(wf.name),
      contact: sanitizeContact(wf.contact),
      email: wf.email.trim(),
      date: wf.date || manilaDate(),
      guests: guests || 1,
      package: label,
      rooms: wf.rooms,
      overtime,
      slot,
      total,
      downpayment: down,
      status: payChoice === "None" ? "Pending" : "Confirmed",
      paymentProof: payChoice !== "None",
      notes: wf.notes,
      source: "Walk-In",
      createdAt: Date.now(),
      resource,
      tier,
      initialPayment: payChoice === "None" ? undefined : { type: payChoice, method, amount: payNow, reference: reference.trim() },
      // The server prices the walk-in itself; it needs to know the package.
      walkInPackageCode: pkg?.code,
    }]);
    toast(payChoice === "None"
      ? `Walk-in saved for ${wf.name}. It stays Pending until they pay.`
      : `Walk-in saved for ${wf.name}. ${fmt(payNow)} recorded in Sales.`, "success");
    onClose();
  };

  const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 };
  const choice = (on: boolean): React.CSSProperties => ({
    padding: "8px 12px", fontSize: 12.5, borderRadius: 7, cursor: "pointer",
    background: on ? `${gold}1c` : "transparent", color: on ? C.goldInk : C.textS, border: `1px solid ${on ? gold + "66" : cBr}`,
  });

  return (
    <Modal
      title="New walk-in reservation"
      subtitle="For a guest reserving at the front desk"
      onClose={onClose}
      width={1120}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: C.textS, fontSize: 13.5 }}>
            <strong style={{ color: C.textH, fontSize: 16 }}>{fmt(total)}</strong> total
            {" · "}
            {payChoice === "None" ? "nothing collected yet" : <>collecting <strong style={{ color: "#2e9e4e" }}>{fmt(payNow)}</strong> now by {method}</>}
          </div>
          <Btn kind="primary" icon="check" onClick={save}>Save reservation</Btn>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1.25fr 1fr", gap: 24 }}>
        {/* ── Guest ── */}
        <div style={col}>
          <div>
            <Label htmlFor="wi-name">Guest name</Label>
            <Input id="wi-name" value={wf.name} onChange={(e) => set("name", sanitizeName(e.target.value))} placeholder="Juan Dela Cruz" style={inp} />
          </div>
          <div>
            <Label htmlFor="wi-contact">Contact number</Label>
            <Input id="wi-contact" value={wf.contact} onChange={(e) => set("contact", sanitizeContact(e.target.value))} maxLength={11} placeholder="09XXXXXXXXX" style={inp} />
          </div>
          <div>
            <Label htmlFor="wi-email">Email (optional)</Label>
            <Input id="wi-email" value={wf.email} onChange={(e) => set("email", e.target.value)} placeholder="example@email.com" style={inp} />
          </div>
          <div>
            <Label htmlFor="wi-date">Date</Label>
            <Input id="wi-date" type="date" value={wf.date} onChange={(e) => set("date", e.target.value)} style={inp} />
          </div>
          <div>
            <Label htmlFor="wi-notes">Notes (optional)</Label>
            <Textarea id="wi-notes" value={wf.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Special requests" style={{ ...inp, resize: "none" }} />
          </div>
        </div>

        {/* ── Booking ── */}
        <div style={col}>
          <div>
            <Label>Booking type</Label>
            <Segmented value={mode} onChange={(m) => { setMode(m); if (m === "Custom") setPkgId(null); }} options={[
              { value: "Custom", label: <><Icon name="toolbox" size={13} style={{ marginRight: 8 }} />Custom tour</> },
              { value: "Package", label: <><Icon name="gift" size={13} style={{ marginRight: 8 }} />Package</> },
            ]} />
          </div>

          {mode === "Custom" && (
            <div>
              <Label>Facility</Label>
              <Segmented<BookingResource>
                value={resourceChoice}
                size="sm"
                onChange={(r) => {
                  setResourceChoice(r);
                  // A venue-only booking cannot carry rooms, so anything
                  // already picked is dropped rather than silently rejected
                  // on save.
                  if (r === "Venue") set("rooms", []);
                }}
                options={[
                  { value: "Pool", label: "Pool" },
                  { value: "Venue", label: "Events venue" },
                  { value: "Pool+Venue", label: "Pool + venue" },
                ]}
              />
            </div>
          )}

          {mode === "Package" ? (
            <div>
              <Label>Package</Label>
              <FullSelect aria-label="Package" value={pkgId ?? ""} onChange={(e) => { setPkgId(e.target.value ? Number(e.target.value) : null); set("rooms", []); }} style={inp}>
                <option value="">Choose a package…</option>
                {packages.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.title} · {fmt(p.price)} · up to {p.capacity}</option>
                ))}
              </FullSelect>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 12 }}>
              <div>
                <Label htmlFor="wi-guests">Guests</Label>
                {/* An exclusive POOL buyout is the whole resort, so the count
                    is fixed. A venue booking is exclusive too, but only of the
                    venue -- the headcount is still whatever group walked in,
                    which is what the server stores (lib/bookingQuote.ts). */}
                <Input id="wi-guests" type="number" min={1} max={RESORT_MAX_CAPACITY} value={wf.guests} disabled={usesPool && tier === "Exclusive"}
                  onChange={(e) => set("guests", e.target.value)} style={{ ...inp, opacity: usesPool && tier === "Exclusive" ? 0.6 : 1 }} />
              </div>
              <div>
                <Label>Pool use</Label>
                {usesPool ? (
                  <Segmented<BookingTier> value={tier} onChange={setTierChoice} size="sm" options={[
                    { value: "Shared", label: "Shared" },
                    { value: "Exclusive", label: "Exclusive" },
                  ]} />
                ) : (
                  <p style={{ color: C.textS, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.5 }}>
                    No pool on this booking. The events venue is always exclusive.
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <Label>When</Label>
            {pkg?.slotMode === "WholeDay" ? (
              <p style={{ color: C.textH, fontSize: 13.5, margin: 0 }}>Whole day · {SLOTS.WholeDay.hours}</p>
            ) : (
              <Segmented<BookingSlot> value={slot} size="sm"
                onChange={(t) => set("slot", t)}
                options={((isPkg ? ["Day", "Night"] : ["Day", "Night", "WholeDay"]) as BookingSlot[]).map((t) => ({ value: t, label: SLOTS[t].label, hint: SLOTS[t].hours }))} />
            )}
          </div>

          {showRooms && (
            <div>
              <Label>{requiresRoom ? `Room (included, ${Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}% off)` : "Rooms (optional)"}</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {bookableRooms.map((r) => {
                  const on = wf.rooms.includes(r.id);
                  const taken = takenRooms.has(r.id) && !on;
                  return (
                    <button key={r.id} type="button" disabled={taken} onClick={() => toggleRoom(r.id)} style={{ ...choice(on), opacity: taken ? 0.4 : 1, cursor: taken ? "not-allowed" : "pointer" }}>
                      {on && <Icon name="check" size={12} style={{ marginRight: 4 }} />}{r.name}{taken ? " · booked" : ""}
                    </button>
                  );
                })}
                {bookableRooms.length === 0 && <span style={{ color: C.textS, fontSize: 13 }}>No rooms open. Check Facilities for maintenance flags.</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── Price & payment ── */}
        <div style={col}>
          <div style={{ background: soft, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ color: C.textH, fontWeight: 600, marginBottom: 4 }}>{label} <span style={{ color: tier === "Exclusive" ? C.goldInk : "#2e9e4e", fontSize: 12, fontWeight: 500 }}>· {tier}</span></div>
            {/* One line per thing being charged. A single "pool" line read
                wrong the moment the venue could be booked without one. */}
            {isPkg ? (
              <Line label="Package" value={fmt(price.tourBase + price.exclusiveDiscount + price.bundleDiscount)} />
            ) : (
              <>
                {price.poolFee > 0 && (
                  <Line
                    label={tier === "Exclusive" ? `Exclusive pool${price.slots === 2 ? " × 2 slots" : ""}` : `Shared pool (${guests} × ₱200)`}
                    value={fmt(price.poolFee)}
                  />
                )}
                {price.venueFee > 0 && (
                  <Line label={`Events venue${price.slots === 2 ? " × 2 slots" : ""}`} value={fmt(price.venueFee)} />
                )}
              </>
            )}
            {price.exclusiveDiscount + price.bundleDiscount > 0 && (
              <Line label={price.bundleDiscount > 0 ? "Bundle discount" : "Exclusive discount"} value={`−${fmt(price.exclusiveDiscount + price.bundleDiscount)}`} color="#2e9e4e" />
            )}
            {price.roomsFeeRaw > 0 && <Line label="Rooms" value={fmt(price.roomsFeeRaw)} />}
            {price.roomBundleDiscount > 0 && <Line label="Room discount" value={`−${fmt(price.roomBundleDiscount)}`} color="#2e9e4e" />}
            <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 8, paddingTop: 4 }}>
              <Line label="Total" value={fmt(total)} strong />
            </div>
          </div>

          <div>
            <Label>Payment now</Label>
            <Segmented<PayChoice> value={payChoice} onChange={setPayChoice} size="sm" options={[
              { value: "Full", label: "Full", hint: fmt(total) },
              { value: "Downpayment", label: "50% down", hint: fmt(down) },
              { value: "None", label: "Not yet" },
            ]} />
          </div>
          {payChoice !== "None" && (
            <>
              <div>
                <Label>Paid with</Label>
                <Segmented value={method} onChange={setMethod} size="sm" options={DESK_METHODS.map((m) => ({ value: m, label: m }))} />
              </div>
              {method !== "Cash" && (
                <div>
                  <Label htmlFor="wi-ref">{method} reference number</Label>
                  <Input id="wi-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={inp} />
                </div>
              )}
            </>
          )}
          <p style={{ color: C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
            {payChoice === "None"
              ? "Saved as Pending. It becomes Confirmed once a payment is recorded."
              : payChoice === "Downpayment"
                ? `Saved as Confirmed. The remaining ${fmt(total - down)} is collected at check-out.`
                : "Saved as Confirmed and paid in full."}
          </p>
          {tried && problems.length > 0 && <ErrorNote>{problems[0]}</ErrorNote>}
          {!tried && !capacity.ok && <ErrorNote>{capacity.reason}</ErrorNote>}
        </div>
      </div>
    </Modal>
  );
}
