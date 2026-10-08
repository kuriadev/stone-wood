"use client";

/* Fixing a guest's own details on an existing booking.
 *
 * People mistype their phone number or give the wrong email, then ring the
 * resort to correct it. Before this the only way through was to cancel and
 * rebook, which moved the money and freed the date — a heavy answer to a
 * typo.
 *
 * Scope is deliberate. This edits WHO the booking is for, never WHAT it is:
 * the date, the guest count, the package, the resource and the tier all
 * decide what is owed or what is free, so they keep their own flows where
 * price and availability are recomputed. A booking's money cannot drift
 * because someone fixed a surname here.
 *
 * It works on a live booking too — a group already checked in can still have
 * a wrong number corrected.
 */

import { useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { Modal, Btn, Label, ErrorNote, useAdminStyle } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { SPACE } from "@/lib/spacing";
import type { Booking } from "@/types/booking";

interface EditGuestModalProps {
  booking: Booking;
  onSaved: (patch: { name: string; contact: string; email: string }) => void;
  onClose: () => void;
}

export function EditGuestModal({ booking, onSaved, onClose }: EditGuestModalProps) {
  const { C, inp } = useAdminStyle();
  const { toast } = useToast();

  const [name, setName] = useState(booking.name ?? "");
  const [contact, setContact] = useState(booking.contact ?? "");
  const [email, setEmail] = useState(booking.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    name.trim() !== (booking.name ?? "").trim() ||
    contact.trim() !== (booking.contact ?? "").trim() ||
    email.trim() !== (booking.email ?? "").trim();

  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim(), email: email.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Could not save those details.");
        return;
      }
      // The server sanitises and validates, so the saved row is the truth —
      // not what was typed here.
      const saved = json.booking ?? {};
      onSaved({
        name: saved.name ?? name.trim(),
        contact: saved.contact ?? contact.trim(),
        email: saved.email ?? email.trim(),
      });
      toast("Guest details updated.", "success");
      onClose();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Edit guest details"
      subtitle={`${booking.id} · ${booking.date}`}
      onClose={onClose}
      width={520}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: SPACE.xs }}>
          <Btn kind="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" icon="check" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save details"}
          </Btn>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <div>
          <Label>FULL NAME</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus />
        </div>
        <div>
          <Label>MOBILE NUMBER</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} style={inp} inputMode="tel" placeholder="09XXXXXXXXX" />
        </div>
        <div>
          <Label>EMAIL ADDRESS</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} inputMode="email" />
        </div>

        <p style={{ display: "flex", gap: SPACE.xs, alignItems: "flex-start", color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
          <Icon name="info" size={14} style={{ marginTop: 3, flexShrink: 0, color: C.goldInk }} />
          <span>
            This changes who the booking is for. The date, guest count and package
            stay as they are — those affect the price and the calendar, so they
            have their own tools. Every edit is recorded in the Audit Log.
          </span>
        </p>

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
