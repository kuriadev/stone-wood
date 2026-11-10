"use client";

// ── An emergency request, in Guest Messages
//
// A guest inside the date-change notice window can't cancel or move online,
// so an emergency is sent from Manage booking with proof (lib/emergency.ts).
// Here staff see the proof (loaded only now: it can be a few MB), open the
// booking, and approve or decline. The guest is emailed the answer.
// Approving doesn't move the booking: staff then move it, at no charge, to
// the free date agreed with the guest (Bookings → Move), which runs the
// usual availability checks.

import { useEffect, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { ActionButton, ErrorNote, Modal, useAdminStyle } from "@/components/admin/ui";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/common/Icon";
import { fmtDate } from "@/lib/utils";
import type { ProofFile } from "@/lib/emergency";
import type { CustomerMessage } from "@/types/admin";
import type { Booking } from "@/types/booking";

type Decision = "Approved" | "Declined";

export function EmergencyReview({ message, booking, onOpenBooking, onDecided }: {
  message: CustomerMessage;
  booking: Booking | null;
  onOpenBooking: (id: string) => void;
  onDecided: (patch: Partial<CustomerMessage>) => void;
}) {
  const { C, cBr, soft } = useAdminStyle();
  const { toast } = useToast();
  const [files, setFiles] = useState<ProofFile[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<ProofFile | null>(null);
  const [ask, setAsk] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/customer-service/emergency?id=${message.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j?.success) setFiles(j.files ?? []); else setLoadError(j?.error ?? "Couldn't load the proof."); })
      .catch(() => { if (live) setLoadError("Couldn't load the proof."); });
    return () => { live = false; };
  }, [message.id]);

  const decide = async () => {
    if (!ask) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/customer-service/emergency?id=${message.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: ask, note }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? "Couldn't save the decision.");
      onDecided({ resolution: j.resolution, resolutionNote: j.resolutionNote, resolvedAt: j.resolvedAt, resolvedBy: j.resolvedBy });
      toast(j.emailed ? `Request ${ask.toLowerCase()}. ${message.name} was emailed.` : `Request ${ask.toLowerCase()}, but the email couldn't be sent. Let ${message.name} know.`, j.emailed ? "success" : "warning");
      setAsk(null);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the decision.");
    } finally {
      setBusy(false);
    }
  };

  const done = message.resolution;
  const ref = message.bookingId ?? booking?.id;

  return (
    <section aria-label="Emergency request" style={{ border: `1px solid ${cBr}`, borderRadius: 12, padding: 16, margin: "0 0 18px", background: soft }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <p style={{ margin: 0, color: C.textH, fontWeight: 700, fontSize: 14 }}>Emergency request{ref ? ` · ${ref}` : ""}</p>
          <p style={{ margin: "2px 0 0", color: C.textS, fontSize: 12.5 }}>
            {booking ? `${booking.name} · visit on ${fmtDate(booking.date)}. ` : ""}
            Too close to the visit to cancel or move online. Check the proof, then decide.
          </p>
        </div>
        {done ? (
          <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
            color: done === "Approved" ? "#2e9e4e" : "var(--sw-danger-ink)",
            border: `1px solid ${done === "Approved" ? "#2e9e4e66" : "rgba(214,138,138,0.5)"}` }}>
            {done.toUpperCase()}
          </span>
        ) : (
          <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#f5a524", border: "1px solid #f5a52466" }}>
            WAITING FOR A DECISION
          </span>
        )}
      </div>

      {/* The proof */}
      <p style={{ margin: "0 0 8px", color: C.textS, fontSize: 12, fontWeight: 700, letterSpacing: 1.2 }}>PROOF</p>
      {loadError && <ErrorNote>{loadError}</ErrorNote>}
      {!files && !loadError && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>Loading the proof…</p>}
      {files && files.length === 0 && <p style={{ color: C.textS, fontSize: 13, margin: 0 }}>No files were attached.</p>}
      {files && files.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
          {files.map((f, i) => (
            <button key={i} type="button" onClick={() => setView(f)} title={`View ${f.name}`}
              style={{ aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", border: `1px solid ${cBr}`, background: "transparent", padding: 0, cursor: "zoom-in", display: "grid", placeItems: "center", color: C.textS }}>
              {f.type.startsWith("image/")
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={f.data} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ display: "grid", placeItems: "center", gap: 6, fontSize: 12, padding: 8, textAlign: "center", overflowWrap: "anywhere" }}><Icon name="clipboard" size={22} />{f.name}</span>}
            </button>
          ))}
        </div>
      )}

      {done && (
        <p style={{ color: C.textS, fontSize: 12.5, margin: "12px 0 0" }}>
          {done} by {message.resolvedBy ?? "staff"}{message.resolvedAt ? ` on ${fmtDate(message.resolvedAt.slice(0, 10))}` : ""}.
          {message.resolutionNote ? ` “${message.resolutionNote}”` : ""}
          {done === "Approved" && " Move the booking to the date agreed with the guest, at no charge."}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 14 }}>
        {ref && <ActionButton icon="calendar" onClick={() => onOpenBooking(ref)}>Open booking</ActionButton>}
        {!done && <ActionButton kind="red" icon="x" onClick={() => { setAsk("Declined"); setError(""); }}>Decline</ActionButton>}
        {!done && <ActionButton kind="green" icon="check" onClick={() => { setAsk("Approved"); setError(""); }}>Approve</ActionButton>}
      </div>

      {view && (
        <Modal title={view.name} onClose={() => setView(null)} width={900}
          footer={<ActionButton onClick={() => setView(null)}>Close</ActionButton>}>
          {view.type.startsWith("image/")
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={view.data} alt={view.name} style={{ width: "100%", height: "auto", borderRadius: 8 }} />
            : <iframe title={view.name} src={view.data} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 8, background: "#fff" }} />}
          <p style={{ margin: "10px 0 0", fontSize: 12.5 }}>
            <a href={view.data} download={view.name} style={{ color: C.goldInk }}>Download {view.name}</a>
          </p>
        </Modal>
      )}

      {ask && (
        <Modal
          title={ask === "Approved" ? "Approve this emergency request?" : "Decline this emergency request?"}
          subtitle={ask === "Approved"
            ? `${message.name} is emailed that it's approved and that the booking moves to a free date at no charge. Then move it from the booking.`
            : `${message.name} is emailed that it couldn't be approved, with your reason. The booking stays as it is.`}
          onClose={() => !busy && setAsk(null)}
          footer={<>
            <ActionButton onClick={() => setAsk(null)} disabled={busy}>Back</ActionButton>
            <ActionButton kind={ask === "Approved" ? "green" : "red"} icon={ask === "Approved" ? "check" : "x"} disabled={busy || (ask === "Declined" && note.trim().length < 5)} onClick={() => void decide()}>
              {busy ? "Saving…" : ask === "Approved" ? "Approve & email" : "Decline & email"}
            </ActionButton>
          </>}>
          <label htmlFor="sw-emerg-note" style={{ display: "block", color: C.textH, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {ask === "Approved" ? "Add a note for the guest (optional)" : "Why it was declined"}
          </label>
          <Textarea id="sw-emerg-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={600}
            style={{ padding: 12, borderRadius: 10, border: `1px solid ${cBr}`, background: "transparent", color: C.textB, fontSize: 14 }} />
          <ErrorNote>{error}</ErrorNote>
        </Modal>
      )}
    </section>
  );
}
