"use client";

// ── Bookings (capstone objective 3)
//
// Every reservation in one place, online and walk-in alike: walk-ins are
// encoded from here (+ New walk-in) rather than on a separate page that
// repeated the same table, search and statuses.
//
// Search covers name, ID, email, phone, date and package. Filters narrow by
// status, source, slot and a date range, and work in the Archived view too.
// Each row shows what has actually been paid (from the payments ledger), and
// the details window lists every payment with a button to record another.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useOps } from "@/contexts/OpsContext";
import { bookingMoney, manilaDate, manilaTime, livePayments } from "@/lib/finance";
import { fmt, fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { OVERTIME_RATE } from "@/lib/validators";
import type { Booking, BookingSlot } from "@/types/booking";
import type { Room } from "@/types/room";
import type { Facility } from "@/types/facility";
import type { ResortPackage } from "@/types/package";
import { gold } from "@/lib/styles";
import { Icon } from "@/components/common/Icon";
import { WalkInModal } from "@/components/admin/WalkInModal";
import { RecordPaymentModal } from "@/components/admin/RecordPaymentModal";
import { CheckoutModal } from "@/components/admin/InspectionModals";
import {
  PageHead, TableShell, td, Btn, Pill, Modal, Label, Line, useAdminStyle, STATUS_COLOR, MONEY_COLOR, Row, Cell, ConfirmDialog, ViewTabs,
} from "@/components/admin/ui";

interface BookingsTabProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  updateStatus: (id: string, status: string, reason?: string) => void;
  mob: boolean;
  rooms: Room[];
  packages: ResortPackage[];
  facilities: Facility[];
}

const STATUSES = ["All", "Pending", "Confirmed", "Completed", "Cancelled"] as const;

