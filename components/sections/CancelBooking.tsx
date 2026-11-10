"use client";

import { reschedulePolicy, emergencyPolicy } from "@/lib/policies";
import { rescheduleProblem, RESCHEDULE_NOTICE_DAYS, isValidEmail, isValidName, isValidPHNumber, sanitizeContact } from "@/lib/validators";
import { DETAILS_COOLDOWN_HOURS, detailsCooldownUntil, cooldownLabel } from "@/lib/guestDetails";
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
import { T, THEME_COLORS } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt, fmtDate, getBookingSlot, getBookingResource, getBookingTier, stayLabel } from "@/lib/utils";
import { packageAvailed } from "@/lib/pricing";
import { SLOTS, slotFor } from "@/lib/resort";
import { choiceOpen, noShowChoiceOpen, fmtDeadline, holdActive, HOLD_HOURS, NO_SHOW_CHOICE_DAYS } from "@/lib/rebooking";
import type { Booking, BookingSlot } from "@/types/booking";
import type { DateChange } from "@/types/finance";
import { Icon, type IconName } from "@/components/common/Icon";
import { ResortContact } from "@/components/common/ResortContact";
import { compressImage } from "@/lib/image";
import { PROOF_MAX_FILES, PROOF_PDF_MAX_BYTES, EMERGENCY_MESSAGE_MIN, EMERGENCY_MESSAGE_MAX, proofProblem, type ProofFile } from "@/lib/emergency";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDatePicker } from "@/components/booking/BookingDatePicker";
import { Reveal } from "@/components/common/Reveal";

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
/** How the guest proves the booking is theirs: the signed link from an
 *  email (`t`), or the email plus a code sent to it (`ep`). */
/** The time, for event handlers (kept out of render). */
const nowMs = () => Date.now();

interface Proof { email?: string; t?: string; ep?: string }

const PAYMENT_LABEL: Record<string, string> = {
  Downpayment: "Down payment", Full: "Paid in full", Balance: "Balance", Penalty: "Damage penalty", Refund: "Refund to you",
};

