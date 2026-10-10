"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useApp } from "@/contexts/AppContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt, fmtDate, getBookingSlot, getBookingResource, getBookingTier, stayLabel } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { choiceOpen, fmtDeadline, holdActive, HOLD_HOURS } from "@/lib/rebooking";
import type { Booking, BookingSlot } from "@/types/booking";
import type { DateChange } from "@/types/finance";
import { Icon, type IconName } from "@/components/common/Icon";
import { ResortContact } from "@/components/common/ResortContact";
import { Badge } from "@/components/ui/badge";
import { BookingDatePicker } from "@/components/booking/BookingDatePicker";

interface ManageBookingProps {
  onGoHome?: () => void;
}

/** What a guest can do with a booking they have found.
 *
 *  Changing the date is a real request now: the guest picks a free date,
 *  it's held for them while the resort approves it. Correcting details is
 *  still a message to the resort's inbox. Cancelling has its own endpoint. */
type ActionKey = "reschedule" | "details" | "cancel";

const CANCEL_REASONS = ["Emergency", "Booked by mistake", "Change of plans", "Other"];

/** A payment as the guest's page shows it. */
interface GuestPayment {
  type: string;
  method: string;
  amount: number;
  reference: string;
  receivedAt: string;
}

/** How the guest proved the booking is theirs: the email on it, or the
 *  signed link the resort sent them. Sent again with every change. */
interface Proof { email?: string; t?: string }

const PAYMENT_LABEL: Record<string, string> = {
  Downpayment: "Down payment", Full: "Paid in full", Balance: "Balance", Penalty: "Damage penalty", Refund: "Refund to you",
};