export function BookingsTab({ bookings, setBookings, updateStatus, mob, rooms, packages, facilities }: BookingsTabProps) {
  const { C, rowBg, cBr, soft, inp } = useAdminStyle();
  const { toast } = useToast();
  const ops = useOps();

  const [bView, setBView] = useState<"active" | "archived">("active");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"All" | "Online" | "Walk-In">("All");
  const [slot, setSlot] = useState<"All" | BookingSlot>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [walkIn, setWalkIn] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Booking | null>(null);
  const [confirm, setConfirm] = useState<{ b: Booking; action: "Confirmed" | "Cancelled" } | null>(null);
  const [reason, setReason] = useState("");
  const [archiveOf, setArchiveOf] = useState<Booking | null>(null);

  const q = search.toLowerCase().trim();
  const pool = bookings.filter((b) => (bView === "archived" ? !!b.archived : !b.archived));
  const filteredNoStatus = pool.filter((b) => {
    if (source !== "All" && (b.source ?? "Online") !== source) return false;
    if (slot !== "All" && getBookingSlot(b) !== slot) return false;
    if (from && b.date < from) return false;
    if (to && b.date > to) return false;
    return !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) ||
      (b.email || "").toLowerCase().includes(q) || b.contact.includes(q) || b.date.includes(q) || b.package.toLowerCase().includes(q);
  });
  const rows = (status === "All" ? filteredNoStatus : filteredNoStatus.filter((b) => b.status === status))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const filtersOn = source !== "All" || slot !== "All" || !!from || !!to || !!q;
  const clear = () => { setSource("All"); setSlot("All"); setFrom(""); setTo(""); setSearch(""); };

  const viewing = bookings.find((b) => b.id === viewId) ?? null;

  const act = () => {
    if (!confirm) return;
    const { b, action } = confirm;
    if (action === "Cancelled") {
      const why = reason.trim() || "Your booking did not meet our current availability or requirements.";
      updateStatus(b.id, "Cancelled", why);
      setBookings((bs) => bs.map((x) => x.id === b.id ? { ...x, cancelReason: why } : x));
      toast(`Booking ${b.id} rejected.`, "warning");
    } else {
      updateStatus(b.id, "Confirmed");
      toast(`Booking accepted for ${b.name}.`, "success");
    }
    setConfirm(null); setReason("");
  };

  const sel = { ...inp, padding: "8px 10px", width: "auto" } as const;

  // One list layout for both tabs (the Archived tab just filters to
  // archived rows), rendered into each TabsContent like Customer Service.
  const listPanel = (
    <>
      {/* Status */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {STATUSES.map((s) => {
          const n = s === "All" ? filteredNoStatus.length : filteredNoStatus.filter((b) => b.status === s).length;
          const on = status === s;
          const col = s === "All" ? gold : STATUS_COLOR[s];
          return (
            <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={on}
              style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 600, borderRadius: 20, cursor: "pointer", background: on ? `${col}1c` : "transparent", color: on ? col : C.textS, border: `1px solid ${on ? col + "77" : cBr}` }}>
              {s} ({n})
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.45, color: C.textH }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, ID, email, phone, date or package" aria-label="Search bookings" style={{ ...sel, width: "100%", paddingLeft: 32 }} />
        </div>
        <NativeSelect value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Source" style={sel}>
          <option value="All">All sources</option><option>Online</option><option>Walk-In</option>
        </NativeSelect>
        <NativeSelect value={slot} onChange={(e) => setSlot(e.target.value as typeof slot)} aria-label="Slot" style={sel}>
          <option value="All">All slots</option>
          {(["Day", "Night", "WholeDay"] as BookingSlot[]).map((s) => <option key={s} value={s}>{SLOTS[s].label}</option>)}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Visit date from" style={sel} />
        <span style={{ color: C.textS, fontSize: 13 }}>to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Visit date to" style={sel} />
        {filtersOn && <Btn size="sm" onClick={clear}>Clear</Btn>}
      </div>

      <TableShell head={["ID", "Guest", "Visit", "Package", "Source", "Total", "Paid", "Status", ""]} minWidth={1020}
        empty={rows.length === 0 ? (filtersOn ? "No bookings match these filters." : status === "All" ? "No bookings yet." : `No ${status.toLowerCase()} bookings.`) : undefined}>
        {rows.map((b, i) => {
          const m = bookingMoney(b, ops.payments, ops.damages);
          const s = SLOTS[getBookingSlot(b)];
          return (
            <Row key={b.id} style={{ background: rowBg(i) }}>
              <Cell style={{ ...td, color: gold, fontFamily: "monospace", whiteSpace: "nowrap" }}>{b.id.startsWith("TMP-") ? "Saving…" : b.id}</Cell>
              <Cell style={{ ...td, color: C.textH }}>{b.name}<div style={{ color: C.textS, fontSize: 11.5 }}>{b.contact}</div></Cell>
              <Cell style={{ ...td, color: C.textB, whiteSpace: "nowrap" }}>{fmtDate(b.date)}<div style={{ color: C.textS, fontSize: 11.5 }}>{s.label}</div></Cell>
              <Cell style={{ ...td, color: C.textS, fontSize: 12.5 }}>{b.package}</Cell>
              <Cell style={td}><Pill color={b.source === "Walk-In" ? "#3a8fc4" : gold}>{b.source ?? "Online"}</Pill></Cell>
              <Cell style={{ ...td, color: C.textH, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(b.total)}</Cell>
              <Cell style={{ ...td, whiteSpace: "nowrap" }}>
                <span style={{ color: C.textB }}>{fmt(m.paid)}</span>
                <div><span style={{ color: MONEY_COLOR[m.state], fontSize: 11.5 }}>{m.state}{m.due > 0 && b.status !== "Cancelled" ? ` · ${fmt(m.due)} owed` : ""}</span></div>
              </Cell>
              <Cell style={td}><Pill color={STATUS_COLOR[b.status]}>{b.status}</Pill></Cell>
              <Cell style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ display: "inline-flex", gap: 5 }}>
                  <Btn size="sm" onClick={() => setViewId(b.id)}>View</Btn>
                  {!b.archived && b.status === "Pending" && <>
                    <Btn size="sm" kind="green" onClick={() => setConfirm({ b, action: "Confirmed" })}>Accept</Btn>
                    <Btn size="sm" kind="red" onClick={() => { setReason(""); setConfirm({ b, action: "Cancelled" }); }}>Reject</Btn>
                  </>}
                  {!b.archived && b.status === "Confirmed" && <Btn size="sm" kind="blue" icon="logout" onClick={() => setCheckout(b)}>Check out</Btn>}
                  {!b.archived && (b.status === "Completed" || b.status === "Cancelled") && <Btn size="sm" onClick={() => setArchiveOf(b)}>Archive</Btn>}
                  {b.archived && <Btn size="sm" onClick={() => { setBookings((bs) => bs.map((x) => x.id === b.id ? { ...x, archived: false, archivedAt: undefined } : x)); toast(`${b.id} restored.`, "success"); }}>Restore</Btn>}
                </div>
              </Cell>
            </Row>
          );
        })}
      </TableShell>
    </>
  );

  return (
    <div>
      <PageHead title="Bookings" mob={mob} subtitle="Online and walk-in reservations."
        action={<Btn kind="primary" icon="plus" onClick={() => setWalkIn(true)}>New walk-in</Btn>} />

      <ViewTabs<"active" | "archived"> value={bView} onChange={setBView} views={[
        { value: "active", label: `Active (${bookings.filter((b) => !b.archived).length})`, content: listPanel },
        { value: "archived", label: `Archived (${bookings.filter((b) => !!b.archived).length})`, content: listPanel },
      ]} />

      {/* ── Details ── */}
      {viewing && (() => {
        const b = viewing;
        const m = bookingMoney(b, ops.payments, ops.damages);
        const s = SLOTS[getBookingSlot(b)];
        const overtimeFee = s.id === "Day" ? (b.overtime || 0) * OVERTIME_RATE : 0;
        const bookedRooms = rooms.filter((r) => (b.rooms || []).includes(r.id));
        const pays = ops.payments.filter((p) => p.bookingId === b.id);
        return (
          <Modal title={b.name} subtitle={<><span style={{ color: gold, fontFamily: "monospace" }}>{b.id}</span> · {b.source ?? "Online"} · booked {b.createdAt ? fmtDate(manilaDate(new Date(b.createdAt))) : "—"}</>}
            onClose={() => setViewId(null)} width={900}
            footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              {m.due > 0 && b.status !== "Cancelled" && <Btn kind="green" icon="cash" onClick={() => setPayFor(b.id)}>Record payment</Btn>}
              {b.status === "Confirmed" && !b.archived && <Btn kind="blue" icon="logout" onClick={() => { setViewId(null); setCheckout(b); }}>Check out</Btn>}
            </div>}>
            <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 18 }}>
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[["Visit", `${fmtDate(b.date)}`], ["Time", `${s.label} · ${s.hours}`], ["Contact", b.contact], ["Email", b.email || "—"], ["Guests", `${b.guests}`], ["Status", b.status]].map(([l, v]) => (
                    <div key={l} style={{ background: soft, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ color: C.textS, fontSize: 11.5 }}>{l}</div>
                      <div style={{ color: C.textH, fontSize: 13.5 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {b.arrivalTime && <p style={{ color: C.textB, fontSize: 13, margin: "0 0 8px" }}>Arrival time: {b.arrivalTime}</p>}
                <div style={{ border: `1px solid ${cBr}`, borderRadius: 10, padding: "10px 14px" }}>
                  <Line label={b.package} value={fmt(Math.max(0, b.total - overtimeFee))} />
                  {overtimeFee > 0 && <Line label={`Overtime (${b.overtime} hr)`} value={fmt(overtimeFee)} />}
                  {bookedRooms.map((r) => <Line key={r.id} label={r.name} value="included" />)}
                  <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 4, paddingTop: 4 }}><Line label="Total" value={fmt(b.total)} strong /></div>
                </div>
                {b.notes && <p style={{ color: C.textS, fontSize: 13, marginTop: 10 }}>Notes: {b.notes}</p>}
                {b.status === "Cancelled" && b.cancelReason && <p style={{ color: "#d44", fontSize: 13, marginTop: 10 }}>Cancelled: {b.cancelReason}</p>}
              </div>
              <div>
                <div style={{ background: soft, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                  <Line label="Paid for the stay" value={fmt(m.paid)} />
                  <Line label={b.status === "Cancelled" ? "Balance (forfeited, not owed)" : "Balance"} value={fmt(b.status === "Cancelled" ? Math.max(0, b.total - m.paid) : m.balance)} color={m.balance > 0 ? "#d4a800" : undefined} />
                  {m.penaltyTotal > 0 && <Line label="Damage penalties" value={`${fmt(m.penaltyTotal)} (${fmt(m.penaltyDue)} unpaid)`} color="#d44" />}
                  <div style={{ borderTop: `1px solid ${cBr}`, marginTop: 4, paddingTop: 4 }}>
                    <Line label="Still owed" value={fmt(m.due)} strong color={m.due > 0 ? "#d4a800" : "#2e9e4e"} />
                  </div>
                </div>
                <div style={{ color: C.textH, fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Payments</div>
                {pays.length === 0 && <p style={{ color: C.textS, fontSize: 13 }}>No payments recorded yet.</p>}
                {pays.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${cBr}`, opacity: p.voided ? 0.5 : 1 }}>
                    <div>
                      <div style={{ color: C.textH, fontSize: 13 }}>{p.type} · {p.method}{p.voided ? " · voided" : ""}</div>
                      <div style={{ color: C.textS, fontSize: 11.5 }}>{fmtDate(manilaDate(p.receivedAt))}, {manilaTime(p.receivedAt)}{p.reference ? ` · ref ${p.reference}` : ""}</div>
                    </div>
                    <div style={{ color: p.type === "Refund" ? "#d44" : C.textH, fontWeight: 600, textDecoration: p.voided ? "line-through" : "none" }}>{p.type === "Refund" ? "−" : ""}{fmt(p.amount)}</div>
                  </div>
                ))}
                {livePayments(pays).length > 0 && <p style={{ color: C.textS, fontSize: 12, marginTop: 8 }}>To correct a payment, void it in Sales → Transactions.</p>}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Accept / reject ── */}
      {confirm && (
        <ConfirmDialog
          title={confirm.action === "Confirmed" ? "Accept this booking?" : "Reject this booking?"}
          description={`${confirm.b.name} · ${confirm.b.id} · ${fmtDate(confirm.b.date)}`}
          onCancel={() => { setConfirm(null); setReason(""); }}
          cancelLabel="Go back"
          confirm={<Btn kind={confirm.action === "Confirmed" ? "green" : "red"} onClick={act}>{confirm.action === "Confirmed" ? "Accept booking" : "Reject booking"}</Btn>}
          width={500}>
          {confirm.action === "Confirmed" ? (
            <p style={{ color: C.textS, fontSize: 14, margin: 0 }}>
              {confirm.b.email ? `A confirmation email goes to ${confirm.b.email}.` : "This guest has no email, so no confirmation is sent."}
            </p>
          ) : (
            <div>
              <p style={{ color: C.textS, fontSize: 14, marginTop: 0 }}>
                Under the no-refund policy, any down payment already received stays recorded as income.
              </p>
              <Label htmlFor="reject-reason">Reason sent to the guest</Label>
              <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The resort is fully booked for that date." style={{ ...inp, resize: "none" }} />
            </div>
          )}
        </ConfirmDialog>
      )}

      {archiveOf && (
        <ConfirmDialog title={`Archive ${archiveOf.id}?`} description={`${archiveOf.name} · ${archiveOf.status}`} onCancel={() => setArchiveOf(null)}
          confirm={<Btn kind="primary" onClick={() => {
            setBookings((bs) => bs.map((x) => x.id === archiveOf.id ? { ...x, archived: true, archivedAt: new Date().toISOString() } : x));
            toast(`${archiveOf.id} archived.`, "info"); setArchiveOf(null);
          }}>Archive</Btn>}>
          <p style={{ color: C.textS, fontSize: 14, margin: 0 }}>It moves to the Archived list. Its payments and inspection records are kept, and you can restore it any time.</p>
        </ConfirmDialog>
      )}

      {walkIn && <WalkInModal bookings={bookings} setBookings={setBookings} rooms={rooms} packages={packages} facilities={facilities} mob={mob} onClose={() => setWalkIn(false)} />}
      {payFor && <RecordPaymentModal bookings={bookings} bookingId={payFor} onClose={() => setPayFor(null)} />}
      {checkout && <CheckoutModal booking={checkout} facilities={facilities} mob={mob} onClose={() => setCheckout(null)} />}
    </div>
  );
}
