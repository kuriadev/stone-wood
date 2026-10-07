"use client";

/* Moving a booking's date by hand.
 *
 * The guest's own date change is the normal path: they pick, the date is
 * held, the owner approves. This is the manual one, for everything that path
 * cannot reach — someone who phoned instead of using the website, a date
 * agreed over Messenger, or a request that went wrong and has to be put right.
 *
 * It is not a bypass. POST /api/bookings/[id]/move runs the same `checkMove`
 * the guest route uses, so a closed, full or already-taken date is refused
 * here too, and the calendar below is the same component the guest sees —
 * green means genuinely free, with pending holds already counted as taken.
 *
 * The move is recorded as a date change by "Resort", so it appears in
 * Reschedules next to the guest-initiated ones.
 */

import { useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { Modal, Btn, Label, ErrorNote, useAdminStyle } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { AvailabilityCalendar } from "@/components/common/AvailabilityCalendar";
import { SPACE } from "@/lib/spacing";
import { fmtDate } from "@/lib/utils";
import { withHolds } from "@/lib/rebooking";
import { useOps } from "@/contexts/OpsContext";
import { useApp } from "@/contexts/AppContext";
import type { Booking } from "@/types/booking";

interface MoveBookingModalProps {
  booking: Booking;
  onMoved: (b: Booking) => void;
  onClose: () => void;
}

export function MoveBookingModal({ booking, onMoved, onClose }: MoveBookingModalProps) {
  const { C, soft, inp } = useAdminStyle();
  const { toast } = useToast();
  const ops = useOps();
  // The calendar needs the whole picture, not just this tab's slice.
  const { bookings, closedDates } = useApp();

  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  // A date another guest is holding is not free, so the calendar must see it.
  const withHeld = withHolds(bookings, ops.dateChanges);

  const move = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, note: note.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Could not move that booking.");
        setConfirming(false);
        return;
      }
      toast(`${booking.id} moved to ${fmtDate(date)}.`, "success");
      onMoved(json.booking as Booking);
      onClose();
    } catch {
      setError("Could not reach the server. Try again.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Move this booking"
      subtitle={`${booking.name} · ${booking.id}`}
      onClose={onClose}
      width={620}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.xs, flexWrap: "wrap" }}>
          <Btn kind="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          {confirming ? (
            <div style={{ display: "flex", gap: SPACE.xs }}>
              <Btn kind="ghost" onClick={() => setConfirming(false)} disabled={busy}>Back</Btn>
              <Btn kind="primary" icon="check" onClick={() => void move()} disabled={busy}>
                {busy ? "Moving…" : `Yes, move to ${fmtDate(date)}`}
              </Btn>
            </div>
          ) : (
            <Btn kind="primary" icon="calendar" disabled={!date || busy} onClick={() => setConfirming(true)}>
              {date ? `Move to ${fmtDate(date)}` : "Pick a date"}
            </Btn>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <div style={{ background: soft, borderRadius: 10, padding: `${SPACE.sm}px ${SPACE.md}px`, display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}>
          <span style={{ color: C.textS, fontSize: 13 }}>{fmtDate(booking.date)}</span>
          <Icon name="arrow-right" size={14} style={{ color: C.goldInk }} />
          <span style={{ color: date ? C.textH : C.textXS, fontSize: 13, fontWeight: date ? 600 : 400 }}>
            {date ? fmtDate(date) : "choose below"}
          </span>
          <span style={{ color: C.textXS, fontSize: 12, marginLeft: "auto" }}>
            {booking.guests} guest{booking.guests === 1 ? "" : "s"} · same package and slot
          </span>
        </div>

        {confirming ? (
          <p style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
            This moves <strong style={{ color: C.textH }}>{booking.id}</strong> to{" "}
            <strong style={{ color: C.textH }}>{fmtDate(date)}</strong> straight away and emails{" "}
            {booking.email ? <strong style={{ color: C.textH }}>{booking.email}</strong> : "the guest"} to tell them.
            The payment carries over and the preparation checklist resets for the new date.
          </p>
        ) : (
          <>
            <AvailabilityCalendar
              bookings={withHeld.filter((x) => x.id !== booking.id)}
              closedDates={closedDates}
              selectedDate={date}
              onSelectDate={(d) => { setDate(d); setError(""); }}
            />
            <div>
              <Label>WHY (OPTIONAL — SHOWS IN ACTIVITY AND RESCHEDULES)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} style={inp} placeholder="Guest called to move it" />
            </div>
            <p style={{ color: C.textXS, fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              Only free dates can be picked — the server checks availability again
              when you confirm, so a date someone took in the meantime is refused
              rather than double-booked.
            </p>
          </>
        )}

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