export function ManageBooking(_props: ManageBookingProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const { bookings: availability, closedDates, rooms } = useApp();

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
  /** Damage found at the check-out inspection, charged on this booking. */
  const [damages, setDamages] = useState<{ item: string; quantity: number; amount: number; facility: string }[]>([]);
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
  // An emergency request, inside the notice window (lib/emergency.ts).
  const [emText, setEmText] = useState("");
  const [emFiles, setEmFiles] = useState<ProofFile[]>([]);
  const [emBusy, setEmBusy] = useState(false);
  const [emError, setEmError] = useState<string | null>(null);
  const [emDone, setEmDone] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [action, setAction] = useState<ActionKey | null>(null);
  // Updating the guest's own details (lib/guestDetails.ts).
  const [det, setDet] = useState({ name: "", email: "", contact: "" });
  const [detAsk, setDetAsk] = useState(false);
  const [detBusy, setDetBusy] = useState(false);
  const [detError, setDetError] = useState<string | null>(null);
  const [detDone, setDetDone] = useState(false);

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
      if (p.ep) qs.set("ep", p.ep);
      const res = await fetch(`/api/bookings/${encodeURIComponent(ref)}?${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.booking) {
        setFound(json.booking as Booking);
        setPayments((json.payments ?? []) as GuestPayment[]);
        setDamages(Array.isArray(json.damages) ? json.damages : []);
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

  /* Find booking first confirms the email: a 6-digit code goes to it and
     the guest types it in a pop-up (the same codes as Book Now,
     /api/email-code). Only then is the booking looked up, so knowing a
     reference and someone's email isn't enough to open their booking. A
     confirmed email stays confirmed for a few hours on this page. */
  const [otp, setOtp] = useState<{ ref: string; email: string; challenge: string } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState<"send" | "verify" | null>(null);
  const [otpMsg, setOtpMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [otpResendAt, setOtpResendAt] = useState(0);
  const [otpClock, setOtpClock] = useState(() => nowMs());
  const [verified, setVerified] = useState<{ email: string; ep: string; until: number } | null>(null);
  const otpResendIn = Math.max(0, Math.ceil((otpResendAt - otpClock) / 1000));
  useEffect(() => {
    if (otpResendAt <= nowMs()) return;
    const t = setInterval(() => { setOtpClock(nowMs()); if (nowMs() >= otpResendAt) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  }, [otpResendAt]);

  const sendOtp = async (ref: string, email: string) => {
    setOtpBusy("send");
    setOtpMsg(null);
    try {
      const res = await fetch("/api/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, purpose: "manage" }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (typeof json?.retryAfter === "number") { setOtpResendAt(nowMs() + json.retryAfter * 1000); setOtpClock(nowMs()); }
        setOtp((o) => o ?? { ref, email, challenge: "" });
        setOtpMsg({ text: json?.error ?? "We couldn't send the code. Please try again.", bad: true });
        return;
      }
      const again = !!otp && otp.email === email && !!otp.challenge;
      setOtp({ ref, email, challenge: json.challenge });
      setOtpCode("");
      setOtpResendAt(nowMs() + (Number(json.resendIn) || 60) * 1000);
      setOtpClock(nowMs());
      setOtpMsg({ text: again ? "We sent a new code. Only the newest one works." : "It works for 10 minutes. Not in your inbox? Check Spam or Promotions." });
    } catch {
      setOtp((o) => o ?? { ref, email, challenge: "" });
      setOtpMsg({ text: "We couldn't reach the server. Check your connection and try again.", bad: true });
    } finally {
      setOtpBusy(null);
    }
  };

  const verifyOtp = async (code: string) => {
    if (!otp?.challenge || otpBusy) return;
    setOtpBusy("verify");
    try {
      const res = await fetch("/api/email-code/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otp.email, challenge: otp.challenge, code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setOtpMsg({ text: json?.error ?? "That code didn't work. Please try again.", bad: true });
        return;
      }
      const ep = String(json.proof);
      setVerified({ email: otp.email, ep, until: Number(json.expiresAt) || nowMs() + 60 * 60 * 1000 });
      const { ref, email } = otp;
      setOtp(null);
      setOtpCode("");
      setOtpMsg(null);
      await runLookup(ref, { email, ep });
    } catch {
      setOtpMsg({ text: "We couldn't reach the server. Check your connection and try again.", bad: true });
    } finally {
      setOtpBusy(null);
    }
  };

  const handleFind = submitLookup(async ({ reference: ref, email: mail }) => {
    if (looking) return;
    setCancelDone(false);
    setAction(null);
    setDetDone(false);
    setNotice(null);
    const email = mail.trim().toLowerCase();
    // Already confirmed on this page: straight to the booking.
    if (verified && verified.email === email && verified.until > nowMs() + 60_000) {
      await runLookup(ref, { email, ep: verified.ep });
      return;
    }
    setOtp({ ref, email, challenge: "" });
    await sendOtp(ref, email);
  });

  const refresh = () => (found ? runLookup(found.id, proof) : Promise.resolve());

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/bookings/${encodeURIComponent(found!.id)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, email: proof.email, t: proof.t, ep: proof.ep }),
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

  /** Proof for an emergency request: photos are shrunk like gallery
   *  uploads; a PDF is sent as it is, if it's small enough. */
  const addProof = async (list: FileList | null) => {
    setEmError(null);
    const picked = Array.from(list ?? []);
    const room = PROOF_MAX_FILES - emFiles.length;
    if (picked.length > room) setEmError(`You can attach up to ${PROOF_MAX_FILES} files.`);
    for (const f of picked.slice(0, Math.max(0, room))) {
      try {
        if (f.type === "application/pdf") {
          if (f.size > PROOF_PDF_MAX_BYTES) { setEmError(`${f.name} is too large. A PDF can be up to 1.5 MB; a photo of it works too.`); continue; }
          const data = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.onerror = () => rej(new Error("read")); rd.readAsDataURL(f); });
          setEmFiles((xs) => [...xs, { name: f.name, type: "application/pdf", data }]);
        } else if (f.type.startsWith("image/")) {
          const data = await compressImage(f, 1600);
          const type = data.slice(5, data.indexOf(";"));
          setEmFiles((xs) => [...xs, { name: f.name, type, data }]);
        } else {
          setEmError("Attach a photo (JPG, PNG or WebP) or a PDF.");
        }
      } catch {
        setEmError(`${f.name} couldn't be read. Try another file.`);
      }
    }
  };

  const sendEmergency = async () => {
    if (!found || emBusy) return;
    const problem = emText.trim().length < EMERGENCY_MESSAGE_MIN
      ? `Tell the resort what happened (at least ${EMERGENCY_MESSAGE_MIN} characters).`
      : proofProblem(emFiles);
    if (problem) { setEmError(problem); return; }
    setEmBusy(true);
    setEmError(null);
    try {
      await post("emergency", { message: emText.trim(), files: emFiles });
      setEmDone(true);
      setEmText("");
      setEmFiles([]);
    } catch (err) {
      setEmError(err instanceof Error ? err.message : "Your request couldn't be sent.");
    } finally {
      setEmBusy(false);
    }
  };

  /** Change the name, email and number on the booking (POST .../details).
   *  A new email becomes how the guest finds the booking from now on. */
  const openDetails = () => {
    if (found) setDet({ name: found.name, email: found.email, contact: found.contact });
    setDetError(null);
    setDetDone(false);
  };
  const applyDetails = async () => {
    if (!found || detBusy) return;
    setDetBusy(true);
    setDetError(null);
    try {
      const json = await post("details", { name: det.name.trim(), newEmail: det.email.trim().toLowerCase(), contact: sanitizeContact(det.contact) });
      const b = json.booking as Booking;
      setFound(b);
      // The email the guest confirmed may have changed: carry on with the
      // booking's signed link for the new address.
      setProof({ email: b.email, t: typeof json.t === "string" ? json.t : undefined });
      setDetDone(true);
      setDetAsk(false);
    } catch (err) {
      setDetError(err instanceof Error ? err.message : "Your details couldn't be saved.");
      setDetAsk(false);
    } finally {
      setDetBusy(false);
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
    b.status === "Cancelled" && b.noShow ? "NO-SHOW"
    : b.status === "ResortCancelled" ? "CANCELLED BY THE RESORT"
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

  // A venue-only booking ends when the venue closes (lib/resort.ts slotFor).
  const slotHours = found?.slot && SLOTS[found.slot as BookingSlot] ? slotFor(found.slot as BookingSlot, getBookingResource(found)).hours : null;
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
  /* After a no-show the guest can still pick a new date: from the day after
     (when they are emailed) for NO_SHOW_CHOICE_DAYS. Their pick waits for
     the resort, like a resort-cancelled guest's. */
  const noShow = found?.status === "Cancelled" && found.noShow === true;
  const noShowPending = noShow ? pendingChange : undefined;
  const noShowChoosing = !!found && noShowChoiceOpen(found);
  const noShowTurnedDown = noShow && !noShowPending && found?.noShowNotifiedAt
    ? dateChanges.find((r) => r.requestedBy === "Resort" && Date.parse(r.createdAt) >= Date.parse(found.noShowNotifiedAt!) && (r.status === "Declined" || r.status === "Expired"))
    : undefined;
  const choosing = !!found && choiceOpen(found);
  // The notice rule (Rates & Settings): date changes close a few days
  // before the visit, so the resort can still offer the date to someone.
  const noticeProblem = found && today ? rescheduleProblem(found.date) : null;
  const canMove = !!found && found.status === "Confirmed" && !found.checkedInAt && !!today && !noticeProblem;
  const moveInstead = canMove && changesLeft > 0 && !pendingChange;
  const noticeDays = RESCHEDULE_NOTICE_DAYS;
  /** Inside the notice window the guest can't cancel online either: an
   *  emergency is emailed to the resort with proof (the cancel API refuses
   *  it too). */
  const cancelClosed = !!found && !!today && !!noticeProblem && !found.checkedInAt
    && found.status !== "Cancelled" && found.status !== "Completed" && found.status !== "ResortCancelled";
  const closed = !!found && (found.status === "Cancelled" || found.status === "Completed" || found.status === "ResortCancelled");
  const detLockedUntil = found ? detailsCooldownUntil(found.detailsUpdatedAt) : null;

  const actions: { key: ActionKey; icon: IconName; title: string; sub: string; disabled?: string }[] = [
    {
      key: "reschedule", icon: "calendar", title: "Change the date", sub: "Pick another free date",
      disabled: !canMove ? (found?.status === "Confirmed" && !found.checkedInAt && noticeProblem ? noticeProblem : "Only a confirmed booking can be moved, before its reserved date.")
        : pendingChange ? "You already have a request waiting."
          : changesLeft <= 0 ? "This booking's date has already been changed once." : undefined,
    },
    {
      key: "details", icon: "user", title: "Update guest details",
      sub: detLockedUntil ? `You can change them again after ${cooldownLabel(detLockedUntil)}` : "Your name, email and mobile number",
      disabled: closed ? "This booking is closed." : undefined,
    },
    { key: "cancel", icon: "shield-alert", title: "Cancel booking", sub: cancelClosed ? "Closed online — contact the resort" : "Subject to the booking policy" },
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
        Same package and time ({SLOTS[getBookingSlot(found)].label}); your payment carries over.
      </p>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "40px 16px 64px" : "80px 24px 96px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>

        {/* Header */}
        <Reveal>
        <div style={{ textAlign: "center", marginBottom: mob ? 32 : 44 }}>
          <p style={{ ...eyebrow, letterSpacing: 3.4, marginBottom: 16 }}>MANAGE BOOKING</p>
          <h1 style={{ fontFamily: serif, fontSize: mob ? 32 : 52, color: C.textH, fontWeight: 400, margin: "0 0 12px", lineHeight: 1.1 }}>
            Your stay, in one place
          </h1>
          <p style={{ color: C.textS, fontSize: mob ? 14 : 15, lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            Find your reservation to see its status and payments, change the date, or update your details.
          </p>
        </div>
        </Reveal>

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

            <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 16, alignItems: "end" }}>
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

              <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "auto minmax(0, 1.4fr) repeat(3, minmax(0,1fr)) auto", gap: mob ? 16 : 20, alignItems: "center" }}>
                <span
                  aria-hidden="true"
                  style={{ width: 84, height: 62, borderRadius: 10, background: `linear-gradient(135deg, ${gold}26, ${gold}0d)`, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.goldInk, flexShrink: 0 }}
                >
                  <Icon name="pool" size={24} strokeWidth={1.5} />
                </span>

                <div style={{ minWidth: 0 }}>
                  <p style={microLabel}>YOUR RESERVATION</p>
                  <h3 style={{ color: C.textH, fontFamily: serif, fontSize: 23, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>
                    {packageAvailed(found) || "Resort booking"}
                  </h3>
                </div>

                <div>
                  <p style={microLabel}>DATE</p>
                  <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{stayLabel(found)}</p>
                </div>
                <div>
                  <p style={microLabel}>TIME</p>
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

              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20, display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0,1fr))", gap: 20 }}>
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
                    {/* The two facts that matter, large: what's kept for them and the deadline. */}
                    <FactTiles tiles={[
                      ...((found.heldAmount ?? 0) > 0 ? [{ label: "Your payment, kept safe", value: fmt(found.heldAmount ?? 0) }] : []),
                      { label: "Pick a new date by", value: fmtDeadline(found.choiceDeadline!), urgent: true },
                    ]} />
                    <p style={{ color: C.textB, fontSize: 14.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                      Move your booking to <strong style={{ color: C.textH }}>any free date at no extra cost</strong>. The resort confirms the date you pick. If none of the open dates work for you, contact us and we&rsquo;ll sort one out together.
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
                          <div style={{ marginTop: 24, border: `2px solid ${gold}`, background: `${gold}14`, borderRadius: 12, padding: mob ? 16 : 20 }}>
                            <p style={{ color: C.textH, fontSize: mob ? 18 : 20, fontWeight: 700, margin: "0 0 12px", fontFamily: serif }}>Prefer a refund instead?</p>
                            <FactTiles tiles={[
                              { label: "You can get back", value: fmt(found.heldAmount ?? 0) },
                              { label: "Your booking reference", value: found.id, mono: true },
                            ]} />
                            <p style={{ color: C.textB, fontSize: 14, lineHeight: 1.7, margin: "0 0 12px" }}>
                              Because we cancelled this booking, you can have your money back instead of a new date. Call or message us, give your booking reference, and we&rsquo;ll arrange it with you.
                            </p>
                            <ResortContact mailSubject={`Refund request – ${found.id}`} />
                          </div>
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

            {/* ── NO-SHOW: pick a new date ──────────────────────────────────── */}
            {noShow && (
              <div style={{ ...card, marginBottom: 20, borderColor: `${gold}66` }}>
                <p style={{ ...eyebrow, marginBottom: 12 }}>WE MISSED YOU</p>
                <h3 style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 22 : 28, fontWeight: 400, margin: "0 0 12px", lineHeight: 1.2 }}>
                  Your group didn&rsquo;t arrive on {fmtDate(found.date)}.
                </h3>
                {noShowPending ? (
                  <div style={{ border: `1px solid ${gold}66`, background: `${gold}0f`, borderRadius: 10, padding: 16 }}>
                    <p style={{ ...eyebrow, marginBottom: 8 }}>WAITING FOR THE RESORT</p>
                    <p style={{ color: C.textB, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                      You picked <strong style={{ color: C.textH }}>{fmtDate(noShowPending.toDate)}</strong>. We&rsquo;re holding it for you
                      until {fmtDeadline(noShowPending.holdUntil!)} while the resort confirms it, and we&rsquo;ll email you the answer
                      {found.email ? <> at {found.email}</> : null}.{paidNet > 0 && <> Your {fmt(paidNet)} carries over.</>}
                    </p>
                  </div>
                ) : noShowChoosing ? (
                  <>
                    {noShowTurnedDown && (
                      <p role="status" style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px", borderLeft: "3px solid #e8a070", paddingLeft: 12 }}>
                        {noShowTurnedDown.status === "Declined"
                          ? <>The resort couldn&rsquo;t confirm {fmtDate(noShowTurnedDown.toDate)}.{noShowTurnedDown.note ? ` ${noShowTurnedDown.note}` : ""} Please pick another date.</>
                          : <>The resort wasn&rsquo;t able to confirm {fmtDate(noShowTurnedDown.toDate)} in time, so the date wasn&rsquo;t kept. Please pick again.</>}
                      </p>
                    )}
                    <FactTiles tiles={[
                      ...(paidNet > 0 ? [{ label: "What you paid carries over", value: fmt(paidNet) }] : []),
                      { label: "Pick a new date by", value: fmtDeadline(found.choiceDeadline!), urgent: true },
                    ]} />
                    <p style={{ color: C.textB, fontSize: 14.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                      You can still move this booking to another free date.
                      {paidNet > 0 && found.total - paidNet > 0 ? <> The remaining {fmt(found.total - paidNet)} is paid when you arrive.</> : null}
                      {" "}The resort confirms the date you pick.
                    </p>
                    {!picking ? (
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <button className="sw-btn" type="button" onClick={() => { setPicking(true); setNewDate(""); setDateError(null); }} style={{ ...goldBtn }}>PICK A NEW DATE</button>
                      </div>
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
                ) : !found.noShowNotifiedAt ? (
                  <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
                    From tomorrow you can pick a new date here, for {NO_SHOW_CHOICE_DAYS} days{found.email ? <>, and we&rsquo;ll email you a link</> : null}.
                    {paidNet > 0 && <> The {fmt(paidNet)} you paid carries over to it.</>}
                  </p>
                ) : (
                  <>
                    <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px" }}>
                      The time to pick a new date has passed, so this booking is closed. Under our no-refund policy, what was paid
                      isn&rsquo;t returned. If you think that&rsquo;s wrong, call or message us with your reference <strong style={{ color: C.textH }}>{found.id}</strong>.
                    </p>
                    <ResortContact mailSubject={`No-show ${found.id}`} />
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
                      We returned your refund of <strong style={{ color: C.textH }}>{fmt(found.refundAmount ?? 0)}</strong>
                      {found.refundSentAt ? <> on {new Date(found.refundSentAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</> : null}
                      , as we agreed with you.
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

            {/* ── DAMAGE CHARGES ─────────────────────────────────────────────
                From the check-out inspection. Shown here so the guest sees
                exactly what was charged and why, not just a bigger total. */}
            {damages.length > 0 && (() => {
              const total = damages.reduce((s, d) => s + d.amount, 0);
              const paidPenalties = payments.filter((p) => p.type === "Penalty").reduce((s, p) => s + p.amount, 0);
              const left = Math.max(0, total - paidPenalties);
              return (
                <div style={{ ...card, marginBottom: 20 }}>
                  <p style={{ ...eyebrow, marginBottom: 12 }}>DAMAGE CHARGES</p>
                  {damages.map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                      <div>
                        <div style={{ color: C.textH, fontSize: 14 }}>{d.item}{d.quantity > 1 ? ` × ${d.quantity}` : ""}</div>
                        {d.facility && <div style={{ color: C.textS, fontSize: 12 }}>{d.facility}</div>}
                      </div>
                      <div style={{ color: C.textB, fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap" }}>{fmt(d.amount)}</div>
                    </div>
                  ))}
                  <p style={{ color: left > 0 ? "#d4a800" : C.textS, fontSize: 13, margin: "8px 0 0" }}>
                    {left > 0 ? `${fmt(left)} of this is still to pay.` : "Paid."} Questions about a charge? Contact the resort.
                  </p>
                </div>
              );
            })()}

            {/* ── PAYMENTS ────────────────────────────────────────────────── */}
            {payments.length > 0 && (
              <div style={{ ...card, marginBottom: 20 }}>
                <p style={{ ...eyebrow, marginBottom: 12 }}>PAYMENTS ON THIS BOOKING</p>
                {payments.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <div style={{ color: C.textH, fontSize: 14 }}>{PAYMENT_LABEL[p.type] ?? p.type} · {p.method === "PayMongo" ? "Online (QR Ph)" : p.method === "GCash" ? "QR Ph" : p.method}</div>
                      <div style={{ color: C.textS, fontSize: 12 }}>
                        {new Date(p.receivedAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
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
                  {found.status === "ResortCancelled" || noShow
                    ? choosing || noShowChoosing ? "Use the choice above to pick a new date." : "See the note above about your new date."
                    : `This reservation is ${found.checkedInAt && !closed ? "under way" : found.status.toLowerCase()}, so there is nothing left to change here. Contact support if you think that is wrong.`}
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(3, minmax(0,1fr))", gap: 16 }}>
                    {actions.map((a) => {
                      const on = action === a.key;
                      return (
                        <button
                          key={a.key}
                          type="button"
                          aria-pressed={on}
                          disabled={!!a.disabled}
                          title={a.disabled}
                          onClick={() => { setAction(on ? null : a.key); if (!on && a.key === "details") openDetails(); setNewDate(""); setDateError(null); }}
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
                          <strong style={{ display: "block", color: C.textH, marginBottom: 4 }}>Rescheduling policy</strong>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {reschedulePolicy().map((line) => <li key={line}>{line}</li>)}
                            <li>The resort checks the date you pick is still open and then approves or declines it, so <strong>please watch your email</strong> — we send the answer to {found.email || "the address on your booking"}.</li>
                          </ul>
                          <details style={{ marginTop: 10 }}>
                            <summary style={{ cursor: "pointer", color: C.textH, fontWeight: 600 }}>In an emergency</summary>
                            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                              {emergencyPolicy().map((line) => <li key={line}>{line}</li>)}
                            </ul>
                          </details>
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
                      {moveInstead && (
                        <p style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${gold}66`, borderRadius: 10, padding: "16px 16px", color: C.textB, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
                          <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0, marginTop: 4 }}><Icon name="calendar" size={15} strokeWidth={1.5} /></span>
                          <span>
                            <strong style={{ display: "block", color: C.textH, fontSize: 13, marginBottom: 4 }}>You can still move your date for free.</strong>
                            Can&rsquo;t make it on {fmtDate(found.date)}? <button className="sw-ulink" type="button" onClick={() => setAction("reschedule")} style={{ background: "none", border: "none", padding: 0, color: C.goldInk, textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>Move it to another date</button> instead, once, and keep everything you paid. Cancelling forfeits your payment.
                          </span>
                        </p>
                      )}
                      {/* Inside the notice window the booking can't be moved or
                          cancelled online. An emergency is emailed to the
                          resort with proof, and staff take it from there. */}
                      {cancelClosed ? (
                        emDone ? (
                          <div role="status" style={{ border: "1px solid #2e9e4e66", borderRadius: 12, padding: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <span aria-hidden="true" style={{ color: "#6ec071", lineHeight: 0, marginTop: 3 }}><Icon name="check" size={18} strokeWidth={2} /></span>
                            <span style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.65 }}>
                              <strong style={{ display: "block", color: C.textH, marginBottom: 4 }}>Your emergency request was sent.</strong>
                              The resort will look at your proof and email their answer to {found.email}. If it&rsquo;s approved, your booking moves to a free date at no charge.
                            </span>
                          </div>
                        ) : (
                        <>
                          <div role="note" style={{ border: `1px solid ${gold}66`, borderRadius: 12, padding: "18px 18px", margin: "0 0 18px", background: `${gold}0d` }}>
                            <p style={{ display: "flex", gap: 12, alignItems: "flex-start", color: C.textB, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
                              <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, flexShrink: 0, marginTop: 4 }}><Icon name="shield-alert" size={16} strokeWidth={1.5} /></span>
                              <span>
                                <strong style={{ display: "block", color: C.textH, fontSize: 14, marginBottom: 4 }}>Your visit is too close to cancel online.</strong>
                                Bookings can&rsquo;t be cancelled or moved within {noticeDays} day{noticeDays === 1 ? "" : "s"} of the visit. Something serious came up, such as illness, injury or a death in the family? Send the resort what happened with your proof (a medical certificate, hospital record or death certificate). If it&rsquo;s approved, they move your booking to a free date at no charge.
                              </span>
                            </p>
                          </div>

                          <p style={{ ...eyebrow, color: C.goldInk, marginBottom: 10 }}>EMERGENCY REQUEST</p>
                          <Label htmlFor="mb-emergency" style={{ display: "block", color: C.textH, fontSize: 13, marginBottom: 6 }}>What happened?</Label>
                          <Textarea id="mb-emergency" value={emText} onChange={(e) => setEmText(e.target.value)} rows={4} maxLength={EMERGENCY_MESSAGE_MAX} />

                          <p style={{ color: C.textH, fontSize: 13, margin: "16px 0 6px" }}>Your proof</p>
                          <p style={{ color: C.textS, fontSize: 12, margin: "0 0 10px" }}>Up to {PROOF_MAX_FILES} photos or PDFs. Only the resort&rsquo;s staff can see them.</p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
                            {emFiles.map((f, i) => (
                              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 8px", borderRadius: 10, border: `1px solid ${C.border}`, maxWidth: "100%" }}>
                                {f.type.startsWith("image/")
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={f.data} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                                  : <span aria-hidden="true" style={{ width: 40, height: 40, display: "grid", placeItems: "center", color: C.goldInk }}><Icon name="clipboard" size={18} /></span>}
                                <span style={{ color: C.textB, fontSize: 12.5, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setEmFiles((xs) => xs.filter((_, j) => j !== i))}
                                  style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", color: C.textS, cursor: "pointer", display: "grid", placeItems: "center" }}>
                                  <Icon name="x" size={14} />
                                </button>
                              </span>
                            ))}
                            {emFiles.length < PROOF_MAX_FILES && (
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 54, padding: "0 16px", borderRadius: 10, border: `1px dashed ${gold}88`, color: C.goldInk, fontSize: 12.5, fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}>
                                <Icon name="plus" size={14} /> ADD PHOTO OR PDF
                                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden
                                  onChange={(e) => { void addProof(e.target.files); e.target.value = ""; }} />
                              </label>
                            )}
                          </div>
                          {emError && <p style={{ color: "#e07a7a", fontSize: 13, margin: "10px 0 0" }}>{emError}</p>}

                          <details style={{ margin: "18px 0 20px" }}>
                            <summary style={{ cursor: "pointer", color: C.textS, fontSize: 12.5 }}>Other ways to reach the resort</summary>
                            <div style={{ marginTop: 10 }}><ResortContact mailSubject={`Emergency – ${found.id}`} /></div>
                          </details>
                          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <button type="button" disabled title="Not available this close to your visit"
                              style={{ minHeight: 48, borderRadius: 8, padding: "0 20px", border: `1px solid ${C.border}`, background: "transparent", color: C.textS, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, cursor: "not-allowed", opacity: 0.5 }}>
                              CANCEL MY BOOKING
                            </button>
                            <button className="sw-btn" type="button" onClick={() => void sendEmergency()} disabled={emBusy}
                              style={{ ...goldBtn, minHeight: 48, display: "inline-flex", alignItems: "center", gap: 8, opacity: emBusy ? 0.6 : 1, cursor: emBusy ? "wait" : "pointer" }}>
                              {emBusy ? "SENDING…" : <>SEND TO THE RESORT <span aria-hidden="true">&rarr;</span></>}
                            </button>
                          </div>
                        </>
                        )
                      ) : (
                        <>
                      <p style={{ color: C.textS, fontSize: 13, margin: "0 0 16px" }}>
                        Help us understand why your plans changed. This step is optional.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
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
                    </>
                  )}

                  {action === "cancel" && cancelDone && (
                    <p style={{ color: "#6ec071", fontSize: 14, margin: 0, lineHeight: 1.7 }}>
                      Your booking has been cancelled. Payments already made are not refunded.
                    </p>
                  )}

                  {/* The guest's own details: everything on the booking is
                      shown, only the name, email and number can change. */}
                  {action === "details" && (() => {
                    const nameOk = isValidName(det.name.trim());
                    const emailOk = isValidEmail(det.email.trim());
                    const contactOk = isValidPHNumber(sanitizeContact(det.contact));
                    const changes = [
                      det.name.trim() !== found.name && ["Name", found.name, det.name.trim()],
                      det.email.trim().toLowerCase() !== found.email.toLowerCase() && ["Email", found.email, det.email.trim().toLowerCase()],
                      sanitizeContact(det.contact) !== found.contact && ["Mobile number", found.contact, sanitizeContact(det.contact)],
                    ].filter(Boolean) as [string, string, string][];
                    const canApply = !detLockedUntil && !detBusy && nameOk && emailOk && contactOk && changes.length > 0;
                    const field = (id: string, label: string, key: "name" | "email" | "contact", ok: boolean, hint: string, type = "text") => (
                      <div>
                        <Label htmlFor={id} style={{ ...microLabel, display: "block" }}>{label}</Label>
                        <Input id={id} type={type} value={det[key]} disabled={!!detLockedUntil || detBusy}
                          onChange={(e) => { setDet((d) => ({ ...d, [key]: e.target.value })); setDetDone(false); }}
                          aria-invalid={!ok} style={{ height: 46 }} />
                        {!ok && <p style={{ color: "#e07a7a", fontSize: 12, margin: "6px 0 0" }}>{hint}</p>}
                      </div>
                    );
                    return (
                      <>
                        <p style={{ ...eyebrow, marginBottom: 12 }}>YOUR BOOKING DETAILS</p>
                        <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))", gap: 16, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                          {([
                            ["REFERENCE", found.id],
                            ["PACKAGE", packageAvailed(found) || "Resort booking"],
                            [stayLabel(found).includes("–") ? "DATES" : "DATE", stayLabel(found)],
                            ["TIME", slotHours ?? "—"],
                            ["GUESTS", `${found.guests} guest${found.guests === 1 ? "" : "s"}`],
                            ["ROOMS", found.rooms.length ? rooms.filter((rm) => found.rooms.includes(rm.id)).map((rm) => rm.name).join(", ") || `${found.rooms.length}` : "None"],
                            ["TOTAL", fmt(found.total)],
                            ["STATUS", statusLabel(found)],
                          ] as const).map(([l, v]) => (
                            <div key={l} style={{ minWidth: 0 }}>
                              <p style={microLabel}>{l}</p>
                              <p style={{ color: C.textB, fontSize: 13.5, fontWeight: 600, margin: 0, overflowWrap: "anywhere" }}>{v}</p>
                            </div>
                          ))}
                        </div>

                        <p style={{ ...eyebrow, marginBottom: 6 }}>GUEST INFORMATION</p>
                        <p style={{ color: C.textS, fontSize: 13, margin: "0 0 16px" }}>
                          You can change your name, email and mobile number. The date, guests and package stay as they are. After a change, the next one is possible in {DETAILS_COOLDOWN_HOURS} hours.
                        </p>
                        {detLockedUntil && (
                          <p role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${gold}66`, borderRadius: 10, padding: "12px 14px", color: C.textB, fontSize: 13, margin: "0 0 16px" }}>
                            <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, marginTop: 3 }}><Icon name="clock" size={15} /></span>
                            You updated your details recently. You can change them again after {cooldownLabel(detLockedUntil)}.
                          </p>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                          {field("mb-det-name", "FULL NAME", "name", nameOk, "Enter your full name.")}
                          {field("mb-det-email", "EMAIL ADDRESS", "email", emailOk, "Enter a valid email address.", "email")}
                          {field("mb-det-contact", "MOBILE NUMBER", "contact", contactOk, "Use a PH mobile number, 09XXXXXXXXX.", "tel")}
                        </div>
                        {detError && <p style={{ color: "#e07a7a", fontSize: 13, margin: "14px 0 0" }}>{detError}</p>}
                        {detDone && (
                          <p role="status" style={{ color: "#6ec071", fontSize: 13.5, margin: "14px 0 0", lineHeight: 1.6 }}>
                            Your details were updated. We emailed a confirmation{found.email ? ` to ${found.email}` : ""}. From now on, find your booking with this email.
                          </p>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                          <button className="sw-btn" type="button" onClick={() => setDetAsk(true)} disabled={!canApply}
                            style={{ ...goldBtn, opacity: canApply ? 1 : 0.45, cursor: canApply ? "pointer" : "not-allowed" }}>
                            APPLY <span aria-hidden="true">&rarr;</span>
                          </button>
                        </div>

                        <AlertDialog open={detAsk} onOpenChange={(o) => { if (!o && !detBusy) setDetAsk(false); }}>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 24, fontWeight: 400 }}>Are these details right?</AlertDialogTitle>
                              <AlertDialogDescription asChild>
                                <div style={{ color: C.textS, fontSize: 14, lineHeight: 1.6 }}>
                                  <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 12px", display: "grid", gap: 10 }}>
                                    {changes.map(([l, from, to]) => (
                                      <li key={l} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                                        <span style={{ display: "block", fontSize: 11, letterSpacing: 1.4, color: C.textS }}>{l.toUpperCase()}</span>
                                        <span style={{ textDecoration: "line-through", opacity: 0.7, overflowWrap: "anywhere" }}>{from}</span>
                                        <span aria-hidden="true"> → </span>
                                        <strong style={{ color: C.textH, overflowWrap: "anywhere" }}>{to}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                  You won&rsquo;t be able to change them again for {DETAILS_COOLDOWN_HOURS} hours.
                                  {changes.some(([l]) => l === "Email") && <> Your confirmation and future emails go to the new address, and you&rsquo;ll find your booking with it.</>}
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={detBusy} style={{ ...outBtn, color: C.goldInk, minHeight: 48 }}>GO BACK</AlertDialogCancel>
                              <Button onClick={() => void applyDetails()} disabled={detBusy} style={{ ...goldBtn, minHeight: 48 }}>
                                {detBusy ? "SAVING…" : "YES, UPDATE"}
                              </Button>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    );
                  })()}
                </>
              )}
            </div>

          </>
        )}

        {/* ── BOOKING POLICIES ────────────────────────────────────────── */}
        <section aria-labelledby="mb-policies" style={{ marginTop: 48 }}>
          <h2 id="mb-policies" style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 24 : 28, fontWeight: 400, textAlign: "center", margin: "0 0 24px" }}>Booking policies</h2>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: 16 }}>
            {([
              ["calendar-clock", "Rescheduling", [
                `Move your booking to another free date once, at no charge. Everything you paid carries over.`,
                `Ask at least ${noticeDays} day${noticeDays === 1 ? "" : "s"} before your visit. The new date is held while the resort confirms it.`,
              ]],
              ["shield-alert", "Cancellation", [
                `If you cancel, payments aren't refunded. Moving your date instead keeps them.`,
                `Within ${noticeDays} day${noticeDays === 1 ? "" : "s"} of the visit, bookings can't be cancelled online. For an emergency, send the resort your proof from here.`,
                `If the resort cancels, you choose a free new date or a full refund.`,
              ]],
              ["user", "Your details", [
                `Change the name, email and mobile number on your booking yourself, under Update guest details.`,
                `After a change, the next one is possible in ${DETAILS_COOLDOWN_HOURS} hours. A confirmation is emailed each time.`,
              ]],
            ] as const).map(([icon, title, lines]) => (
              <div key={title} style={{ ...card, padding: 22 }}>
                <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", background: `${gold}1f`, color: C.goldInk, marginBottom: 14 }}>
                  <Icon name={icon} size={19} strokeWidth={1.75} />
                </span>
                <h3 style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>{title}</h3>
                <ul style={{ margin: 0, paddingLeft: 18, color: C.textS, fontSize: 13, lineHeight: 1.65, display: "grid", gap: 6 }}>
                  {lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Confirm the email before finding the booking. */}
      <Dialog open={!!otp} onOpenChange={(o) => { if (!o && otpBusy !== "verify") { setOtp(null); setOtpCode(""); setOtpMsg(null); } }}>
        <DialogContent style={{ maxWidth: 440, textAlign: "center" }}>
          <DialogHeader style={{ alignItems: "center", textAlign: "center" }}>
            <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: `${gold}1f`, color: C.goldInk, margin: "0 auto 6px" }}>
              <Icon name="mail" size={22} strokeWidth={1.6} />
            </span>
            <DialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 24, fontWeight: 400 }}>Confirm it&rsquo;s you</DialogTitle>
            <DialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.6 }}>
              {otp?.challenge
                ? <>We sent a 6-digit code to <strong style={{ color: C.textH }}>{otp.email}</strong>. Enter it to open your booking.</>
                : otpBusy === "send" ? <>Sending a code to <strong style={{ color: C.textH }}>{otp?.email}</strong>…</> : <>We need to send a code to {otp?.email}.</>}
            </DialogDescription>
          </DialogHeader>

          <Input
            id="mb-otp"
            aria-label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={otpCode}
            disabled={!otp?.challenge || otpBusy === "verify"}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setOtpCode(v);
              if (v.length === 6) void verifyOtp(v);
            }}
            onPaste={(e) => {
              const v = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
              if (v.length === 6) { e.preventDefault(); setOtpCode(v); void verifyOtp(v); }
            }}
            placeholder="••••••"
            style={{ height: 56, textAlign: "center", fontSize: 26, letterSpacing: 10, fontWeight: 600 }}
          />
          {otpMsg && (
            <p role={otpMsg.bad ? "alert" : "status"} style={{ color: otpMsg.bad ? "#e07a7a" : C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>{otpMsg.text}</p>
          )}

          <Button className="sw-btn" onClick={() => void verifyOtp(otpCode)} disabled={otpCode.length !== 6 || !!otpBusy}
            style={{ ...goldBtn, minHeight: 48, opacity: otpCode.length !== 6 || otpBusy ? 0.5 : 1 }}>
            {otpBusy === "verify" ? "CHECKING…" : <>VERIFY &amp; FIND BOOKING <span aria-hidden="true">&rarr;</span></>}
          </Button>
          <button type="button" disabled={!!otpBusy || otpResendIn > 0} onClick={() => otp && void sendOtp(otp.ref, otp.email)}
            style={{ background: "none", border: "none", color: otpResendIn > 0 ? C.textS : C.goldInk, fontSize: 12.5, cursor: otpBusy || otpResendIn > 0 ? "default" : "pointer", textDecoration: otpResendIn > 0 ? "none" : "underline", padding: 4 }}>
            {otpBusy === "send" ? "Sending…" : otpResendIn > 0 ? `Send a new code in ${otpResendIn}s` : "Send a new code"}
          </button>
        </DialogContent>
      </Dialog>

      {/* Confirm before cancelling — the one action here that cannot be undone. */}
      <AlertDialog open={showCancelConfirm} onOpenChange={(open) => { if (!open) setShowCancelConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 24, fontWeight: 400 }}>
              Cancel this reservation?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>
              Booking {found?.id} for {found ? fmtDate(found.date) : ""} will be cancelled. Payments already made are not refunded.
              {moveInstead && <> You can still move your date for free instead.</>}
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

/** The facts a guest must not miss on a rebooking (the money kept for them,
 *  the deadline, their reference), shown large in tiles above the text. */
function FactTiles({ tiles }: { tiles: { label: string; value: string; urgent?: boolean; mono?: boolean }[] }) {
  const C = THEME_COLORS;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 10, margin: "0 0 16px" }}>
      {tiles.map((t) => (
        <div key={t.label} style={{
          borderRadius: 10, padding: "12px 16px",
          background: t.urgent ? "rgba(232,160,112,0.12)" : `${gold}1a`,
          border: `1px solid ${t.urgent ? "rgba(232,160,112,0.55)" : `${gold}66`}`,
        }}>
          <div style={{ color: t.urgent ? "#e8a070" : C.goldInk, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>{t.label}</div>
          <div style={{ color: C.textH, fontSize: 20, fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere", ...(t.mono ? { fontFamily: "monospace", letterSpacing: 1 } : {}) }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}
