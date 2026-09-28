"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cancelBookingLookup, type CancelBookingLookup } from "@/lib/schemas";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt, fmtDate } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import type { Booking, BookingSlot } from "@/types/booking";
import { Icon, type IconName } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";

interface ManageBookingProps {
  onGoHome?: () => void;
}

/** The three things a guest can do with a booking they have found.
 *
 *  Only `cancel` has an endpoint of its own. A reschedule or a detail
 *  correction is a REQUEST: it goes to the same inbox the contact form feeds,
 *  tagged with the booking reference, and staff act on it. Nothing here
 *  silently mutates a reservation, which is also what the notice under each
 *  form tells the guest. */
type ActionKey = "reschedule" | "details" | "cancel";

const ACTIONS: { key: ActionKey; icon: IconName; title: string; sub: string }[] = [
  { key: "reschedule", icon: "calendar", title: "Request a schedule change", sub: "Choose a different available date" },
  { key: "details", icon: "message", title: "Update guest details", sub: "Correct your contact information" },
  { key: "cancel", icon: "shield-alert", title: "Request cancellation", sub: "Subject to the booking policy" },
];

const CANCEL_REASONS = ["Emergency", "Booked by mistake", "Change of plans", "Other"];

export function ManageBooking(_props: ManageBookingProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  const {
    register: registerLookup,
    handleSubmit: submitLookup,
    watch: watchLookup,
    setValue: setLookupValue,
    formState: { errors: lookupErrors },
  } = useForm<CancelBookingLookup>({
    resolver: zodResolver(cancelBookingLookup),
    mode: "onSubmit",
    defaultValues: { reference: "", email: "" },
  });

  const refInput = watchLookup("reference");
  const emailInput = watchLookup("email");

  const [found, setFound] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelDone, setCancelDone] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [action, setAction] = useState<ActionKey | null>(null);
  const [requestText, setRequestText] = useState("");
  const [requestSending, setRequestSending] = useState(false);
  const [requestDone, setRequestDone] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Deep link from the confirmation email: ?booking=SW-10105&email=…
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get("booking");
    const mail = q.get("email");
    if (ref) setLookupValue("reference", ref);
    if (mail) setLookupValue("email", mail);
  }, [setLookupValue]);

  const handleFind = submitLookup(async ({ reference: ref, email: mail }) => {
    if (looking) return;
    setSearched(true);
    setCancelDone(false);
    setErrorMsg(null);
    setAction(null);
    setRequestDone(false);
    setLooking(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(ref)}?email=${encodeURIComponent(mail)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.booking) {
        setFound(json.booking as Booking);
        setNotFound(false);
      } else {
        setFound(null);
        setNotFound(true);
        if (res.status !== 404) setErrorMsg(json?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFound(null);
      setNotFound(true);
      setErrorMsg("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  });

  // Cancels on the server. Previously this only changed the browser's copy,
  // so the admin never saw the cancellation and the date stayed blocked.
  const confirmCancel = async () => {
    if (!found || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(found.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (emailInput ?? "").trim().toLowerCase(), reason: cancelReason ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.booking) throw new Error(json?.error ?? "Could not cancel the booking.");
      setFound(json.booking as Booking);
      setCancelDone(true);
      setShowCancelConfirm(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not cancel the booking.");
    } finally {
      setCancelling(false);
    }
  };

  /** Reschedule / detail-change requests ride the customer-service inbox,
   *  with the reference in the body so staff can find the reservation. */
  const sendRequest = async () => {
    if (!found || requestSending || requestText.trim().length < 10) return;
    setRequestSending(true);
    setRequestError(null);
    try {
      const kind = action === "reschedule" ? "Schedule change" : "Guest detail update";
      const res = await fetch("/api/customer-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: found.name,
          email: found.email,
          type: "Inquiry",
          message: `[${kind} request — booking ${found.id}]\n\n${requestText.trim()}`,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) throw new Error(json?.error ?? "Could not send your request.");
      setRequestDone(true);
      setRequestText("");
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setRequestSending(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "Confirmed") return "#4caf50";
    if (s === "Pending") return "#f5c518";
    if (s === "Cancelled") return "#e55555";
    if (s === "Completed") return "#4a9fd4";
    return "#888";
  };

  const card: React.CSSProperties = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: mob ? "22px 18px" : "32px 34px",
    boxShadow: C.shadowCard,
  };

  const microLabel: React.CSSProperties = { color: C.textS, fontSize: 10.5, letterSpacing: 1.8, margin: "0 0 6px" };
  const eyebrow: React.CSSProperties = { color: C.goldInk, fontSize: 11, letterSpacing: 2.2, fontWeight: 700, margin: 0 };

  /* The warning red. The pale pink the cancel controls use is legible on the
     dark card and washes out on the light one, so this follows the theme. */
  const dangerInk = isDark ? "#e8b4b4" : "#a02c2c";

  const slotHours = found?.slot ? SLOTS[found.slot as BookingSlot]?.hours : null;
  const balance = found ? Math.max(0, found.total - found.downpayment) : 0;
  const closed = found?.status === "Cancelled" || found?.status === "Completed";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "40px 16px 64px" : "80px 24px 96px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: mob ? 30 : 44 }}>
          <p style={{ ...eyebrow, letterSpacing: 3.4, marginBottom: 14 }}>MANAGE BOOKING</p>
          <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 32 : 52, color: C.textH, fontWeight: 400, margin: "0 0 12px", lineHeight: 1.1 }}>
            Your stay, in one place
          </h1>
          <p style={{ color: C.textS, fontSize: mob ? 14 : 15, lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            Find your reservation to review its status, update your details, or request a schedule change.
          </p>
        </div>

        {/* ── FIND ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleFind} style={{ ...card, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22 }}>
            <span
              aria-hidden="true"
              style={{ width: 52, height: 52, borderRadius: "50%", background: `${gold}1a`, border: `1px solid ${gold}55`, display: "flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}
            >
              <Icon name="calendar" size={22} strokeWidth={1.6} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...eyebrow, marginBottom: 8 }}>FIND YOUR RESERVATION</p>
              <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 21 : 26, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>
                Enter the details from your confirmation email.
              </h2>
            </div>
          </div>

          {/* The button shares the row on desktop so the whole lookup reads as
              one action, and stacks on a phone where three across would put
              every control under 44px. */}
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr auto", gap: 14, alignItems: "end" }}>
            <div>
              <Label htmlFor="mb-ref" className="mb-1.5 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>
                BOOKING REFERENCE
              </Label>
              <Input
                id="mb-ref"
                {...registerLookup("reference")}
                placeholder="Example: SW-00000"
                autoComplete="off"
                aria-invalid={!!lookupErrors.reference}
              />
            </div>
            <div>
              <Label htmlFor="mb-email" className="mb-1.5 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>
                EMAIL ADDRESS
              </Label>
              <Input
                id="mb-email"
                type="email"
                {...registerLookup("email")}
                placeholder="Email used for booking"
                autoComplete="email"
                aria-invalid={!!lookupErrors.email}
              />
            </div>
            <button
              type="submit"
              disabled={looking}
              style={{ ...goldBtn, opacity: looking ? 0.5 : 1, cursor: looking ? "wait" : "pointer", whiteSpace: "nowrap" }}
            >
              {looking ? "SEARCHING…" : <>FIND BOOKING <span aria-hidden="true">&rarr;</span></>}
            </button>
          </div>

          {/* Pressing Find with an empty box used to do nothing at all — the
              resolver rejected and no message was shown. */}
          {(lookupErrors.reference || lookupErrors.email) && (
            <p style={{ color: "#e07a7a", fontSize: 12.5, margin: "12px 0 0" }}>
              {lookupErrors.reference?.message ?? lookupErrors.email?.message}
            </p>
          )}

          <p style={{ display: "flex", alignItems: "center", gap: 7, color: C.textS, fontSize: 12, margin: "16px 0 0" }}>
            <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0 }}><Icon name="lock" size={13} strokeWidth={1.6} /></span>
            Your reservation information is encrypted and secure.
          </p>
        </form>

        {/* ── NOT FOUND ───────────────────────────────────────────────── */}
        {searched && notFound && !looking && (
          <div style={{ ...card, marginBottom: 20, borderColor: "rgba(224,122,122,0.4)" }}>
            <h3 style={{ color: "#e07a7a", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 21, fontWeight: 400, margin: "0 0 8px" }}>
              We couldn&rsquo;t find that reservation
            </h3>
            <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
              {errorMsg ?? "Check the reference and the email address used to book, then try again."}
            </p>
          </div>
        )}

        {/* ── FOUND ───────────────────────────────────────────────────── */}
        {found && (
          <>
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <span className="sw-live-dot" aria-hidden="true" style={{ color: "#4caf50" }} />
                <span style={{ color: "#4caf50", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>BOOKING FOUND</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "auto 1.4fr repeat(3, minmax(0,1fr)) auto", gap: mob ? 16 : 20, alignItems: "center" }}>
                {/* A reservation record carries no photograph, so this is a
                    mark rather than a picture of a room the guest may not
                    have booked. */}
                <span
                  aria-hidden="true"
                  style={{ width: 84, height: 62, borderRadius: 10, background: `linear-gradient(135deg, ${gold}26, ${gold}0d)`, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}
                >
                  <Icon name="pool" size={24} strokeWidth={1.5} />
                </span>

                <div style={{ minWidth: 0 }}>
                  <p style={microLabel}>PRIVATE RESORT RESERVATION</p>
                  <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 23, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>
                    {found.package || "Resort booking"}
                  </h3>
                </div>

                {/* "Check-out" would be wrong here: the resort sells day-use
                    slots, so a booking has one date and a time slot. */}
                <div>
                  <p style={microLabel}>DATE</p>
                  <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{fmtDate(found.date)}</p>
                </div>
                <div>
                  <p style={microLabel}>TIME SLOT</p>
                  <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{slotHours ?? "—"}</p>
                </div>
                <div>
                  <p style={microLabel}>GUESTS</p>
                  <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{found.guests} guests</p>
                </div>

                <div style={{ textAlign: mob ? "left" : "right" }}>
                  <p style={microLabel}>REFERENCE</p>
                  <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 700, margin: "0 0 8px", fontFamily: "monospace" }}>{found.id}</p>
                  <Badge
                    variant="outline"
                    style={{ background: `${statusColor(found.status)}1f`, color: statusColor(found.status), border: `1px solid ${statusColor(found.status)}59`, fontSize: 10.5, letterSpacing: 1.4, padding: "3px 10px", borderRadius: 999 }}
                  >
                    {found.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20, display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 18 }}>
                {([
                  ["TOTAL AMOUNT", fmt(found.total)],
                  ["DEPOSIT PAID", fmt(found.downpayment)],
                  ["BALANCE ON ARRIVAL", fmt(balance)],
                  ["BOOKED ON", found.createdAt ? new Date(found.createdAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"],
                ] as const).map(([l, v]) => (
                  <div key={l}>
                    <p style={microLabel}>{l}</p>
                    <p style={{ color: C.goldInk, fontSize: 17, fontFamily: "'Cormorant Garamond',Georgia,serif", margin: 0, lineHeight: 1.3 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── ACTIONS ───────────────────────────────────────────── */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                <div>
                  <p style={{ ...eyebrow, marginBottom: 9 }}>MANAGE YOUR RESERVATION</p>
                  <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 28, fontWeight: 400, margin: 0, lineHeight: 1.15 }}>
                    What would you like to do?
                  </h3>
                </div>
                <a href="/customer" style={{ color: C.textS, fontSize: 12.5, textDecoration: "underline", paddingTop: mob ? 0 : 18 }}>
                  Contact support
                </a>
              </div>

              {closed ? (
                <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
                  This reservation is {found.status.toLowerCase()}, so there is nothing left to change. Contact support if you think that is wrong.
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 14 }}>
                    {ACTIONS.map((a) => {
                      const on = action === a.key;
                      return (
                        <button
                          key={a.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { setAction(on ? null : a.key); setRequestDone(false); setRequestError(null); }}
                          style={{
                            background: on ? `${gold}12` : C.bgCard2,
                            border: `1px solid ${on ? gold : C.border}`,
                            borderRadius: 12,
                            padding: "18px 18px",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "border-color .18s, background .18s",
                          }}
                        >
                          <span style={{ display: "block", marginBottom: 12, color: a.key === "cancel" ? "#d68a8a" : C.goldInk, lineHeight: 0 }}>
                            <Icon name={a.icon} size={20} strokeWidth={1.6} />
                          </span>
                          <span style={{ display: "block", color: C.textH, fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{a.title}</span>
                          <span style={{ display: "block", color: C.textS, fontSize: 12, lineHeight: 1.5 }}>{a.sub}</span>
                        </button>
                      );
                    })}
                  </div>

                  {action && <div style={{ borderTop: `1px solid ${C.border}`, margin: "26px 0 22px" }} />}

                  {/* Cancellation */}
                  {action === "cancel" && !cancelDone && (
                    <>
                      <p style={{ ...eyebrow, color: C.goldInk, marginBottom: 10 }}>CANCELLATION REQUEST</p>
                      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 16px" }}>
                        Help us understand why your plans changed. This step is optional.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
                        {CANCEL_REASONS.map((r) => {
                          const on = cancelReason === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setCancelReason(on ? null : r)}
                              style={{
                                minHeight: 48,
                                borderRadius: 10,
                                border: `1px solid ${on ? gold : C.border}`,
                                background: on ? `${gold}12` : C.bgCard2,
                                color: on ? C.goldInk : C.textB,
                                fontSize: 13,
                                cursor: "pointer",
                                padding: "0 12px",
                              }}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>

                      {/* The money consequence, stated before the request is
                          sent rather than only in the confirm dialog. The
                          policy itself is not new -- Book Now states it at
                          checkout ("Payments are non-refundable once
                          submitted") and the ledger treats a cancelled
                          booking's deposit as forfeited (lib/finance.ts).
                          This page was the one place a guest could reach it
                          without being told. */}
                      <div
                        role="note"
                        style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid rgba(214,138,138,0.45)", background: "rgba(180,70,70,0.10)", borderRadius: 10, padding: "14px 16px", margin: "0 0 12px" }}
                      >
                        {/* A pale pink reads on the dark card and disappears on
                            the light one, so the red follows the theme rather
                            than the panel it happens to sit in. */}
                        <span aria-hidden="true" style={{ color: dangerInk, lineHeight: 0, flexShrink: 0, marginTop: 2 }}><Icon name="shield-alert" size={15} strokeWidth={1.8} /></span>
                        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                          <strong style={{ display: "block", color: dangerInk, fontSize: 13, letterSpacing: 0.3, marginBottom: 3 }}>
                            No refunds
                          </strong>
                          <span style={{ color: C.textS }}>
                            {found.paymentProof
                              ? <>The {fmt(found.downpayment)} already paid on this booking is not returned if you cancel, and it cannot be moved to another date.</>
                              : <>Anything already paid on this booking is not returned if you cancel, and it cannot be moved to another date.</>}
                            {" "}The resort may make an exception, but only it can decide that.
                          </span>
                        </span>
                      </div>

                      <p style={{ display: "flex", gap: 9, alignItems: "flex-start", border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 20px" }}>
                        <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0, marginTop: 1 }}><Icon name="shield-alert" size={14} strokeWidth={1.6} /></span>
                        Submitting a request does not immediately cancel your stay. The resort will review your eligibility and contact you by email.
                      </p>

                      {cancelError && (
                        <p style={{ color: "#e07a7a", fontSize: 13, margin: "0 0 14px" }}>{cancelError}</p>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => setShowCancelConfirm(true)}
                          disabled={cancelling}
                          style={{ minHeight: 48, borderRadius: 8, padding: "0 24px", border: "1px solid rgba(214,138,138,0.5)", background: "rgba(180,70,70,0.18)", color: "#e8b4b4", fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4, cursor: cancelling ? "wait" : "pointer", opacity: cancelling ? 0.6 : 1 }}
                        >
                          SUBMIT CANCELLATION REQUEST <span aria-hidden="true">&rarr;</span>
                        </button>
                      </div>
                    </>
                  )}

                  {action === "cancel" && cancelDone && (
                    <p style={{ color: "#6ec071", fontSize: 14, margin: 0, lineHeight: 1.7 }}>
                      Your cancellation has been recorded and the resort will email you to confirm. Payments already made are not refunded unless the resort approves an exception.
                    </p>
                  )}

                  {/* Reschedule / detail change — both are messages to staff. */}
                  {(action === "reschedule" || action === "details") && (
                    <>
                      <p style={{ ...eyebrow, marginBottom: 10 }}>
                        {action === "reschedule" ? "SCHEDULE CHANGE REQUEST" : "GUEST DETAIL UPDATE"}
                      </p>
                      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 14px" }}>
                        {action === "reschedule"
                          ? "Tell us the date you would prefer. Changes depend on what is still open on that day."
                          : "Tell us what needs correcting — a name, a phone number or an email address."}
                      </p>

                      {requestDone ? (
                        <p style={{ color: "#6ec071", fontSize: 14, margin: 0, lineHeight: 1.7 }}>
                          Request sent. The resort will reply to {found.email}.
                        </p>
                      ) : (
                        <>
                          <Label htmlFor="mb-request" className="sr-only">Your request</Label>
                          <Textarea
                            id="mb-request"
                            value={requestText}
                            onChange={(e) => setRequestText(e.target.value)}
                            rows={4}
                            maxLength={2000}
                            placeholder={action === "reschedule" ? "For example: I'd like to move this to 4 October, Day Tour if possible." : "For example: my contact number should be 0917 000 0000."}
                          />
                          {requestError && <p style={{ color: "#e07a7a", fontSize: 13, margin: "12px 0 0" }}>{requestError}</p>}
                          <p style={{ display: "flex", gap: 9, alignItems: "flex-start", border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: "16px 0 20px" }}>
                            <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0, marginTop: 1 }}><Icon name="shield-alert" size={14} strokeWidth={1.6} /></span>
                            Submitting a request does not change your booking. The resort will review it and contact you by email.
                          </p>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => void sendRequest()}
                              disabled={requestSending || requestText.trim().length < 10}
                              style={{ ...goldBtn, opacity: requestSending || requestText.trim().length < 10 ? 0.45 : 1, cursor: requestSending ? "wait" : requestText.trim().length < 10 ? "not-allowed" : "pointer" }}
                            >
                              {requestSending ? "SENDING…" : <>SEND REQUEST <span aria-hidden="true">&rarr;</span></>}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <p style={{ color: C.textS, fontSize: 12, textAlign: "center", margin: "22px auto 0", maxWidth: 620, lineHeight: 1.6 }}>
              Payments are non-refundable unless the resort confirms an exception. Schedule changes remain subject to availability.
            </p>
          </>
        )}
      </div>

      {/* Confirm before cancelling — the one action here that cannot be undone. */}
      <AlertDialog open={showCancelConfirm} onOpenChange={(open) => { if (!open) setShowCancelConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, fontWeight: 400 }}>
              Cancel this reservation?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>
              Booking {found?.id} for {found ? fmtDate(found.date) : ""} will be cancelled. Payments already made are
              non-refundable unless the resort confirms an exception.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ ...outBtn, color: C.goldInk, minHeight: 48 }}>KEEP MY BOOKING</AlertDialogCancel>
            <Button
              onClick={() => void confirmCancel()}
              disabled={cancelling}
              style={{ minHeight: 48, border: "1px solid rgba(214,138,138,0.5)", background: "rgba(180,70,70,0.22)", color: "#f0c9c9", fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4 }}
            >
              {cancelling ? "CANCELLING…" : "YES, CANCEL IT"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