export function ManageBooking(_props: ManageBookingProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const { bookings: availability, closedDates } = useApp();

  const {
    register: registerLookup,
    handleSubmit: submitLookup,
    setValue: setLookupValue,
    formState: { errors: lookupErrors },
  } = useForm<CancelBookingLookup>({
    resolver: zodResolver(cancelBookingLookup),
    mode: "onSubmit",
    defaultValues: { reference: "", email: "" },
  });

  const [found, setFound] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<GuestPayment[]>([]);
  const [dateChanges, setDateChanges] = useState<DateChange[]>([]);
  const [changesLeft, setChangesLeft] = useState(0);
  const [today, setToday] = useState("");
  const [proof, setProof] = useState<Proof>({});
  const [notFound, setNotFound] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelDone, setCancelDone] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [action, setAction] = useState<ActionKey | null>(null);
  const [requestText, setRequestText] = useState("");
  const [requestSending, setRequestSending] = useState(false);
  const [requestDone, setRequestDone] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Picking a date: a new date after a resort cancellation, or a date change.
  const [newDate, setNewDate] = useState("");
  const [picking, setPicking] = useState(false);
  const [dateBusy, setDateBusy] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Asking to move a date is not undoable from here — the booking is held and
     the owner is notified — so it gets a confirmation of its own. */
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

  // ── Find ─────────────────────────────────────────────────────────────
  const runLookup = useCallback(async (ref: string, p: Proof) => {
    setSearched(true);
    setErrorMsg(null);
    setLooking(true);
    try {
      const qs = new URLSearchParams();
      if (p.email) qs.set("email", p.email.trim().toLowerCase());
      if (p.t) qs.set("t", p.t);
      const res = await fetch(`/api/bookings/${encodeURIComponent(ref)}?${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.booking) {
        setFound(json.booking as Booking);
        setPayments((json.payments ?? []) as GuestPayment[]);
        setDateChanges((json.dateChanges ?? []) as DateChange[]);
        setChangesLeft(Number(json.changesLeft) || 0);
        setToday(String(json.today ?? ""));
        setProof(p);
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
  }, []);

  // Links from the resort: ?booking=SW-10105&email=… (confirmation email)
  // or ?booking=SW-10105&t=… (a text or notice; opens the booking at once).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get("booking");
    const mail = q.get("email");
    const t = q.get("t");
    if (ref) setLookupValue("reference", ref);
    if (mail) setLookupValue("email", mail);
    if (ref && t) void runLookup(ref, { t });
  }, [setLookupValue, runLookup]);

  const handleFind = submitLookup(async ({ reference: ref, email: mail }) => {
    if (looking) return;
    setCancelDone(false);
    setAction(null);
    setRequestDone(false);
    setNotice(null);
    await runLookup(ref, { email: mail });
  });

  const refresh = () => (found ? runLookup(found.id, proof) : Promise.resolve());

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/bookings/${encodeURIComponent(found!.id)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, email: proof.email, t: proof.t }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.success === false) throw new Error(json?.error ?? "Something went wrong. Please try again.");
    return json;
  };

  // ── After a resort cancellation: pick a new date, the resort confirms it.
  const confirmRebook = async () => {
    if (!found || !newDate || dateBusy) return;
    setDateBusy(true);
    setDateError(null);
    try {
      await post("rebook", { date: newDate });
      setNotice(`We've sent ${fmtDate(newDate)} to the resort. It's held for you for ${HOLD_HOURS} hours while they confirm it, and we'll email you the answer.`);
      setPicking(false);
      setNewDate("");
      await refresh();
    } catch (err) {
      setDateError(err instanceof Error ? err.message : "Could not move your booking.");
    } finally {
      setDateBusy(false);
    }
  };


  // ── Guest-requested date change ──────────────────────────────────────
  const requestDateChange = async () => {
    if (!found || !newDate || dateBusy) return;
    setDateBusy(true);
    setDateError(null);
    try {
      await post("date-change", { date: newDate });
      setNotice(`Request sent. ${fmtDate(newDate)} is held for you for ${HOLD_HOURS} hours while the resort reviews it.`);
      setAction(null);
      setNewDate("");
      await refresh();
    } catch (err) {
      setDateError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setDateBusy(false);
    }
  };

  // ── Cancel ───────────────────────────────────────────────────────────
  const confirmCancel = async () => {
    if (!found || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const json = await post("cancel", { reason: cancelReason ?? "" });
      setFound(json.booking as Booking);
      setCancelDone(true);
      setShowCancelConfirm(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not cancel the booking.");
    } finally {
      setCancelling(false);
    }
  };

  /** Detail corrections ride the customer-service inbox, with the
   *  reference in the body so staff can find the reservation. */
  const sendRequest = async () => {
    if (!found || requestSending || requestText.trim().length < 10) return;
    setRequestSending(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/customer-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: found.name,
          email: found.email,
          type: "Inquiry",
          message: `[Guest detail update request — booking ${found.id}]\n\n${requestText.trim()}`,
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
    if (s === "ResortCancelled") return "#9a7bd0";
    if (s === "Completed") return "#4a9fd4";
    return "#888";
  };
  const statusLabel = (b: Booking) =>
    b.status === "ResortCancelled" ? "CANCELLED BY THE RESORT"
      : b.status === "Pending" ? "BEING REVIEWED"
        : b.status.toUpperCase();

  const card: React.CSSProperties = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: mob ? "24px 20px" : "32px 36px",
    boxShadow: C.shadowCard,
  };

  const microLabel: React.CSSProperties = { color: C.textS, fontSize: 10.5, letterSpacing: 1.8, margin: "0 0 8px" };
  const eyebrow: React.CSSProperties = { color: C.goldInk, fontSize: 11, letterSpacing: 2.2, fontWeight: 700, margin: 0 };
  const serif = "'Satoshi',system-ui,sans-serif";

  /* The warning red. The pale pink the cancel controls use is legible on the
     dark card and washes out on the light one, so this follows the theme. */
  const dangerInk = C.dangerInk;   // the shared token, see --sw-danger-ink

  const slotHours = found?.slot ? SLOTS[found.slot as BookingSlot]?.hours : null;
  const paidNet = payments.reduce((s, p) => s + (p.type === "Refund" ? -p.amount : p.type === "Penalty" ? 0 : p.amount), 0);
  const balance = found ? Math.max(0, found.total - paidNet) : 0;
  const pendingChange = dateChanges.find((r) => r.status === "Pending" && holdActive(r));
  const lastDecided = dateChanges.find((r) => r.requestedBy === "Guest" && (r.status === "Declined" || r.status === "Expired"));
  /* After a resort cancellation the guest's pick waits for the resort too.
     `rebookPending`: their pick, held while the resort confirms it.
     `rebookTurnedDown`: their latest pick since this cancellation, if the
     resort declined it or didn't answer in time (they choose again). */
  const resortCancelled = found?.status === "ResortCancelled";
  const rebookPending = resortCancelled ? pendingChange : undefined;
  const latestRebook = resortCancelled
    ? dateChanges.find((r) => r.requestedBy === "Resort" && (!found?.cancelledAt || Date.parse(r.createdAt) >= Date.parse(found.cancelledAt)))
    : undefined;
  const rebookTurnedDown = !rebookPending && latestRebook && (latestRebook.status === "Declined" || latestRebook.status === "Expired")
    ? latestRebook : undefined;
  const lastRefund = [...payments].reverse().find((p) => p.type === "Refund");
  const choosing = !!found && choiceOpen(found);
  const canMove = !!found && found.status === "Confirmed" && !found.checkedInAt && !!today && found.date > today;
  const closed = !!found && (found.status === "Cancelled" || found.status === "Completed" || found.status === "ResortCancelled");

  const actions: { key: ActionKey; icon: IconName; title: string; sub: string; disabled?: string }[] = [
    {
      key: "reschedule", icon: "calendar", title: "Change the date", sub: "Pick another free date",
      disabled: !canMove ? "Only a confirmed booking can be moved, before the day of the visit."
        : pendingChange ? "You already have a request waiting."
          : changesLeft <= 0 ? "This booking's date has already been changed once." : undefined,
    },
    { key: "details", icon: "message", title: "Update guest details", sub: "Correct your contact information" },
    { key: "cancel", icon: "shield-alert", title: "Cancel booking", sub: "Subject to the booking policy" },
  ];

  /** The free-date calendar for this booking's own package and time slot. */
  const picker = found && (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "16px 12px" : "20px 20px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
      <BookingDatePicker
        bookings={availability}
        closedDates={closedDates}
        selectedDate={newDate}
        single
        onSelectRange={(d) => { setNewDate(d); setDateError(null); }}
        isDark={isDark}
        guests={found.guests}
        resource={getBookingResource(found)}
        tier={getBookingTier(found)}
        slot={getBookingSlot(found)}
      />
      <p style={{ color: C.textS, fontSize: 12.5, margin: "12px 0 0" }}>
        Same package and time slot ({SLOTS[getBookingSlot(found)].label}); your payment carries over.
      </p>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "40px 16px 64px" : "80px 24px 96px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: mob ? 32 : 44 }}>
          <p style={{ ...eyebrow, letterSpacing: 3.4, marginBottom: 16 }}>MANAGE BOOKING</p>
          <h1 style={{ fontFamily: serif, fontSize: mob ? 32 : 52, color: C.textH, fontWeight: 400, margin: "0 0 12px", lineHeight: 1.1 }}>
            Your stay, in one place
          </h1>
          <p style={{ color: C.textS, fontSize: mob ? 14 : 15, lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            Find your reservation to see its status and payments, change the date, or update your details.
          </p>
        </div>

        {/* ── FIND ─────────────────────────────────────────────────────── */}
        {!(found && proof.t) && (
          <form onSubmit={handleFind} style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
              <span
                aria-hidden="true"
                style={{ width: 52, height: 52, borderRadius: "50%", background: `${gold}1a`, border: `1px solid ${gold}55`, display: "flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}
              >
                <Icon name="calendar" size={22} strokeWidth={1.5} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ ...eyebrow, marginBottom: 8 }}>FIND YOUR RESERVATION</p>
                <h2 style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 21 : 26, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>
                  Enter the details from your confirmation.
                </h2>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr auto", gap: 16, alignItems: "end" }}>
              <div>
                <Label htmlFor="mb-ref" className="mb-2 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>
                  BOOKING REFERENCE
                </Label>
                <Input id="mb-ref" {...registerLookup("reference")} placeholder="Example: SW-00000" autoComplete="off" aria-invalid={!!lookupErrors.reference} />
              </div>
              <div>
                <Label htmlFor="mb-email" className="mb-2 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>
                  EMAIL ADDRESS
                </Label>
                <Input id="mb-email" type="email" {...registerLookup("email")} placeholder="Email used for booking" autoComplete="email" aria-invalid={!!lookupErrors.email} />
              </div>
              <button className="sw-btn"
                type="submit"
                disabled={looking}
                style={{ ...goldBtn, opacity: looking ? 0.5 : 1, cursor: looking ? "wait" : "pointer", whiteSpace: "nowrap" }}
              >
                {looking ? "SEARCHING…" : <>FIND BOOKING <span aria-hidden="true">&rarr;</span></>}
              </button>
            </div>

            {(lookupErrors.reference || lookupErrors.email) && (
              <p style={{ color: "#e07a7a", fontSize: 12.5, margin: "12px 0 0" }}>
                {lookupErrors.reference?.message ?? lookupErrors.email?.message}
              </p>
            )}

            <p style={{ display: "flex", alignItems: "center", gap: 8, color: C.textS, fontSize: 12, margin: "16px 0 0" }}>
              <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0 }}><Icon name="lock" size={13} strokeWidth={1.5} /></span>
              Your reservation information is encrypted and secure.
            </p>
          </form>
        )}

        {/* ── NOT FOUND ───────────────────────────────────────────────── */}
        {searched && notFound && !looking && (
          <div style={{ ...card, marginBottom: 20, borderColor: "rgba(224,122,122,0.4)" }}>
            <h3 style={{ color: "#e07a7a", fontFamily: serif, fontSize: 21, fontWeight: 400, margin: "0 0 8px" }}>
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
                <span
                  aria-hidden="true"
                  style={{ width: 84, height: 62, borderRadius: 10, background: `linear-gradient(135deg, ${gold}26, ${gold}0d)`, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}
                >
                  <Icon name="pool" size={24} strokeWidth={1.5} />
                </span>

                <div style={{ minWidth: 0 }}>
                  <p style={microLabel}>PRIVATE RESORT RESERVATION</p>
                  <h3 style={{ color: C.textH, fontFamily: serif, fontSize: 23, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>
                    {found.package || "Resort booking"}
                  </h3>
                </div>

                <div>
                  <p style={microLabel}>DATE</p>
                  <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{stayLabel(found)}</p>
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
                    style={{ background: `${statusColor(found.status)}1f`, color: statusColor(found.status), border: `1px solid ${statusColor(found.status)}59`, fontSize: 10.5, letterSpacing: 1.4, padding: "4px 12px", borderRadius: 999 }}
                  >
                    {statusLabel(found)}
                  </Badge>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20, display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 20 }}>
                {([
                  ["TOTAL AMOUNT", fmt(found.total)],
                  ["PAID SO FAR", fmt(Math.max(0, paidNet))],
                  [closed ? "BALANCE" : "BALANCE ON ARRIVAL", closed ? "—" : fmt(balance)],
                  ["BOOKED ON", found.createdAt ? new Date(found.createdAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"],
                ] as const).map(([l, v]) => (
                  <div key={l}>
                    <p style={microLabel}>{l}</p>
                    <p style={{ color: C.goldInk, fontSize: 17, fontFamily: serif, margin: 0, lineHeight: 1.3 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {notice && (
              <p role="status" style={{ ...card, padding: "16px 20px", marginBottom: 20, color: "#6ec071", fontSize: 14, lineHeight: 1.6, borderColor: "rgba(110,192,113,0.45)" }}>
                {notice}
              </p>
            )}

            {/* ── THE RESORT CANCELLED: choose a new date ──────────────────── */}
            {found.status === "ResortCancelled" && (
              <div style={{ ...card, marginBottom: 20, borderColor: "#9a7bd077" }}>
                <p style={{ ...eyebrow, color: "#b49be0", marginBottom: 12 }}>THE RESORT HAD TO CANCEL</p>
                <h3 style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 22 : 28, fontWeight: 400, margin: "0 0 12px", lineHeight: 1.2 }}>
                  We&rsquo;re sorry. Let&rsquo;s find you another date.
                </h3>
                {found.cancelReason && <p style={{ color: C.textB, fontSize: 14, lineHeight: 1.7, margin: "0 0 12px" }}>{found.cancelReason}</p>}
                {rebookPending ? (
                  /* They've picked; the resort confirms it before it's final. */
                  <div style={{ border: `1px solid ${gold}66`, background: `${gold}0f`, borderRadius: 10, padding: 16 }}>
                    <p style={{ ...eyebrow, marginBottom: 8 }}>WAITING FOR THE RESORT</p>
                    <p style={{ color: C.textB, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                      You picked <strong style={{ color: C.textH }}>{fmtDate(rebookPending.toDate)}</strong>. We&rsquo;re holding it for you
                      until {fmtDeadline(rebookPending.holdUntil!)} while the resort confirms it, and we&rsquo;ll email you the answer
                      {found.email ? <> at {found.email}</> : null}.
                      {(found.heldAmount ?? 0) > 0 && <> Your {fmt(found.heldAmount ?? 0)} stays with this booking.</>}
                    </p>
                  </div>
                ) : choosing ? (
                  <>
                    {rebookTurnedDown && (
                      <p role="status" style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px", borderLeft: "3px solid #e8a070", paddingLeft: 12 }}>
                        {rebookTurnedDown.status === "Declined"
                          ? <>The resort couldn&rsquo;t confirm {fmtDate(rebookTurnedDown.toDate)}.{rebookTurnedDown.note ? ` ${rebookTurnedDown.note}` : ""} Please pick another date.</>
                          : <>The resort wasn&rsquo;t able to confirm {fmtDate(rebookTurnedDown.toDate)} in time, so the date wasn&rsquo;t kept. Please pick again.</>}
                      </p>
                    )}
                    <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                      {(found.heldAmount ?? 0) > 0 && <>Your {fmt(found.heldAmount ?? 0)} is safe and stays with this booking. </>}
                      Move it to any free date at no extra cost; the resort confirms the date you pick. Please choose by <strong style={{ color: C.textH }}>{fmtDeadline(found.choiceDeadline!)}</strong>. If none of the open dates work for you, contact us and we&rsquo;ll sort one out together.
                    </p>
                    {!picking ? (
                      <>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <button className="sw-btn" type="button" onClick={() => { setPicking(true); setNewDate(""); setDateError(null); }} style={{ ...goldBtn }}>PICK A NEW DATE</button>
                      </div>

                      {/* The resort cancelled, so a refund IS possible here —
                          but it is arranged with the owner over a call or a
                          chat, not issued by a button or a form. */}
                      {(found.heldAmount ?? 0) > 0 && (
                        <>
                          <p style={{ display: "flex", gap: 10, alignItems: "flex-start", color: C.textS, fontSize: 13, lineHeight: 1.65, margin: "20px 0 12px" }}>
                            <Icon name="info" size={14} strokeWidth={1.5} style={{ color: C.goldInk, marginTop: 3, flexShrink: 0 }} />
                            <span>
                              Would you rather have your money back? Because we cancelled this booking, you can have
                              your {fmt(found.heldAmount ?? 0)} refunded instead. Call or message us with your
                              reference <strong style={{ color: C.textH }}>{found.id}</strong> and we&rsquo;ll arrange it with you.
                            </span>
                          </p>
                          <ResortContact mailSubject={`Refund request – ${found.id}`} />
                        </>
                      )}
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {picker}
                        {dateError && <p style={{ color: "#e07a7a", fontSize: 13, margin: 0 }}>{dateError}</p>}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button className="sw-btn-out" type="button" onClick={() => setPicking(false)} style={{ ...outBtn, color: C.goldInk, minHeight: 48 }}>BACK</button>
                          <button className="sw-btn" type="button" disabled={!newDate || dateBusy} onClick={() => void confirmRebook()}
                            style={{ ...goldBtn, opacity: !newDate || dateBusy ? 0.5 : 1, cursor: !newDate ? "not-allowed" : dateBusy ? "wait" : "pointer" }}>
                            {dateBusy ? "SENDING…" : newDate ? `REQUEST ${fmtDate(newDate).toUpperCase()}` : "CHOOSE A DATE"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Their time to pick here ran out. Nothing is lost: the
                     booking stays with the resort to sort out, by a call or
                     a chat, as a new date or (since we cancelled) a refund. */
                  <>
                    <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px" }}>
                      The time to pick a date here has passed, but nothing is lost.
                      {(found.heldAmount ?? 0) > 0 && <> Your {fmt(found.heldAmount ?? 0)} is still held for you.</>}
                      {" "}Call or message us with your reference <strong style={{ color: C.textH }}>{found.id}</strong> and we&rsquo;ll set a new date with you
                      {(found.heldAmount ?? 0) > 0 ? <>, or arrange your refund if you&rsquo;d rather have your money back</> : null}.
                    </p>
                    <ResortContact mailSubject={`New date for ${found.id}`} />
                  </>
                )}
              </div>
            )}

            {/* ── REFUND ──────────────────────────────────────────────────── */}
            {found.refundStatus && (
              <div style={{ ...card, marginBottom: 20, borderColor: found.refundStatus === "Sent" ? "rgba(110,192,113,0.45)" : "#e07a3a66" }}>
                <p style={{ ...eyebrow, color: found.refundStatus === "Sent" ? "#6ec071" : "#e8a070", marginBottom: 12 }}>
                  {found.refundStatus === "Sent" ? "REFUND SENT" : "REFUND ON ITS WAY"}
                </p>
                {found.refundStatus === "Sent" ? (
                  <>
                    <p style={{ color: C.textB, fontSize: 14.5, lineHeight: 1.7, margin: "0 0 8px" }}>
                      We sent your refund of <strong style={{ color: C.textH }}>{fmt(found.refundAmount ?? 0)}</strong>
                      {found.refundSentAt ? <> on {new Date(found.refundSentAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</> : null}
                      {lastRefund ? <> by {lastRefund.method}{lastRefund.reference ? <>, reference <span style={{ fontFamily: "monospace" }}>{lastRefund.reference}</span></> : null}</> : null}.
                    </p>
                    {found.refundReceipt && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={found.refundReceipt} alt="Refund transfer receipt" style={{ display: "block", marginTop: 12, maxWidth: "100%", maxHeight: 360, borderRadius: 10, border: `1px solid ${C.border}` }} />
                    )}
                  </>
                ) : (
                  <p style={{ color: C.textB, fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
                    The resort owes you <strong style={{ color: C.textH }}>{fmt(found.refundAmount ?? 0)}</strong>. They will send it to you and the reference number will appear here, and you&rsquo;ll get a text when it&rsquo;s sent.
                  </p>
                )}
              </div>
            )}

            {/* ── A DATE CHANGE IN PROGRESS, OR JUST ANSWERED ─────────────── */}
            {/* A resort-cancelled guest's pick is shown in the block above. */}
            {pendingChange && !resortCancelled && (
              <div style={{ ...card, marginBottom: 20, borderColor: `${gold}66` }}>
                <p style={{ ...eyebrow, marginBottom: 12 }}>DATE CHANGE REQUESTED</p>
                <p style={{ color: C.textB, fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
                  You asked to move to <strong style={{ color: C.textH }}>{fmtDate(pendingChange.toDate)}</strong>. It&rsquo;s held for you until {fmtDeadline(pendingChange.holdUntil!)} while the resort reviews it. Your booking stays on {fmtDate(found.date)} until then.
                </p>
              </div>
            )}
            {!pendingChange && lastDecided && found.status === "Confirmed" && (
              <p style={{ ...card, padding: "16px 20px", marginBottom: 20, color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                {lastDecided.status === "Declined"
                  ? <>The resort couldn&rsquo;t move your booking to {fmtDate(lastDecided.toDate)}.{lastDecided.note ? ` ${lastDecided.note}` : ""}</>
                  : <>Your request to move to {fmtDate(lastDecided.toDate)} wasn&rsquo;t answered in time, so the date wasn&rsquo;t kept. You can ask again.</>}
              </p>
            )}

            {/* ── PAYMENTS ────────────────────────────────────────────────── */}
            {payments.length > 0 && (
              <div style={{ ...card, marginBottom: 20 }}>
                <p style={{ ...eyebrow, marginBottom: 12 }}>PAYMENTS ON THIS BOOKING</p>
                {payments.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <div style={{ color: C.textH, fontSize: 14 }}>{PAYMENT_LABEL[p.type] ?? p.type} · {p.method === "PayMongo" ? "Online (GCash QR)" : p.method}</div>
                      <div style={{ color: C.textS, fontSize: 12 }}>
                        {new Date(p.receivedAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
                        {p.reference && p.method !== "PayMongo" ? <> · ref <span style={{ fontFamily: "monospace" }}>{p.reference}</span></> : null}
                      </div>
                    </div>
                    <div style={{ color: p.type === "Refund" ? "#6ec071" : C.textB, fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap" }}>
                      {p.type === "Refund" ? "+" : ""}{fmt(p.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── ACTIONS ───────────────────────────────────────────── */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                <div>
                  <p style={{ ...eyebrow, marginBottom: 8 }}>MANAGE YOUR RESERVATION</p>
                  <h3 style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 22 : 28, fontWeight: 400, margin: 0, lineHeight: 1.15 }}>
                    What would you like to do?
                  </h3>
                </div>
                <a href="/customer" style={{ color: C.textS, fontSize: 12.5, textDecoration: "underline", paddingTop: mob ? 0 : 20 }}>
                  Contact support
                </a>
              </div>

              {closed || found.checkedInAt ? (
                <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
                  {found.status === "ResortCancelled"
                    ? choosing ? "Use the choice above to pick a new date." : "See the note above about your new date."
                    : `This reservation is ${found.checkedInAt && !closed ? "under way" : found.status.toLowerCase()}, so there is nothing left to change here. Contact support if you think that is wrong.`}
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 16 }}>
                    {actions.map((a) => {
                      const on = action === a.key;
                      return (
                        <button
                          key={a.key}
                          type="button"
                          aria-pressed={on}
                          disabled={!!a.disabled}
                          title={a.disabled}
                          onClick={() => { setAction(on ? null : a.key); setRequestDone(false); setRequestError(null); setNewDate(""); setDateError(null); }}
                          style={{
                            background: on ? `${gold}12` : C.bgCard2,
                            border: `1px solid ${on ? gold : C.border}`,
                            borderRadius: 12,
                            padding: "20px 20px",
                            cursor: a.disabled ? "not-allowed" : "pointer",
                            opacity: a.disabled ? 0.5 : 1,
                            textAlign: "left",
                            transition: "border-color .18s, background .18s",
                          }}
                        >
                          <span style={{ display: "block", marginBottom: 12, color: a.key === "cancel" ? "#d68a8a" : C.goldInk, lineHeight: 0 }}>
                            <Icon name={a.icon} size={20} strokeWidth={1.5} />
                          </span>
                          <span style={{ display: "block", color: C.textH, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{a.title}</span>
                          <span style={{ display: "block", color: C.textS, fontSize: 12, lineHeight: 1.5 }}>{a.disabled ?? a.sub}</span>
                        </button>
                      );
                    })}
                  </div>

                  {action && <div style={{ borderTop: `1px solid ${C.border}`, margin: "28px 0 24px" }} />}

                  {/* Change the date: pick a free one; the resort approves. */}
                  {action === "reschedule" && (
                    <>
                      <p style={{ ...eyebrow, marginBottom: 12 }}>CHANGE THE DATE</p>
                      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
                        Pick a free date. We hold it for you for {HOLD_HOURS} hours while the resort approves the change, and your booking stays on {fmtDate(found.date)} until then. You can change the date once.
                      </p>

                      {/* The policy, stated before the choice rather than after
                          it. Only the dates in green can be picked, and the
                          calendar already hides anything taken or held. */}
                      <div style={{ border: `1px solid ${gold}55`, background: `${gold}0f`, borderRadius: 10, padding: 16, margin: "0 0 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0, marginTop: 4 }}><Icon name="info" size={15} strokeWidth={1.5} /></span>
                        <div style={{ color: C.textB, fontSize: 13, lineHeight: 1.65 }}>
                          <strong style={{ display: "block", color: C.textH, marginBottom: 4 }}>Before you choose a new date</strong>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            <li>Moving your date is <strong>free</strong> — there is no rescheduling fee, and everything you have paid carries over.</li>
                            <li>This is a change of date only. <strong>It is not a refund</strong>, and what you have paid cannot be returned.</li>
                            <li>The resort checks the date you pick is still open and then approves or declines it, so <strong>please watch your email</strong> — we send the answer to {found.email || "the address on your booking"}.</li>
                            <li>You can move a booking <strong>once</strong>.</li>
                          </ul>
                        </div>
                      </div>

                      {picker}

                      {/* What is actually changing, and what it costs. */}
                      {newDate && (
                        <div style={{ marginTop: 20, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.bgCard2 }}>
                          <p style={{ ...eyebrow, margin: "0 0 12px" }}>YOUR REQUEST</p>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                            <div>
                              <div style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 1 }}>CURRENT DATE</div>
                              <div style={{ color: C.textS, fontSize: 15, textDecoration: "line-through" }}>{fmtDate(found.date)}</div>
                            </div>
                            <Icon name="arrow-right" size={16} style={{ color: C.goldInk }} />
                            <div>
                              <div style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 1 }}>NEW DATE</div>
                              <div style={{ color: C.textH, fontSize: 15, fontWeight: 600 }}>{fmtDate(newDate)}</div>
                            </div>
                          </div>
                          <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, display: "grid", gap: 6 }}>
                            {([
                              ["Rescheduling fee", "Free", false],
                              ["Already paid", fmt(paidNet), false],
                              [closed ? "Balance" : "Balance on arrival", closed ? "—" : fmt(balance), true],
                            ] as [string, string, boolean][]).map(([k, v, strong]) => (
                              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                                <span style={{ color: C.textS }}>{k}</span>
                                <span style={{ color: strong ? C.textH : C.textB, fontWeight: strong ? 600 : 400 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {dateError && <p style={{ color: "#e07a7a", fontSize: 13, margin: "12px 0 0" }}>{dateError}</p>}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                        <button className="sw-btn" type="button" disabled={!newDate || dateBusy} onClick={() => setShowMoveConfirm(true)}
                          style={{ ...goldBtn, opacity: !newDate || dateBusy ? 0.45 : 1, cursor: !newDate ? "not-allowed" : dateBusy ? "wait" : "pointer" }}>
                          {dateBusy ? "SENDING…" : newDate ? <>REQUEST {fmtDate(newDate).toUpperCase()} <span aria-hidden="true">&rarr;</span></> : "CHOOSE A DATE"}
                        </button>
                      </div>
                    </>
                  )}

                  {/* Cancellation */}
                  {action === "cancel" && !cancelDone && (
                    <>
                      <p style={{ ...eyebrow, color: C.goldInk, marginBottom: 12 }}>CANCELLATION</p>
                      {canMove && changesLeft > 0 && !pendingChange && (
                        <p style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${gold}66`, borderRadius: 10, padding: "16px 16px", color: C.textB, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
                          <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0, marginTop: 4 }}><Icon name="calendar" size={15} strokeWidth={1.5} /></span>
                          <span>
                            Can&rsquo;t make it on {fmtDate(found.date)}? You can <button type="button" onClick={() => setAction("reschedule")} style={{ background: "none", border: "none", padding: 0, color: C.goldInk, textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>move it to another date</button> instead, once, and keep what you paid.
                          </span>
                        </p>
                      )}
                      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 16px" }}>
                        Help us understand why your plans changed. This step is optional.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
                        {CANCEL_REASONS.map((r) => {
                          const on = cancelReason === r;
                          return (
                            <button key={r} type="button" aria-pressed={on} onClick={() => setCancelReason(on ? null : r)}
                              style={{ minHeight: 48, borderRadius: 10, border: `1px solid ${on ? gold : C.border}`, background: on ? `${gold}12` : C.bgCard2, color: on ? C.goldInk : C.textB, fontSize: 13, cursor: "pointer", padding: "0 12px" }}>
                              {r}
                            </button>
                          );
                        })}
                      </div>

                      <div role="note" style={{ display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid rgba(214,138,138,0.45)", background: "rgba(180,70,70,0.10)", borderRadius: 10, padding: "16px 16px", margin: "0 0 20px" }}>
                        <span aria-hidden="true" style={{ color: dangerInk, lineHeight: 0, flexShrink: 0, marginTop: 4 }}><Icon name="shield-alert" size={15} strokeWidth={1.75} /></span>
                        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                          <strong style={{ display: "block", color: dangerInk, fontSize: 13, letterSpacing: 0.3, marginBottom: 4 }}>No refunds when you cancel</strong>
                          <span style={{ color: C.textS }}>
                            {paidNet > 0 ? <>The {fmt(paidNet)} already paid on this booking is not returned if you cancel.</> : <>Anything paid on this booking is not returned if you cancel.</>}
                            {" "}If the resort ever has to cancel, we move you to another date of your choosing.
                          </span>
                        </span>
                      </div>

                      {cancelError && <p style={{ color: "#e07a7a", fontSize: 13, margin: "0 0 16px" }}>{cancelError}</p>}

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => setShowCancelConfirm(true)} disabled={cancelling}
                          style={{ minHeight: 48, borderRadius: 8, padding: "0 24px", border: "1px solid rgba(214,138,138,0.5)", background: "rgba(180,70,70,0.18)", color: "#e8b4b4", fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4, cursor: cancelling ? "wait" : "pointer", opacity: cancelling ? 0.6 : 1 }}>
                          CANCEL MY BOOKING <span aria-hidden="true">&rarr;</span>
                        </button>
                      </div>
                    </>
                  )}

                  {action === "cancel" && cancelDone && (
                    <p style={{ color: "#6ec071", fontSize: 14, margin: 0, lineHeight: 1.7 }}>
                      Your booking has been cancelled. Payments already made are not refunded.
                    </p>
                  )}

                  {/* Detail change: a message to the resort. */}
                  {action === "details" && (
                    <>
                      <p style={{ ...eyebrow, marginBottom: 12 }}>GUEST DETAIL UPDATE</p>
                      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 16px" }}>
                        Tell us what needs correcting: a name, a phone number or an email address.
                      </p>

                      {requestDone ? (
                        <p style={{ color: "#6ec071", fontSize: 14, margin: 0, lineHeight: 1.7 }}>
                          Request sent. The resort will get back to you.
                        </p>
                      ) : (
                        <>
                          <Label htmlFor="mb-request" className="sr-only">Your request</Label>
                          <Textarea id="mb-request" value={requestText} onChange={(e) => setRequestText(e.target.value)} rows={4} maxLength={2000}
                            placeholder="For example: my contact number should be 0917 000 0000." />
                          {requestError && <p style={{ color: "#e07a7a", fontSize: 13, margin: "12px 0 0" }}>{requestError}</p>}
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                            <button className="sw-btn" type="button" onClick={() => void sendRequest()} disabled={requestSending || requestText.trim().length < 10}
                              style={{ ...goldBtn, opacity: requestSending || requestText.trim().length < 10 ? 0.45 : 1, cursor: requestSending ? "wait" : requestText.trim().length < 10 ? "not-allowed" : "pointer" }}>
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

            <p style={{ color: C.textS, fontSize: 12, textAlign: "center", margin: "24px auto 0", maxWidth: 620, lineHeight: 1.6 }}>
              If the resort has to cancel, you choose a free new date or a full refund. If you cancel, payments aren&rsquo;t refunded &mdash; but you can move your booking to another date once.
            </p>
          </>
        )}
      </div>

      {/* Confirm before cancelling — the one action here that cannot be undone. */}
      <AlertDialog open={showCancelConfirm} onOpenChange={(open) => { if (!open) setShowCancelConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 24, fontWeight: 400 }}>
              Cancel this reservation?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>
              Booking {found?.id} for {found ? fmtDate(found.date) : ""} will be cancelled. Payments already made are not refunded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ ...outBtn, color: C.goldInk, minHeight: 48 }}>KEEP MY BOOKING</AlertDialogCancel>
            <Button onClick={() => void confirmCancel()} disabled={cancelling}
              style={{ minHeight: 48, border: "1px solid rgba(214,138,138,0.5)", background: "rgba(180,70,70,0.22)", color: "#f0c9c9", fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4 }}>
              {cancelling ? "CANCELLING…" : "YES, CANCEL IT"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund instead of a new date, after a resort cancellation. */}
      {/* Confirming the date change. The request notifies the owner and
          holds the date, so it asks once before sending. */}
      <AlertDialog open={showMoveConfirm} onOpenChange={(open) => { if (!open) setShowMoveConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 24, fontWeight: 400 }}>
              Ask to move to {newDate ? fmtDate(newDate) : "this date"}?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>
              {found ? <>Your booking {found.id} stays on {fmtDate(found.date)} until the resort approves this. </> : null}
              We hold {newDate ? fmtDate(newDate) : "the date"} for you for {HOLD_HOURS} hours while they check it.
              There is no fee, and nothing you have paid is refunded &mdash; the date moves instead.
              We will email you the answer{found?.email ? <> at {found.email}</> : null}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ ...outBtn, color: C.goldInk, minHeight: 48 }}>GO BACK</AlertDialogCancel>
            <Button className="sw-btn" onClick={() => { setShowMoveConfirm(false); void requestDateChange(); }} disabled={dateBusy} style={{ ...goldBtn, minHeight: 48 }}>
              {dateBusy ? "SENDING…" : "YES, SEND REQUEST"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
