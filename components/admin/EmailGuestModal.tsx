"use client";

// ── Email a guest from the card they are standing on
//
// This replaced a pair of `sms:` / `mailto:` links. Those handed the job to
// whatever mail client the front-desk machine happened to have configured,
// which at a resort desk is usually none: the link opened nothing, or it
// opened a personal account, so the guest got a message from an address
// they had never seen and the resort had no record of it.
//
// The note goes out through /api/email from the resort's own Gmail account,
// on the resort's letterhead, and lands in the activity log with its text.
// The Text link is gone with it — a phone is not a channel this app can
// send on, and a dead button is worse than no button.

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal, ActionButton, useAdminStyle } from "@/components/admin/ui";
import { useToast } from "@/contexts/ToastContext";
import { defaultGuestSubject, GUEST_MESSAGE_MAX, GUEST_SUBJECT_MAX } from "@/lib/emailTemplate";
import { stayLabel } from "@/lib/utils";
import type { Booking } from "@/types/booking";

export function EmailGuestModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C } = useAdminStyle();
  const { toast } = useToast();
  const [subject, setSubject] = useState(defaultGuestSubject(booking));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A walk-in encoded at the desk may have no email at all. Say so plainly
  // rather than letting staff type a note that has nowhere to go.
  const canSend = Boolean(booking.email) && message.trim().length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking, type: "message", subject, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "The email could not be sent.");
      toast(`Emailed ${booking.name} at ${booking.email}.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The email could not be sent.");
    } finally {
      setSending(false);
    }
  };

  /* Who this is going to, straight from the booking and not editable. The
     point of the panel is to make the address obvious BEFORE sending —
     staff should never have to trust that the right guest is selected. */
  const rows: [string, string][] = [
    ["Guest", booking.name],
    ["Booking", booking.id],
    ["Email", booking.email || "— none on this booking"],
    ["Contact", booking.contact || "—"],
    ["Visit", stayLabel(booking)],
  ];

  return (
    <Modal
      title="Email guest"
      subtitle={booking.email ? `Sent from the resort's account to ${booking.email}` : "This booking has no email address"}
      onClose={onClose}
      width={580}
      footer={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", display: "grid" }}>
            <ActionButton onClick={onClose} disabled={sending}>Cancel</ActionButton>
          </div>
          <div style={{ flex: "1 1 140px", display: "grid" }}>
            <ActionButton kind="primary" icon="mail" onClick={send} disabled={!canSend}>
              {sending ? "Sending…" : "Email"}
            </ActionButton>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: "12px 14px",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 16,
            rowGap: 8,
          }}
        >
          {rows.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} muted={C.textS} strong={C.textH} />
          ))}
        </div>

        <div>
          <Label htmlFor="eg-subject">Subject</Label>
          <Input
            id="eg-subject"
            value={subject}
            maxLength={GUEST_SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={defaultGuestSubject(booking)}
          />
        </div>

        <div>
          <Label htmlFor="eg-message">Message</Label>
          <Textarea
            id="eg-message"
            rows={7}
            value={message}
            maxLength={GUEST_MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Your room is ready early if you'd like to come at 1 PM."
            className="resize-none"
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
            <span style={{ color: C.textS, fontSize: 11.5 }}>
              Their booking details are added underneath automatically.
            </span>
            <span style={{ color: message.length >= GUEST_MESSAGE_MAX ? "#e55" : C.textS, fontSize: 11.5, fontFamily: "monospace" }}>
              {message.length}/{GUEST_MESSAGE_MAX}
            </span>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: "#e07a7a", fontSize: 13, margin: 0 }}>{error}</p>
        )}
      </div>
    </Modal>
  );
}

/** One label/value pair in the recipient panel. */
function DetailRow({ label, value, muted, strong }: { label: string; value: string; muted: string; strong: string }) {
  return (
    <>
      <span style={{ color: muted, fontSize: 12 }}>{label}</span>
      <span style={{ color: strong, fontSize: 12.5, fontWeight: 600, wordBreak: "break-word" }}>{value}</span>
    </>
  );
}
