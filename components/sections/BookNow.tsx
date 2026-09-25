  "use client";

  import { useState, useEffect, useRef } from "react";
  import { useTheme } from "@/contexts/ThemeContext";
  import { useWidth } from "@/hooks/useWidth";
  import { useToast } from "@/contexts/ToastContext";
  import { T } from "@/lib/theme";
  import { gold, goldBtn, outBtn } from "@/lib/styles";
  import { fmt, fmtTimer, fmtDate, getPackageTier, checkBookingAvailability, getSharedPoolUsage, isRoomOpen, roomsTakenOn } from "@/lib/utils";
  import { priceBooking, bookingLabel } from "@/lib/pricing";
  import { BookingDatePicker } from "@/components/booking/BookingDatePicker";
  import type { Booking, BookingResource, BookingSlot, BookingTier, PackageDeepLink } from "@/types/booking";
  import { SLOTS, QUIET_HOURS_POLICY, TURNOVER_WINDOW } from "@/lib/resort";
  import type { Room } from "@/types/room";
  import type { Facility } from "@/types/facility";
  import { Icon, type IconName } from "@/components/common/Icon";
  import {
    isValidEmail,
    isValidPHNumber,
    isValidName,
    sanitizeName,
    sanitizeContact,
    sanitizeNotes,
    validateBookingForm,
    isWithinBookingWindow,
    describeDateProblem,
    clamp,
    NAME_MAX,
    NOTES_MAX,
    GUESTS_MIN,
    GUESTS_MAX,
    OVERTIME_MAX,
    OVERTIME_RATE,
    RESORT_MAX_CAPACITY,
    ROOM_BUNDLE_DISCOUNT_PCT,
    EVENT_VENUE_RATE,
    SHARED_PER_HEAD_RATE,
  } from "@/lib/validators";
  import { Button } from "@/components/ui/button";
  import { Checkbox } from "@/components/ui/checkbox";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
  import { Label } from "@/components/ui/label";
  import { Separator } from "@/components/ui/separator";
  import { Input } from "@/components/ui/input";
  import { Textarea } from "@/components/ui/textarea";

  interface BookNowProps {
    /** Real bookings (personal details stripped) — used only to show which
     *  dates, rooms and capacity are taken. The booking itself is created
     *  by the server after payment, never written from here. */
    bookings: Booking[];
    /** Called once the booking is saved, so calendars can refresh. */
    onBooked?: () => void;
    rooms: Room[];
    closedDates: string[];
    /** Used to hide/disable a room, the pool, or the events venue when
     *  staff has flagged it "Under Maintenance" in the admin Facilities
     *  tab — omit to skip these checks entirely. */
    facilities?: Facility[];
    preselectedRoom?: number | null;
    clearPreselected?: () => void;
    preselectedDate?: string;
    clearPreselectedDate?: () => void;
    onGoHome?: () => void;
    /** Deep-link support (e.g. a Home page package card): pre-select the
     *  resource/tier and jump straight past the Tour Type step. Undefined
     *  ⇒ ordinary flow starting at Step 1. */
    initialResource?: BookingResource;
    initialTier?: BookingTier;
    /** Present only when arriving from a Home page package card. A package
     *  is a fixed, one-time purchase — its price and guest capacity are not
     *  negotiable, so when this is set the whole guest/room/overtime/tier
     *  picker UI is hidden and the guest only picks a date. */
    initialPackage?: PackageDeepLink;
  }

  export function BookNow({
    bookings, onBooked, rooms, closedDates,
    facilities = [],
    preselectedRoom, clearPreselected,
    preselectedDate, clearPreselectedDate,
    onGoHome,
    initialResource, initialTier, initialPackage,
  }: BookNowProps) {
    const { isDark } = useTheme();
    const C = T(isDark);
    const { toast } = useToast();
    const w = useWidth();
    const mob = w < 768;

    // A package is a fixed, one-time purchase (see PackageDeepLink) — no
    // customizing guests, rooms, overtime or tier once one is chosen. Only
    // the date is left for the guest to pick.
    const isPackage = !!initialPackage;
    // Day (7 AM–5 PM), Night (7 PM–12 AM) or Whole Day — see lib/resort.ts.
    // A Whole Day package fixes it; a single-slot package lets the guest
    // pick Day or Night on the date step.
    const [slot, setSlot] = useState<BookingSlot>(initialPackage?.slotMode === "WholeDay" ? "WholeDay" : "Day");
    const [step, setStep] = useState(initialResource ? 3 : 1);
    const [date, setDate] = useState(preselectedDate || "");
    const [guests, setGuests] = useState(initialPackage?.capacity ?? 10);
    // Guests don't choose overtime any more: staff add it at the resort when
    // the Night slot is free (max 2 hrs). Kept at 0 so every price and
    // availability call below has one shape for both sides.
    const overtime = 0;
    // Which resource is being booked (Pool / events Venue / both), and an
    // explicit Shared-vs-Exclusive override. tierChoice starts as null so the
    // guest-count-derived default still applies until they actively pick one —
    // this is what answers "is it not better if we add if they are booking
    // exclusively?" without forcing a choice on everyone.
    const [resource, setResource] = useState<BookingResource>(initialResource ?? "Pool");
    const [tierChoice, setTierChoice] = useState<BookingTier | null>(initialTier ?? null);
    const [selRooms, setSelRooms] = useState<number[]>(preselectedRoom ? [preselectedRoom] : []);
    const [form, setFormState] = useState({ name: "", email: "", contact: "", notes: "" });
    const [bookingId, setBookingId] = useState("");
    const [qrSeconds, setQrSeconds] = useState(600);
    const [qrExpired, setQrExpired] = useState(false);
    const [qrRetryKey, setQrRetryKey] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Live PayMongo QRPh payment ────────────────────────────────────────
    // qrData holds the real, per-transaction QR returned by /api/payment.
    // Until it arrives the screen shows a loading state rather than a
    // decorative placeholder, so nobody can be asked to scan a fake code.
    const [qrData, setQrData] = useState<{
      paymentIntentId: string;
      qrImageUrl: string;
      expiresAt: string | null;
      expiresInSeconds: number;
      amountCentavos: number;
      testUrl: string | null;
    } | null>(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [qrError, setQrError] = useState<string | null>(null);
    const [paid, setPaid] = useState(false);
    // The server's own price for this booking, returned with the QR. The
    // payment screen shows these so the amount on screen is exactly the
    // amount on the QR, even if something changed since the guest started.
    const [serverQuote, setServerQuote] = useState<{ total: number; down: number } | null>(null);
    // Saving the booking after payment: in progress, or failed with a message.
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Held in a ref so the teardown below can void whatever intent is live
    // without the effect having to re-run every time qrData changes.
    const activeIntentRef = useRef<string | null>(null);

    // Modal states
    const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
    const [showGcashWarning, setShowGcashWarning] = useState(false);
    const [policyChecked, setPolicyChecked] = useState(false);
    // Modals are portaled straight into document.body (see the GCash
    // warning modal below) so they can never be broken by some ancestor
    // ending up with a non-"none" CSS transform — document isn't available
    // during SSR, so this only flips true once we're safely in the browser.


    const setF = (k: string, v: string) => setFormState((f) => ({ ...f, [k]: v }));

    const closedSet = new Set(closedDates);
    // A Venue-only booking is always exclusive to the venue by definition —
    // there's no "sharing" a rented hall. Otherwise, the guest's explicit
    // choice wins; absent that, fall back to the guest-count-derived default.
    // The venue is always exclusive, and Whole Day is only sold exclusive.
    const tier: BookingTier = resource === "Venue" || slot === "WholeDay" ? "Exclusive" : (tierChoice ?? getPackageTier(guests));

    // An Exclusive buyout reserves the WHOLE resort, not however many of the
    // fixed 30 guests actually attend — so the moment a guest picks
    // Exclusive (outside a package, where capacity is already fixed), the
    // guest count locks to the resort's full capacity rather than staying
    // freely editable.
    useEffect(() => {
      if (!isPackage && resource !== "Venue" && tier === "Exclusive") {
        setGuests(RESORT_MAX_CAPACITY);
      }
    }, [isPackage, resource, tier]);

    // isWithinBookingWindow also rejects past dates and malformed strings, so
    // a stale preselected date (deep link, or a tab left open past midnight)
    // cannot slip through even though the calendar would never offer it.
    // checkBookingAvailability checks whichever resource(s) this booking
    // actually uses — the pool's running Shared headcount, the venue's
    // single-booking calendar, or both.
    const dateCapacity = date ? checkBookingAvailability(date, slot, guests, tier, resource, bookings, facilities) : { ok: true };
    const dateOk =
      !!date &&
      isWithinBookingWindow(date) &&
      dateCapacity.ok &&
      !closedSet.has(date);
    // Whole Day is always exclusive, so the shared readout is per single slot.
    const sharedUsage = date && slot !== "WholeDay" ? getSharedPoolUsage(date, bookings, slot) : { used: 0, max: 0 };
    // An Exclusive buyout fixes the guest count to the resort's full
    // capacity — the stepper is locked (not just defaulted) once that's
    // chosen, so it can't drift away from what the flat rate actually buys.
    const guestsLocked = !isPackage && resource !== "Venue" && tier === "Exclusive";
    // Same wording the server stores on the booking (lib/pricing.ts).
    const packageLabel = bookingLabel({
      packageTitle: initialPackage?.title,
      resource,
      slot,
      hasRoom: selRooms.length > 0,
    });

    const requiresRoom = !!initialPackage?.requiresRoom;
    // Rooms under maintenance are hidden; rooms already rented to another
    // guest on the chosen date are shown but can't be picked.
    const bookableRooms = rooms.filter((r) => isRoomOpen(r.id, facilities));
    // Rooms are rented per slot, so only a clash in the same slot counts.
    const takenRooms = date ? roomsTakenOn(date, slot, bookings) : new Set<number>();
    const showRoomPicker = (!isPackage && resource !== "Venue") || (isPackage && requiresRoom);
    const selectedRoomDetails = selRooms.map((rid) => rooms.find((r) => r.id === rid)).filter((r): r is Room => !!r);
    // Same function the server uses to set the QR amount (lib/pricing), so
    // what's shown here is what gets charged. Named fields are unpacked
    // because the breakdown below displays each line.
    const {
      tourBase, poolFee, venueFee, exclusiveDiscount, bundleDiscount,
      roomsFeeRaw, roomBundleDiscount, total, down, slots: slotCount,
    } = priceBooking({
      pkg: isPackage ? { price: initialPackage!.price, requiresRoom } : null,
      resource,
      tier,
      slot,
      guests,
      overtime,
      roomPrices: selectedRoomDetails.map((r) => r.price),
    });
    // Everything the server needs to re-check and re-price this booking.
    const draft = {
      packageCode: initialPackage?.code,
      resource, tier, slot, guests, overtime,
      rooms: selRooms,
      date,
      name: form.name, email: form.email, contact: form.contact, notes: form.notes,
    };
    const roomsFree = selRooms.every((r) => !takenRooms.has(r));
    // One line per part of the price, in the same order the server adds
    // them up. Whole Day doubles the per-slot parts, and says so.
    const perSlot = slotCount === 2 ? " × 2 slots" : "";
    const priceLines: { label: string; amount: number; discount?: boolean; strike?: number }[] = isPackage
      ? [
          {
            label: `${initialPackage!.title} — ${SLOTS[slot].label}`,
            amount: initialPackage!.price,
            strike: initialPackage!.listPrice,
          },
          ...selectedRoomDetails.map((r) => ({ label: `Room — ${r.name}${perSlot}`, amount: r.price * slotCount })),
          ...(roomBundleDiscount > 0
            ? [{ label: `Room package discount (-${Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}%)`, amount: roomBundleDiscount, discount: true }]
            : []),
        ]
      : [
          ...(poolFee > 0
            ? [{
                label: tier === "Exclusive"
                  ? `Exclusive pool${perSlot}`
                  : `Shared pool (${guests} × ${fmt(SHARED_PER_HEAD_RATE)}${perSlot})`,
                amount: poolFee,
              }]
            : []),
          ...(venueFee > 0 ? [{ label: `Events venue${perSlot}`, amount: venueFee }] : []),
          ...(exclusiveDiscount > 0 ? [{ label: "Exclusive discount (-5%)", amount: exclusiveDiscount, discount: true }] : []),
          ...(bundleDiscount > 0 ? [{ label: "Bundle discount (-10%)", amount: bundleDiscount, discount: true }] : []),
          ...selectedRoomDetails.map((r) => ({ label: `Room — ${r.name}${perSlot}`, amount: r.price * slotCount })),
        ];
    void roomsFeeRaw; void tourBase;
    // A package requiring a room only ever wants ONE — picking a new one
    // replaces the selection instead of adding to it.
    const toggleRoom = (id: number) => {
      if (isPackage && requiresRoom) {
        setSelRooms((r) => (r.includes(id) ? [] : [id]));
      } else {
        setSelRooms((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
      }
    };
    const handleContact = (v: string) => setF("contact", sanitizeContact(v));
    // Names are filtered as they are typed, so digits and symbols never even
    // appear in the field — the user sees the rule instead of being told off
    // for breaking it after the fact.
    const handleName = (v: string) => setF("name", sanitizeName(v));
    const handleNotes = (v: string) => setF("notes", sanitizeNotes(v));

    // ── 1. Mint a real QR when the guest reaches step 6 ───────────────────
    // Each visit creates its own PayMongo payment intent, so every booking
    // (and every retry) gets a genuinely unique QR rather than a shared image.
    useEffect(() => {
      if (step !== 6) return;
      let cancelled = false;

      setQrData(null);
      setQrError(null);
      setPaid(false);
      setQrExpired(false);
      setQrLoading(true);

      (async () => {
        try {
          const res = await fetch("/api/payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // The booking itself, not an amount: the server prices it and
            // decides what the QR charges.
            body: JSON.stringify({ draft }),
          });
          const json = await res.json();
          if (cancelled) return;
          if (!json.success) throw new Error(json.error ?? "Could not start payment.");
          activeIntentRef.current = json.payment.paymentIntentId;
          setServerQuote(json.quote ?? null);
          setQrData(json.payment);
        } catch (err) {
          if (!cancelled) {
            setQrError(err instanceof Error ? err.message : "Could not start payment.");
          }
        } finally {
          if (!cancelled) setQrLoading(false);
        }
      })();

      return () => {
        cancelled = true;
        // Leaving step 6 (BACK), or retrying, abandons this QR — so void it
        // rather than leaving a payable code loose. DELETE checks the status
        // first, so an intent that just succeeded is never cancelled; that
        // is what makes this safe to run on the way to step 7 as well.
        const abandoned = activeIntentRef.current;
        activeIntentRef.current = null;
        if (abandoned) {
          // keepalive lets the request finish even if this unmount is part
          // of the guest navigating away from the page entirely.
          fetch(`/api/payment?id=${encodeURIComponent(abandoned)}`, {
            method: "DELETE",
            keepalive: true,
          }).catch(() => {});
        }
      };
    }, [step, qrRetryKey]);

    // ── 2. Countdown, driven by PayMongo's own expiry ─────────────────────
    // The old 600s constant was decorative — it could disagree with when the
    // QR actually died. This reads the real expires_at instead.
    useEffect(() => {
      if (step !== 6 || !qrData || paid) return;

      // The deadline is anchored to the moment this screen received the QR,
      // using the server's own measurement of how long was left. Reading
      // expires_at against Date.now() would misfire on any machine whose
      // clock is off — a guest several minutes fast would watch a freshly
      // minted QR expire immediately.
      const deadline = Date.now() + qrData.expiresInSeconds * 1000;
      let finished = false;

      const expire = async () => {
        if (finished) return;
        finished = true;
        if (timerRef.current) clearInterval(timerRef.current);

        // Void it server-side before declaring it dead. DELETE re-checks the
        // status first, so a payment that landed in the closing seconds is
        // honoured instead of being cancelled out from under the guest.
        try {
          const res = await fetch(
            `/api/payment?id=${encodeURIComponent(qrData.paymentIntentId)}`,
            { method: "DELETE" }
          );
          const json = await res.json();
          if (json?.paid) { setPaid(true); return; }
        } catch {
          // Even if the cancel call fails, the QR must stop being offered.
        }
        setQrExpired(true);
      };

      const sync = () => {
        const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        setQrSeconds(left);
        if (left <= 0) void expire();
      };

      sync();
      timerRef.current = setInterval(sync, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [step, qrData, paid]);

    // ── 3. Poll PayMongo until the payment actually lands ─────────────────
    // This replaces the old "I'VE COMPLETED PAYMENT" button, which simply
    // took the guest's word for it and recorded the booking as Paid whether
    // or not any money had moved.
    useEffect(() => {
      if (step !== 6 || !qrData || paid || qrExpired) return;
      let cancelled = false;

      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/payment?id=${encodeURIComponent(qrData.paymentIntentId)}`);
          const json = await res.json();
          if (cancelled || !json.success) return;
          if (json.paid) {
            clearInterval(poll);
            setPaid(true);
          }
        } catch {
          // A dropped poll is not fatal — the next tick tries again.
        }
      }, 3000);

      return () => { cancelled = true; clearInterval(poll); };
    }, [step, qrData, paid, qrExpired]);

    // ── 4. Record the booking once payment is confirmed ───────────────────
    useEffect(() => {
      if (paid && step === 6) {
        // Paid intents must never be handed to the teardown's DELETE. The
        // endpoint would refuse to cancel one anyway, but clearing the ref
        // avoids a pointless round trip on the way to step 7.
        activeIntentRef.current = null;
        const t = setTimeout(() => void confirmOnline(), 300); // brief beat so the tick lands; kept short so a guest who closes the tab right after paying is unlikely to beat the save
        return () => clearTimeout(t);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paid, step]);

    // Save the booking on the server once PayMongo confirms payment.
    //
    // This used to append the booking to a local list, which for a guest
    // never left the browser — the admin never saw it and the date stayed
    // open. Now the server checks the payment itself and stores the booking
    // at the price actually paid, and the database assigns the reference.
    // Safe to retry: the same payment can only ever create one booking.
    const confirmOnline = async () => {
      const paymentIntentId = qrData?.paymentIntentId;
      if (!paymentIntentId || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft, paymentIntentId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json.booking?.id) {
          throw new Error(json?.error ?? "We couldn't save your booking.");
        }
        setBookingId(json.booking.id);
        onBooked?.();
        clearPreselected?.(); clearPreselectedDate?.();
        if (timerRef.current) clearInterval(timerRef.current);
        setShowPaymentConfirm(false);
        setStep(7);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "We couldn't save your booking.");
      } finally {
        setSaving(false);
      }
    };

    const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
    const cBr = isDark ? "#2a2520" : "#d6cfc4";

    const stepLabels = ["Tour Type", "Details", "Rooms", "Your Info", "GCash", "Done"];
    const stepIdx: Record<number, number> = { 1: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
    const labels = stepLabels;
    const currentIdx = stepIdx[step] ?? 0;


    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "32px 16px" : "80px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <p style={{ color: gold, letterSpacing: 4, fontSize: 12.5, marginBottom: 8, textAlign: "center" }}>RESERVATIONS</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 26 : 40, color: C.textH, textAlign: "center", marginBottom: 12 }}>Book Your Stay</h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2" style={{ opacity: 0.7, flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <span style={{ color: C.textS, fontSize: 14.5 }}>
              {step === 1
                ? <>Day: <strong style={{ color: C.textB }}>{SLOTS.Day.hours}</strong> · Night: <strong style={{ color: C.textB }}>{SLOTS.Night.hours}</strong></>
                : <>{SLOTS[slot].label}: <strong style={{ color: C.textB }}>{SLOTS[slot].hours}</strong></>
              }
            </span>
          </div>

          {/* Step indicator */}
          {step > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 32, overflowX: "auto" }}>
              {labels.map((label, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: i < currentIdx ? gold : "transparent", border: i === currentIdx ? `2px solid ${gold}` : i < currentIdx ? "none" : `1px solid ${isDark ? "#2a2520" : "#d6cfc4"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: i < currentIdx ? "#000" : i === currentIdx ? gold : C.textS, fontWeight: 700, flexShrink: 0 }}>
                      {i < currentIdx ? "✓" : i + 1}
                    </div>
                    <span style={{ color: i === currentIdx ? gold : C.textS, fontSize: mob ? 9.5 : 10.5, letterSpacing: 1, whiteSpace: "nowrap" }}>{label.toUpperCase()}</span>
                  </div>
                  {i < labels.length - 1 && (
                    <div style={{ width: mob ? 20 : 40, height: 1, background: i < currentIdx ? gold : isDark ? "#2a2520" : "#d6cfc4", marginTop: 0, marginBottom: 20, marginLeft: 4, marginRight: 4, flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Main card */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "40px", boxShadow: C.shadow }}>

            {/* STEP 1 – Tour Type */}
            {step === 1 && (
              <div>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>When would you like to come?</h3>
                <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 24, lineHeight: 1.7 }}>Reserve online now via GCash. 50% down payment required.</p>
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
                  {([
                    { id: "Day", icon: "sun", sub: `${SLOTS.Day.hours}.`, badge: "POPULAR" },
                    { id: "Night", icon: "moon", sub: `${SLOTS.Night.hours}. Quiet hours from 10 PM.`, badge: "" },
                    { id: "WholeDay", icon: "sun-moon", sub: `${SLOTS.WholeDay.hours}, exclusive — Day + Night for 10% less.`, badge: "BEST VALUE" },
                  ] as const).map((opt) => (
                    <div key={opt.id} onClick={() => { setSlot(opt.id); if (opt.id === "WholeDay") setTierChoice("Exclusive"); setStep(3); }}
                      style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "24px 20px", cursor: "pointer", position: "relative", transition: "border-color .2s,box-shadow .2s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${gold}66`; e.currentTarget.style.boxShadow = isDark ? "0 8px 24px rgba(0,0,0,0.4)" : "0 8px 24px rgba(100,70,10,0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      {opt.badge && <span style={{ position: "absolute", top: 12, right: 12, background: `${gold}22`, color: gold, fontSize: 9.5, padding: "3px 8px", borderRadius: 20, letterSpacing: 1, border: `1px solid ${gold}44` }}>{opt.badge}</span>}
                      <div style={{ marginBottom: 12, color: gold, lineHeight: 0 }}><Icon name={opt.icon as IconName} size={30} strokeWidth={1.5} /></div>
                      <h4 style={{ color: C.textH, fontSize: 17, fontFamily: "'Cormorant Garamond',Georgia,serif", marginBottom: 6 }}>{SLOTS[opt.id].label}</h4>
                      <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{opt.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Optional events-venue add-on — a full, independent buyout of the
                    events hall alongside the pool tour. A Venue-ONLY booking (no
                    pool at all) isn't offered here; it comes from a package on the
                    Home page instead, since it skips the tour entirely. */}
                <div
                  onClick={() => setResource((r) => (r === "Pool+Venue" ? "Pool" : "Pool+Venue"))}
                  style={{
                    marginTop: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    borderRadius: 10,
                    border: `1px solid ${resource === "Pool+Venue" ? gold : cBr}`,
                    background: resource === "Pool+Venue" ? `${gold}14` : "transparent",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${resource === "Pool+Venue" ? gold : cBr}`, background: resource === "Pool+Venue" ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14.5, color: "#000", flexShrink: 0 }}>
                    {resource === "Pool+Venue" && "✓"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.textH, fontSize: 14.5, fontWeight: 600 }}>Also rent the Events Venue</div>
                    <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>
                      Exclusive use of the events hall alongside your pool booking · +{fmt(EVENT_VENUE_RATE)} per slot, 10% off with an exclusive pool
                    </div>
                  </div>
                </div>
              </div>
            )}

           {/* STEP 3 – Date & Details */}
              {step === 3 && (
                <div>
                  <h3
                    style={{
                      color: C.textH,
                      fontFamily: "'Cormorant Garamond',Georgia,serif",
                      fontSize: 22,
                      marginBottom: 20,
                      fontWeight: 400,
                    }}
                  >
                    Pick Your Date & Details
                  </h3>

                  <p
                    id="booknow-date-label"
                    style={{
                      color: gold,
                      fontSize: 11.5,
                      letterSpacing: 2,
                      display: "block",
                      marginBottom: 10,
                    }}
                  >
                    SELECT DATE
                  </p>

                  <div style={{ marginBottom: 28 }} role="group" aria-labelledby="booknow-date-label">
                    <BookingDatePicker
                      bookings={bookings}
                      closedDates={closedDates}
                      selectedDate={date}
                      onSelectDate={(ds) => setDate(ds)}
                      isDark={isDark}
                      guests={guests}
                      resource={resource}
                      tier={tier}
                      slot={slot}
                    />

                    {date && !dateOk && (
                      <p style={{ color: "#e55", fontSize: 13.5, marginTop: 6 }}>
                        ⚠ {dateCapacity.reason ?? "This date is unavailable. Please choose another."}
                      </p>
                    )}

                    {date && dateOk && (
                      <p style={{ color: "#4caf50", fontSize: 13.5, marginTop: 6 }}>
                        ✓ Date looks available — please still call ahead to confirm!
                      </p>
                    )}

                    {date && resource !== "Venue" && tier === "Shared" && (
                      <p style={{ color: C.textS, fontSize: 12.5, marginTop: 6 }}>
                        Shared: {sharedUsage.used} of {sharedUsage.max} spots taken for this {SLOTS[slot].label}.
                      </p>
                    )}
                  </div>

                  {/* UNIFIED DETAILS SECTION — a package is a fixed, one-time
                      purchase, so there is nothing to customize here except
                      the date already picked above; guests, tier, rooms and
                      overtime are all locked by the package itself. */}
                  {isPackage ? (
                    <div
                      style={{
                        border: `1px solid ${gold}55`,
                        borderRadius: 10,
                        padding: "18px 20px",
                        marginBottom: 24,
                        background: isDark ? "rgba(201,168,76,0.06)" : "rgba(201,168,76,0.08)",
                      }}
                    >
                      <p style={{ color: gold, fontSize: 11.5, letterSpacing: 2, marginBottom: 8 }}>PACKAGE</p>
                      <p style={{ color: C.textH, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{initialPackage!.title}</p>
                      <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                        Fixed price of <strong style={{ color: gold }}>{fmt(initialPackage!.price)}</strong> for up to{" "}
                        <strong style={{ color: C.textH }}>{initialPackage!.capacity} guests</strong>
                        {initialPackage!.slotMode === "WholeDay" ? <>, {SLOTS.WholeDay.hours}</> : " per slot"}.
                        {requiresRoom ? " Pick your room next." : ""}
                      </p>
                      {/* A single-slot package: the guest chooses when. Availability
                          above is checked for the slot picked here. */}
                      {initialPackage!.slotMode !== "WholeDay" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                          {(["Day", "Night"] as const).map((sl) => {
                            const active = slot === sl;
                            return (
                              <button
                                key={sl}
                                type="button"
                                onClick={() => setSlot(sl)}
                                style={{
                                  flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                                  border: `1px solid ${active ? gold : cBr}`,
                                  background: active ? "rgba(201,168,76,0.15)" : "transparent",
                                  color: active ? gold : C.textS, textAlign: "left",
                                }}
                              >
                                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.8 }}><><Icon name={sl === "Day" ? "sun" : "moon"} size={13} style={{ marginRight: 5 }} />{sl === "Day" ? "DAY" : "NIGHT"}</></div>
                                <div style={{ fontSize: 11.5, marginTop: 2, opacity: 0.8 }}>{SLOTS[sl].hours}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: mob ? "1fr" : "1fr 1fr",
                      gap: 14,
                      marginBottom: 24,
                    }}
                  >
                    {/* GUESTS */}
                    <div
                      style={{
                        border: `1px solid ${cBr}`,
                        borderRadius: 10,
                        padding: "16px 18px",
                        background: isDark
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.02)",
                      }}
                    >
                      <p
                        id="booknow-guests-label"
                        style={{
                          color: gold,
                          fontSize: 11.5,
                          letterSpacing: 2,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        NUMBER OF GUESTS
                      </p>

                      <p
                        style={{
                          color: C.textS,
                          fontSize: 12.5,
                          marginBottom: 14,
                          opacity: 0.75,
                        }}
                      >
                        How many people will attend?
                      </p>

                      <div
                        role="group"
                        aria-labelledby="booknow-guests-label"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <button
                          onClick={() => setGuests((g) => clamp(g - 1, GUESTS_MIN, GUESTS_MAX))}
                          disabled={guests <= GUESTS_MIN || guestsLocked}
                          aria-label="Fewer guests"
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 8,
                            background: "transparent",
                            border: `1px solid ${cBr}`,
                            color: C.textS,
                            cursor: "pointer",
                            fontSize: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "0.2s",
                          }}
                        >
                          −
                        </button>

                        <span
                          style={{
                            color: C.textH,
                            fontSize: 26,
                            fontWeight: 700,
                            minWidth: 100,
                            textAlign: "center",
                            lineHeight: 1.2,
                          }}
                        >
                          {guests}
                        </span>

                        <button
                          onClick={() => setGuests((g) => clamp(g + 1, GUESTS_MIN, GUESTS_MAX))}
                          disabled={guests >= GUESTS_MAX || guestsLocked}
                          aria-label="More guests"
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 8,
                            background: "transparent",
                            border: `1px solid ${cBr}`,
                            color: C.textS,
                            cursor: "pointer",
                            fontSize: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "0.2s",
                          }}
                        >
                          +
                        </button>
                      </div>

                      {guestsLocked && (
                        <p style={{ color: gold, fontSize: 12.5, marginTop: 12 }}>
                          🔒 Exclusive buyout — fixed at {RESORT_MAX_CAPACITY} guests, {fmt(tourBase)} flat{slotCount === 2 ? " for the whole day" : ""} regardless of how many actually attend.
                        </p>
                      )}
                      {!guestsLocked && guests >= GUESTS_MAX && (
                        <p style={{ color: "#e55", fontSize: 12.5, marginTop: 6 }}>
                          Maximum {GUESTS_MAX} guests per booking — please call us for larger groups.
                        </p>
                      )}
                      {resource === "Venue" || slot === "WholeDay" ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "5px 10px", borderRadius: 20, background: "rgba(201,168,76,0.15)", border: `1px solid ${gold}66` }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, color: gold }}>{resource === "Venue" ? "🔒 EXCLUSIVE — VENUE RENTAL" : "🔒 EXCLUSIVE — WHOLE DAY"}</span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 14 }}>
                          <p style={{ color: C.textS, fontSize: 11.5, letterSpacing: 1.5, marginBottom: 8 }}>
                            SHARED OR EXCLUSIVE?
                          </p>
                          <div style={{ display: "flex", gap: 8 }}>
                            {(["Shared", "Exclusive"] as const).map((opt) => {
                              const active = tier === opt;
                              const isDefault = tierChoice === null && opt === getPackageTier(guests);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setTierChoice(opt)}
                                  style={{
                                    flex: 1,
                                    padding: "8px 6px",
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    letterSpacing: 0.8,
                                    // Selected is gold, for both options. This used to fork
                                    // on the option — gold for Exclusive, #4caf50 for Shared —
                                    // so "chosen" had two encodings in one control and could
                                    // not be learned. It now matches the Day/Night control
                                    // above (see the sibling segmented control in step 1) and
                                    // the selected date in BookingDatePicker, which is also
                                    // gold. It additionally returns #4caf50 to the single
                                    // meaning it carries everywhere else in this file:
                                    // validation success ("Valid", "Valid email") and
                                    // availability — never selection.
                                    border: `1px solid ${active ? gold : cBr}`,
                                    background: active ? "rgba(201,168,76,0.15)" : "transparent",
                                    color: active ? gold : C.textS,
                                  }}
                                >
                                  <><Icon name={opt === "Exclusive" ? "lock" : "handshake"} size={12} style={{ marginRight: 5 }} />{opt === "Exclusive" ? "EXCLUSIVE" : "SHARED"}</>
                                  {isDefault ? " (SUGGESTED)" : ""}
                                </button>
                              );
                            })}
                          </div>
                          <p style={{ color: C.textS, fontSize: 11.5, marginTop: 6, opacity: 0.75, lineHeight: 1.5 }}>
                            {tier === "Exclusive"
                              ? `Whole-pool buyout, fixed at ${RESORT_MAX_CAPACITY} guests — no other group in your ${SLOTS[slot].label}. 5% off the flat rate.`
                              : `Pool shared with other groups in your ${SLOTS[slot].label} — billed per guest, up to ${RESORT_MAX_CAPACITY} guests in total.`}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* TIMES & HOUSE RULES — overtime is no longer sold online.
                        Staff add it at the resort (₱500/hr, max 2 hrs after
                        5 PM) only when the Night slot is free, since 5–7 PM
                        is cleaning time before the Night group. */}
                    <div
                      style={{
                        border: `1px solid ${cBr}`,
                        borderRadius: 10,
                        padding: "16px 18px",
                        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                      }}
                    >
                      <p style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 8 }}>
                        YOUR TIME
                      </p>
                      <p style={{ color: C.textH, fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
                        {SLOTS[slot].label} · {SLOTS[slot].hours}
                      </p>
                      <p style={{ color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
                        {slot === "Day"
                          ? `Want to stay a little later? Up to ${OVERTIME_MAX} hrs of overtime (${fmt(OVERTIME_RATE)}/hr) can be arranged at the resort when no Night group is booked — ${TURNOVER_WINDOW} is otherwise cleaning time.`
                          : slot === "Night"
                          ? `Ends at ${SLOTS.Night.end} sharp. ${QUIET_HOURS_POLICY}`
                          : `The resort is yours all day and night — no turnover in between. ${QUIET_HOURS_POLICY}`}
                      </p>
                    </div>
                  </div>
                  )}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setStep(1)}
                      style={{
                        ...outBtn,
                        flex: 1,
                        padding: "12px 10px",
                        borderRadius: 6,
                      }}
                    >
                      BACK
                    </button>

                    <button
                      disabled={!date || !dateOk}
                      // Step 4 only holds the room picker now, so skip it when
                      // there is no room to pick (venue-only, or a package
                      // that doesn't include one).
                      onClick={() => setStep(showRoomPicker ? 4 : 5)}
                      style={{
                        ...goldBtn,
                        flex: 2,
                        borderRadius: 6,
                        opacity: !date || !dateOk ? 0.4 : 1,
                      }}
                    >
                      CONTINUE →
                    </button>
                  </div>
                </div>
              )}

            {/* STEP 4 – Rooms (optional add-on, or the package's required room) */}
            {step === 4 && (
              <div>
                {showRoomPicker && (
                <>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>
                  {requiresRoom ? "Choose Your Room" : "Add a Room?"} <span style={{ color: C.textB, fontSize: 15, fontWeight: 700 }}>{requiresRoom ? "(Required)" : "(Optional)"}</span>
                </h3>
                <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 20, lineHeight: 1.7 }}>
                  {requiresRoom
                    ? `Pick the one room included with this package — ${Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}% off its normal rate.`
                    : "Rooms are rented separately from the pool. Optional add-on."}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                  {bookableRooms.length === 0 && (
                    <p style={{ color: C.textS, fontSize: 13.5 }}>No rooms are currently available — please check back later or call us.</p>
                  )}
                  {bookableRooms.map((r) => {
                    const sel = selRooms.includes(r.id);
                    const taken = takenRooms.has(r.id);
                    const discountedPrice = requiresRoom ? Math.round(r.price * (1 - ROOM_BUNDLE_DISCOUNT_PCT)) : r.price;
                    return (
                      <div key={r.id} onClick={() => { if (!taken || sel) toggleRoom(r.id); }} aria-disabled={taken && !sel} style={{ opacity: taken && !sel ? 0.45 : 1, pointerEvents: taken && !sel ? "none" : "auto", background: sel ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)") : C.bgCard2, border: `1px solid ${sel ? gold : C.border}`, borderRadius: 10, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "all .2s" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" decoding="async" src={r.img} alt={r.name} style={{ width: 72, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: C.textH, fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
                          <div style={{ color: C.textS, fontSize: 13.5 }}>🛏 {r.beds} · 👥 Up to {r.capacity}</div>
                          {taken && <div style={{ color: "#e55", fontSize: 12.5, marginTop: 2 }}>Already booked on {fmtDate(date)}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {requiresRoom && <div style={{ color: C.textXS, fontSize: 12.5, textDecoration: "line-through" }}>{fmt(r.price)}</div>}
                          <div style={{ color: gold, fontWeight: 700, fontSize: 16 }}>{fmt(discountedPrice)}</div>
                          <div style={{ marginTop: 6, width: 22, height: 22, borderRadius: requiresRoom ? 6 : "50%", border: `2px solid ${sel ? gold : C.border}`, background: sel ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, color: sel ? "#000" : "transparent", marginLeft: "auto" }}>✓</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!roomsFree && (
                  <p style={{ color: "#e55", fontSize: 13.5, marginTop: -16, marginBottom: 20 }}>⚠ A room you picked is already booked on this date — please unselect it.</p>
                )}
                {requiresRoom && selRooms.length === 0 && (
                  <p style={{ color: "#e55", fontSize: 13.5, marginTop: -16, marginBottom: 20 }}>⚠ Please pick a room to continue.</p>
                )}
                </>
                )}

                {venueFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ color: C.textS, fontSize: 13.5 }}>Event Venue Rental</span>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 14.5 }}>{fmt(venueFee)}</span>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(3)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                  <button
                    disabled={(requiresRoom && selRooms.length === 0) || !roomsFree}
                    onClick={() => setStep(5)}
                    style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: (requiresRoom && selRooms.length === 0) || !roomsFree ? 0.4 : 1 }}
                  >
                    CONTINUE →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5 – Guest Info */}
            {step === 5 && (
              <div>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 20, fontWeight: 400 }}>Your Information</h3>
                {/* Notes spans the pair above it, so the three short fields
                    stay side by side and the free-text box gets the full
                    width it actually needs. */}
                <div className="mb-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="bn-name" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">FULL NAME</Label>
                    <div style={{ position: "relative" }}>
                      <Input
                        id="bn-name"
                        type="text"
                        value={form.name}
                        onChange={(e) => handleName(e.target.value)}
                        maxLength={NAME_MAX}
                        placeholder="Juan Dela Cruz"
                        autoComplete="name"
                        aria-invalid={Boolean(form.name) && !isValidName(form.name)}
                        className="pr-14"
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, color: form.name.length >= NAME_MAX ? "#e55" : C.textS, fontWeight: 700, fontFamily: "monospace" }}>
                        {form.name.length}/{NAME_MAX}
                      </span>
                    </div>
                    {form.name && !isValidName(form.name) && (
                      <p style={{ color: "#e55", fontSize: 12.5, marginTop: 4 }}>⚠ Please enter your full name (letters only)</p>
                    )}
                    {form.name && isValidName(form.name) && (
                      <p style={{ color: "#4caf50", fontSize: 12.5, marginTop: 4 }}>✓ Valid</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="bn-email" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">EMAIL ADDRESS</Label>
                    <Input
                      id="bn-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setF("email", e.target.value)}
                      placeholder="example@email.com"
                      autoComplete="email"
                      aria-invalid={Boolean(form.email) && !isValidEmail(form.email)}
                    />
                    {form.email && !isValidEmail(form.email) && (
                      <p style={{ color: "#e55", fontSize: 12.5, marginTop: 4 }}>⚠ Please enter a valid email address</p>
                    )}
                    {form.email && isValidEmail(form.email) && (
                      <p style={{ color: "#4caf50", fontSize: 12.5, marginTop: 4 }}>✓ Valid email</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="bn-contact" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">CONTACT NUMBER</Label>
                    <div style={{ position: "relative" }}>
                      <Input
                        id="bn-contact"
                        type="tel"
                        value={form.contact}
                        onChange={(e) => handleContact(e.target.value)}
                        maxLength={11}
                        placeholder="09XXXXXXXXX"
                        autoComplete="tel"
                        aria-invalid={form.contact.length === 11 && !isValidPHNumber(form.contact)}
                        className="pr-14"
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, color: form.contact.length === 11 ? "#4caf50" : form.contact.length > 0 ? "#f5c518" : C.textS, fontWeight: 700, fontFamily: "monospace" }}>{form.contact.length}/11</span>
                    </div>
                    {form.contact.length > 0 && form.contact.length < 11 && <p style={{ color: "#f5c518", fontSize: 12.5, marginTop: 4 }}>⚠ Must be 11 digits</p>}
                    {form.contact.length === 11 && !isValidPHNumber(form.contact) && <p style={{ color: "#e55", fontSize: 12.5, marginTop: 4 }}>⚠ Must start with 09</p>}
                    {isValidPHNumber(form.contact) && <p style={{ color: "#4caf50", fontSize: 12.5, marginTop: 4 }}>✓ Valid</p>}
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="bn-notes" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">SPECIAL NOTES (OPTIONAL)</Label>
                    <Textarea
                      id="bn-notes"
                      value={form.notes}
                      onChange={(e) => handleNotes(e.target.value)}
                      maxLength={NOTES_MAX}
                      rows={3}
                      placeholder="Anything we should know? (optional)"
                      className="min-h-[88px] resize-none"
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      <span style={{ color: form.notes.length >= NOTES_MAX ? "#e55" : C.textXS, fontSize: 11.5, fontFamily: "monospace" }}>
                        {form.notes.length}/{NOTES_MAX}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Summary — an itemized liquidation rather than one lump
                    total, so a guest can see exactly what each peso is for
                    before paying. */}
                <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
                  <p style={{ color: C.textS, fontSize: 10.5, letterSpacing: 2, marginBottom: 12 }}>BOOKING DETAILS</p>
                  {[["Date", fmtDate(date)], ["Guests", `${guests} pax`], ["Package", packageLabel], ["Tier", tier]].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.textS, fontSize: 13.5 }}>{l}</span>
                      <span style={{ color: C.textH, fontSize: 13.5, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}

                  <p style={{ color: C.textS, fontSize: 10.5, letterSpacing: 2, marginTop: 16, marginBottom: 10 }}>PRICE BREAKDOWN</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {priceLines.map((l) => (
                      <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ color: l.discount ? "#4caf50" : C.textS, fontSize: 13.5 }}>{l.label}</span>
                        <span style={{ color: l.discount ? "#4caf50" : C.textB, fontSize: 13.5, whiteSpace: "nowrap" }}>
                          {l.strike !== undefined && (
                            <span style={{ textDecoration: "line-through", color: C.textS, marginRight: 6 }}>{fmt(l.strike)}</span>
                          )}
                          {l.discount ? "-" : ""}{fmt(l.amount)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 14.5 }}>Total</span>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 14.5 }}>{fmt(total)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ color: C.textS, fontSize: 13.5 }}>50% Down payment (due now)</span>
                    <span style={{ color: "#ff9800", fontWeight: 700, fontSize: 13.5 }}>{fmt(down)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: C.textS, fontSize: 13.5 }}>Remaining balance (due on visit)</span>
                    <span style={{ color: C.textB, fontSize: 13.5, fontWeight: 600 }}>{fmt(total - down)}</span>
                  </div>
                </div>
                {!dateOk && (
                  <p style={{ color: "#e55", fontSize: 13.5, marginBottom: 10 }}>
                    ⚠ {describeDateProblem(date) ?? "That date is no longer available — please pick another."}
                  </p>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(showRoomPicker ? 4 : 3)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                  <button
                    // dateOk is re-checked here as well as at step 2: the guest may
                    // have sat on this screen past midnight, or the date may have
                    // been taken in the meantime.
                    disabled={!!validateBookingForm(form) || !dateOk || !roomsFree}
                    onClick={() => setShowGcashWarning(true)}
                    style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: validateBookingForm(form) || !dateOk || !roomsFree ? 0.4 : 1 }}
                  >
                    PROCEED TO GCASH →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6 – GCash QR */}
            {step === 6 && (
              <div style={{ position: "relative" }}>
                {qrExpired && (
                  <div style={{ position: "absolute", inset: 0, background: isDark ? "rgba(6,5,4,0.96)" : "rgba(250,247,242,0.97)", zIndex: 10, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 28 }}>⏱</div>
                    <h3 style={{ color: "#e55", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>QR Code Expired</h3>
                    <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.8, marginBottom: 28, maxWidth: 320 }}>Your payment window has expired. Please go back and try again.</p>
                    <button onClick={() => { setQrExpired(false); setQrRetryKey((k) => k + 1); }} style={{ ...goldBtn, padding: "13px 32px", letterSpacing: 2, borderRadius: 6 }}>TRY AGAIN</button>
                  </div>
                )}
                {/* GCash header */}
                <div style={{ background: "linear-gradient(135deg,#00a952,#007a3d)", borderRadius: "8px 8px 0 0", marginTop: mob ? -20 : -40, marginLeft: mob ? -16 : -40, marginRight: mob ? -16 : -40, marginBottom: 0, padding: mob ? "18px 20px" : "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>G</span></div>
                    <div><div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>GCash Payment</div><div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5 }}>Scan to pay with GCash app</div></div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
                    <div style={{ color: qrSeconds <= 60 ? "#ff6b6b" : "rgba(255,255,255,0.7)", fontSize: 10.5, letterSpacing: 2, marginBottom: 2 }}>EXPIRES IN</div>
                    <div style={{ color: qrSeconds <= 60 ? "#ff6b6b" : "#fff", fontSize: mob ? 18 : 22, fontWeight: 700, fontFamily: "monospace", letterSpacing: 2 }}>{fmtTimer(qrSeconds)}</div>
                  </div>
                </div>
                <div style={{ padding: mob ? "24px 0 0" : "32px 0 0", display: "flex", flexDirection: mob ? "column" : "row", gap: mob ? 24 : 32, alignItems: "flex-start" }}>
                  {/* QR */}
                  <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: mob ? "100%" : "auto" }}>
                    {/* Real QR from PayMongo — unique to this payment intent.
                        Never render a placeholder here: a decorative QR that
                        cannot be paid is worse than an honest spinner. */}
                    <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 8px 32px rgba(0,169,82,0.15),0 2px 8px rgba(0,0,0,0.1)", border: "2px solid rgba(0,169,82,0.15)", width: mob ? 232 : 252, height: mob ? 232 : 252, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {qrLoading && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ width: 34, height: 34, border: "3px solid rgba(0,169,82,0.18)", borderTopColor: "#00a952", borderRadius: "50%", margin: "0 auto 12px", animation: "sw-spin .8s linear infinite" }} />
                          <div style={{ color: "#666", fontSize: 12.5 }}>Generating your QR…</div>
                        </div>
                      )}
                      {!qrLoading && qrError && (
                        <div style={{ textAlign: "center", padding: 12 }}>
                          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                          <div style={{ color: "#c0392b", fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>{qrError}</div>
                          <button onClick={() => setQrRetryKey((k) => k + 1)} style={{ background: "#00a952", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12.5, cursor: "pointer", letterSpacing: 1 }}>RETRY</button>
                        </div>
                      )}
                      {!qrLoading && !qrError && qrData && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          loading="lazy" decoding="async"
                          src={qrData.qrImageUrl}
                          alt="GCash QRPh payment code"
                          width={mob ? 200 : 220}
                          height={mob ? 200 : 220}
                          style={{ display: "block", width: mob ? 200 : 220, height: mob ? 200 : 220, imageRendering: "pixelated", opacity: paid ? 0.25 : 1, transition: "opacity .3s ease" }}
                        />
                      )}
                    </div>
                    <div style={{ background: isDark ? "rgba(0,169,82,0.08)" : "rgba(0,169,82,0.06)", border: "1px solid rgba(0,169,82,0.2)", borderRadius: 8, padding: "8px 16px", textAlign: "center" }}>
                      <div style={{ color: "#00a952", fontSize: 11.5, fontWeight: 700, letterSpacing: 2, marginBottom: 2 }}>AMOUNT DUE (50% DOWN)</div>
                      <div style={{ color: isDark ? "#fff" : "#111", fontSize: mob ? 22 : 26, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>₱{(serverQuote?.down ?? down).toLocaleString()}</div>
                    </div>
                    <p style={{ color: C.textS, fontSize: 12.5, textAlign: "center", maxWidth: 220, lineHeight: 1.6 }}>Open your <strong style={{ color: isDark ? "#ccc" : "#333" }}>GCash app</strong> → tap <strong style={{ color: isDark ? "#ccc" : "#333" }}>Scan QR</strong> → point your camera at the code above</p>
                  </div>
                  {/* Order summary */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.textS, fontSize: 10.5, letterSpacing: 3, marginBottom: 14 }}>ORDER SUMMARY</div>
                    <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                      {[["Ref ID", "Issued after payment"], ["Guest", form.name], ["Date", date], ["Package", packageLabel]].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                          <span style={{ color: C.textS, fontSize: 12.5 }}>{l}</span>
                          <span style={{ color: l === "Ref ID" ? C.textS : C.textH, fontSize: 12.5, fontWeight: 500, fontStyle: l === "Ref ID" ? "italic" : "normal" }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                        <span style={{ color: C.textS, fontSize: 12.5 }}>Guests</span>
                        <span style={{ color: C.textH, fontSize: 12.5 }}>{guests} pax{overtime > 0 ? ` · +${overtime}hr OT` : ""}</span>
                      </div>
                      <div style={{ padding: "12px 14px", background: isDark ? "#0d0c09" : "#ece6db" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: C.textS, fontSize: 12.5 }}>Full Total</span><span style={{ color: C.textH, fontSize: 12.5, fontWeight: 600 }}>{fmt(serverQuote?.total ?? total)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#00a952", fontSize: 13.5, fontWeight: 700 }}>50% Down Due Now</span><span style={{ color: "#00a952", fontSize: 15, fontWeight: 700 }}>{fmt(serverQuote?.down ?? down)}</span></div>
                      </div>
                    </div>
                    <div style={{ background: "rgba(229,85,85,0.05)", border: "1px solid rgba(229,85,85,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 14.5, flexShrink: 0 }}>⚠️</span>
                      <span style={{ color: C.textS, fontSize: 12.5, lineHeight: 1.7 }}>Do not close this page while paying. QR expires in <strong style={{ color: qrSeconds <= 60 ? "#e55" : gold }}>{fmtTimer(qrSeconds)}</strong>.</span>
                    </div>
                    {/* "I've completed payment" → shows confirm modal */}
                    {/* Live status. There is deliberately no "I've paid"
                        button any more — the old one recorded the booking as
                        Paid on the guest's say-so, whether or not any money
                        had moved. Confirmation now comes from PayMongo. */}
                    {paid ? (
                      <div style={{ background: "rgba(0,169,82,0.10)", border: "1px solid rgba(0,169,82,0.35)", borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>✅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#00a952", fontSize: 14.5, fontWeight: 700 }}>Payment received</div>
                          {!saveError && <div style={{ color: C.textS, fontSize: 12.5 }}>Saving your booking…</div>}
                          {saveError && (
                            <>
                              <div style={{ color: "#e55", fontSize: 12.5, lineHeight: 1.6, margin: "4px 0 8px" }}>
                                {saveError} Your payment is safe — retrying can't charge you twice.
                                If this keeps failing, contact us and quote payment ref <span style={{ fontFamily: "monospace" }}>{qrData?.paymentIntentId}</span>.
                              </div>
                              <button onClick={() => void confirmOnline()} disabled={saving} style={{ background: "#00a952", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12.5, cursor: saving ? "wait" : "pointer", letterSpacing: 1, opacity: saving ? 0.6 : 1 }}>
                                {saving ? "SAVING…" : "RETRY SAVING"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 16, height: 16, border: "2px solid rgba(0,169,82,0.25)", borderTopColor: "#00a952", borderRadius: "50%", flexShrink: 0, animation: "sw-spin .8s linear infinite" }} />
                        <div>
                          <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600 }}>Waiting for your payment…</div>
                          <div style={{ color: C.textS, fontSize: 12.5 }}>This page updates by itself once GCash confirms.</div>
                        </div>
                      </div>
                    )}

                    {/* Test mode only. PayMongo hands back a test_url that
                        simulates a scan — it is absent with live keys, so this
                        link cannot appear in production. */}
                    {qrData?.testUrl && !paid && (
                      <a
                        href={qrData.testUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "block", marginTop: 10, textAlign: "center", color: gold, fontSize: 12.5, letterSpacing: 1, textDecoration: "underline" }}
                      >
                        ⚡ TEST MODE — simulate a successful payment
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7 – Online Done.
                This page stays put. It used to bounce the guest to the home
                page on an 18s timer, which took the reference ID off screen
                while they were still photographing it — and on a phone,
                opening the camera backgrounds the tab, so the timer could
                fire before they ever got the shot. They leave when they are
                ready, via the button below or the nav. */}
            {step === 7 && (
              <div style={{ padding: "8px 0", textAlign: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(0,169,82,0.1)", border: "1px solid rgba(0,169,82,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
                <h3 style={{ color: C.textH, fontSize: 24, fontWeight: 400, marginBottom: 10, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>Booking Submitted!</h3>
                <p style={{ color: C.textS, fontSize: 15, marginBottom: 24 }}>Your down payment of <strong style={{ color: C.textH }}>{fmt(serverQuote?.down ?? down)}</strong> was received. Status: <span style={{ color: "#f5c518", fontWeight: 600 }}>Paid</span> — awaiting the resort's confirmation.</p>

                {/* Reference ID — prominent at top */}
                <div style={{ background: isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.06)", border: `1px solid ${gold}55`, borderRadius: 12, padding: "20px 24px", marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <p style={{ color: C.textS, fontSize: 11.5, letterSpacing: 3, margin: 0 }}>YOUR REFERENCE ID</p>
                  <p style={{ color: gold, fontFamily: "monospace", fontSize: 28, fontWeight: 700, letterSpacing: 3, margin: 0 }}>{bookingId}</p>
                  <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>Screenshot this — you&apos;ll need it for follow-ups and to cancel.</p>
                </div>

                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20, textAlign: "left" }}>
                  <div style={{ background: isDark ? "#0f0e0b" : "#f5f0e8", padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.textS, fontSize: 13.5, fontWeight: 600 }}>What Happens Next</span></div>
                  <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {[["1", "Your GCash payment was verified automatically — no screenshot needed."], ["2", "The resort reviews and confirms your reservation within 24 hours."], ["3", `A confirmation email is sent to ${form.email} once approved.`]].map(([n, txt]) => (
                      <div key={n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${gold}22`, border: `1px solid ${gold}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: gold, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{n}</div>
                        <span style={{ color: C.textB, fontSize: 14.5, lineHeight: 1.6 }}>{txt}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p style={{ color: C.textS, fontSize: 13.5, marginBottom: 20 }}>⚠ No refunds. The remaining balance of {fmt((serverQuote?.total ?? total) - (serverQuote?.down ?? down))} is paid at the resort.</p>
                <button
                  onClick={() => onGoHome?.()}
                  style={{ ...goldBtn, padding: "13px 32px", letterSpacing: 2, borderRadius: 6 }}
                >
                  BACK TO HOME
                </button>
              </div>
            )}

          </div>
        </div>

        {/* ── MODAL: GCash payment policy (Step 5 → 6) ──
            Landscape: the four policy points sit in a 2x2 grid rather than a
            420px column, so the whole policy is readable without scrolling
            and the acknowledgement is visible at the same time as the terms
            it refers to. Radix owns the portal, focus trap and scroll lock,
            which is what createPortal and portalReady were doing by hand.

            Escape and the backdrop both route through onOpenChange, so every
            way out resets `policyChecked` -- dismissing the dialog and coming
            back must not leave the box still ticked from last time. */}
        <Dialog
          open={showGcashWarning}
          onOpenChange={(open) => { if (!open) { setShowGcashWarning(false); setPolicyChecked(false); } }}
        >
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(46rem,calc(100%-2rem))]">
            <DialogHeader>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(76,175,80,0.1)", border: "2px solid rgba(76,175,80,0.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4, fontSize: 28 }}>
                ⚠️
              </div>
              <DialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 400 }}>
                Before You Proceed
              </DialogTitle>
              <DialogDescription style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
                Please read and understand the following payment policy before continuing to the GCash payment step.
              </DialogDescription>
            </DialogHeader>

            {/* Policy box — green highlighted */}
            <div style={{ background: "rgba(76,175,80,0.07)", border: "1.5px solid rgba(76,175,80,0.4)", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <span style={{ color: "#4caf50", fontSize: 13.5, fontWeight: 700, letterSpacing: 1.5 }}>PAYMENT POLICY</span>
              </div>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#4caf50", fontSize: 15, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>❌</span>
                  <span style={{ color: C.textH, fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>
                    No Refunds — All payments are non-refundable once submitted.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#4caf50", fontSize: 15, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>💰</span>
                  <span style={{ color: C.textH, fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>
                    50% Down Payment — Only half the total is required now. The remaining balance is due on the day of your visit.
                  </span>
                </div>
                <div className="sm:col-span-2" style={{ height: 1, background: "rgba(76,175,80,0.2)", marginTop: 4 }} />
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#4caf50", fontSize: 13.5, flexShrink: 0, marginTop: 2 }}>📅</span>
                  <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                    Rescheduling is subject to availability and must be discussed with the admin directly.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#4caf50", fontSize: 13.5, flexShrink: 0, marginTop: 2 }}>🔇</span>
                  <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                    {QUIET_HOURS_POLICY} The resort is in a residential village.
                  </span>
                </div>
              </div>
            </div>

            {/* Acknowledgement. A real <Label htmlFor> rather than an onClick
                div: the whole sentence becomes the checkbox's hit area AND its
                accessible name, and the space bar now toggles it. */}
            <Label
              htmlFor="gcash-policy-ack"
              style={{ display: "flex", alignItems: "flex-start", gap: 12, background: policyChecked ? "rgba(76,175,80,0.06)" : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1.5px solid ${policyChecked ? "rgba(76,175,80,0.5)" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, padding: "12px 14px", cursor: "pointer", transition: "all .2s", userSelect: "none" }}
            >
              <Checkbox
                id="gcash-policy-ack"
                checked={policyChecked}
                onCheckedChange={(v) => setPolicyChecked(v === true)}
                className="mt-0.5 size-5 border-2 data-[state=checked]:border-[#4caf50] data-[state=checked]:bg-[#4caf50] data-[state=checked]:text-white"
              />
              <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, fontWeight: 400, letterSpacing: 0 }}>
                I have read and understood the payment policy. I agree that <strong style={{ color: C.textH }}>all payments are non-refundable</strong> and that a <strong style={{ color: C.textH }}>50% down payment</strong> is required to confirm my booking.
              </span>
            </Label>

            <Separator />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setShowGcashWarning(false); setPolicyChecked(false); }}
                style={{ color: C.textS, borderColor: C.border, letterSpacing: 1, fontSize: 12.5 }}
              >
                CANCEL
              </Button>
              <Button
                disabled={!policyChecked}
                onClick={() => { setShowGcashWarning(false); setPolicyChecked(false); setStep(6); }}
                style={{ background: policyChecked ? "rgba(76,175,80,0.12)" : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", color: policyChecked ? "#4caf50" : C.textS, border: `1px solid ${policyChecked ? "rgba(76,175,80,0.35)" : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.5 }}
              >
                ✓ YES, I UNDERSTAND
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    );
  }
