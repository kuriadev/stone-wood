  "use client";

  import { useState, useEffect, useRef } from "react";
  import { useTheme } from "@/contexts/ThemeContext";
  import { useWidth } from "@/hooks/useWidth";
  import { useToast } from "@/contexts/ToastContext";
  import { T } from "@/lib/theme";
  import { gold, goldBtn, outBtn } from "@/lib/styles";
  import { fmt, fmtTimer, fmtDate, getPackageTier, checkBookingAvailability, getSharedPoolUsage, isRoomOpen, roomsTakenOn } from "@/lib/utils";
  import { roomShots } from "@/lib/gallery";
  import { EventPackages } from "@/components/booking/EventPackages";
  import type { ResortPackage } from "@/types/package";
  import { MediaGallery } from "@/components/common/MediaGallery";
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
  import { Input } from "@/components/ui/input";
  import { Textarea } from "@/components/ui/textarea";
  import { Badge } from "@/components/ui/badge";

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
    /** Set by the home page's reservation card, which now collects the slot
     *  and the guest count alongside the date. A package still wins: its
     *  slotMode and capacity are fixed by the package itself. */
    initialSlot?: BookingSlot;
    initialGuests?: number;
    /** Present only when arriving from a Home page package card. A package
     *  is a fixed, one-time purchase — its price and guest capacity are not
     *  negotiable, so when this is set the whole guest/room/overtime/tier
     *  picker UI is hidden and the guest only picks a date. */
    initialPackage?: PackageDeepLink;
    /** Event packages offered in step 1, so they can be booked without
     *  leaving for the Packages page. Empty or omitted hides the section. */
    eventPackages?: ResortPackage[];
    /** Called when a guest picks one. The page deep-links it exactly as the
     *  Packages page does, so no pricing rule lives in this component. */
    onBookEventPackage?: (pkg: ResortPackage) => void;
    /** Drops the deep-linked package and returns to a plain booking. Step 1
     *  is the generic visit chooser, which does not govern a package, so
     *  "back" from the date step has to mean "leave this package". */
    onClearPackage?: () => void;
  }

  export function BookNow({
    bookings, onBooked, rooms, closedDates,
    facilities = [],
    preselectedRoom, clearPreselected,
    preselectedDate, clearPreselectedDate,
    onGoHome,
    initialResource,
    initialSlot,
    initialGuests, initialTier, initialPackage,
    eventPackages = [],
    onBookEventPackage,
    onClearPackage,
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
    const [slot, setSlot] = useState<BookingSlot>(initialPackage?.slotMode === "WholeDay" ? "WholeDay" : (initialSlot ?? "Day"));
    const [step, setStep] = useState(initialResource ? 3 : 1);
    const [date, setDate] = useState(preselectedDate || "");
    const [guests, setGuests] = useState(initialPackage?.capacity ?? initialGuests ?? 10);
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
    // Paid online bookings are confirmed at once; only one the server
    // flagged (the date taken while paying, say) waits for the resort.
    const [confirmedNow, setConfirmedNow] = useState(true);
    // Pay the 50% deposit (the default) or the whole total now.
    const [payFull, setPayFull] = useState(false);
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
    const [serverQuote, setServerQuote] = useState<{ total: number; down: number; dueNow: number; payFull: boolean } | null>(null);
    // Saving the booking after payment: in progress, or failed with a message.
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Held in a ref so the teardown below can void whatever intent is live
    // without the effect having to re-run every time qrData changes.
    const activeIntentRef = useRef<string | null>(null);

    // Modal states
    const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
    const [showGcashWarning, setShowGcashWarning] = useState(false);
    const [showCancelPay, setShowCancelPay] = useState(false);
    const [roomPhoto, setRoomPhoto] = useState<Room | null>(null);
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
      payFull,
    };
    // What the QR charges and what is left for arrival. Once the QR exists
    // the server's figures win, so the screen always matches the QR.
    const dueNow = serverQuote?.dueNow ?? (payFull ? total : down);
    const fullTotal = serverQuote?.total ?? total;
    const paidInFull = serverQuote?.payFull ?? payFull;
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
      // The last QR's figures go too: the guest may have switched between
      // the deposit and paying in full since then.
      setServerQuote(null);
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
        setConfirmedNow(json.booking.status === "Confirmed");
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

    /* Valid fields tint rather than announce. Kept subtle on purpose: it is
       confirmation, not an alert, and it sits behind the text the guest is
       still reading back. */
    const okField = (ok: boolean): React.CSSProperties =>
      ok
        ? { borderColor: "rgba(110,192,113,0.55)", background: "rgba(76,175,80,0.07)" }
        : {};
    const cBr = isDark ? "#2a2520" : "#d6cfc4";

    // The internal step numbers are historical (there is no step 2), so the
    // guest-facing progress runs off this index rather than off `step`.
    const labels = ["VISIT", "DATE", "ROOM", "CONTACT", "PAYMENT", "DONE"];
    const stepIdx: Record<number, number> = { 1: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
    const currentIdx = stepIdx[step] ?? 0;
    const pct = ((currentIdx + 1) / labels.length) * 100;

    /* The inverse of stepIdx: which internal step each label goes back to. */
    const stepOf = [1, 3, 4, 5, 6, 7];

    /* Only a step the guest has already completed can be clicked, and only
       while the booking is still open:
         - DONE is terminal. The reservation is saved and paid; sending anyone
           back into the payment screen from here would be meaningless at best.
         - ROOM is skipped for a venue-only booking or a package with no room,
           so it is never a place to return to in those flows.
       Everything ahead of the guest stays inert -- the bar reports progress,
       it does not let anyone skip validation to reach payment. */
    const canJumpTo = (i: number) =>
      step !== 7 && i < currentIdx && !(i === 2 && !showRoomPicker);

    /* Every step opens the same way: a gold eyebrow, a serif question, and an
       optional quiet note on the right. Written once as a function (not a
       nested component, which React would remount on every keystroke) so the
       six steps cannot drift apart. */
    const stepHead = (o: { eyebrow: string; title: string; note?: string; live?: boolean }) => (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: C.goldInk, letterSpacing: 2.2, fontSize: 11, margin: "0 0 8px", fontWeight: 700 }}>{o.eyebrow}</p>
          <h3 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 24 : 30, margin: 0, fontWeight: 400, lineHeight: 1.15 }}>{o.title}</h3>
        </div>
        {o.note && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: mob ? 0 : 24, color: o.live ? "#4caf50" : undefined }}>
            {o.live && <span className="sw-live-dot" aria-hidden="true" />}
            <span style={{ color: C.textS, fontSize: o.live ? 11 : 12.5, letterSpacing: o.live ? 1.3 : 0 }}>{o.note}</span>
          </div>
        )}
      </div>
    );

    /* The selectable tile used by the visit types, the venue choice and the
       pool-access choice: one border treatment, one selected treatment. */
    /* goldInk clears 4.5:1 on the page background, but the visit tiles are a
       shade lighter and 12px gold on them measures 4.32:1. Small gold text on
       a tile uses this darker step; the dark theme is unaffected. */
    const goldSmall = isDark ? C.goldInk : "#6f5718";

    const tileStyle = (selected: boolean): React.CSSProperties => ({
      background: selected ? `${gold}12` : C.bgCard2,
      border: `1px solid ${selected ? gold : C.border}`,
      borderRadius: 10,
      padding: mob ? "16px 16px" : "20px 20px",
      cursor: "pointer",
      textAlign: "left",
      width: "100%",
      display: "block",
      transition: "border-color .18s, background .18s",
    });

    /* The chosen-or-not circle on each room row. The gold border on the tile
       says "selected" only once you compare one row against another; a
       filled circle says it on the row itself. Decorative to a screen
       reader — the button's aria-pressed already carries the state. Matches
       tileStyle's `gold`, so the circle and the row agree. */
    const pickCircle = (on: boolean) => (
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
          border: `2px solid ${on ? gold : C.border}`,
          background: on ? gold : "transparent",
          color: "#1a1000",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "background .18s, border-color .18s",
        }}
      >
        {on && <Icon name="check" size={13} strokeWidth={3} />}
      </span>
    );

    /* BACK on the left, the forward action given the wider half: the primary
       action is the one the guest is most likely to want. */
    const navRow = (back: { label: string; onClick: () => void }, fwd: { label: string; onClick: () => void; disabled?: boolean }) => (
      <div style={{ display: "flex", gap: 12, marginTop: 28, flexDirection: mob ? "column-reverse" : "row" }}>
        {/* outBtn paints its label in the raw brand gold, which is a
            surface colour: on the light theme that is 2.29:1 against
            white. goldInk is the text-safe step of the same gold. */}
        <button className="sw-btn-out" onClick={back.onClick} style={{ ...outBtn, color: C.goldInk, flex: mob ? undefined : "1 1 0" }}>
          {back.label}
        </button>
        <button className="sw-btn"
          onClick={fwd.onClick}
          disabled={fwd.disabled}
          style={{ ...goldBtn, flex: mob ? undefined : "2 1 0", opacity: fwd.disabled ? 0.45 : 1, cursor: fwd.disabled ? "not-allowed" : "pointer" }}
        >
          {fwd.label} <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    );


    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "32px 16px" : "80px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <p style={{ color: C.goldInk, letterSpacing: 4, fontSize: 12.5, marginBottom: 8, textAlign: "center" }}>RESERVATIONS</p>
          <h2 style={{ fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 30 : 46, color: C.textH, textAlign: "center", marginBottom: 12, fontWeight: 400, lineHeight: 1.1 }}>Create Your Stay</h2>
          <p style={{ color: C.textS, fontSize: mob ? 14.5 : 16, textAlign: "center", margin: "0 0 12px" }}>
            A simple, secure booking in just a few steps.
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: mob ? 24 : 32 }}>
            <Icon name="clock" size={13} style={{ color: C.goldInk, opacity: 0.7, flexShrink: 0 }} />
            <span style={{ color: C.textS, fontSize: 14.5 }}>
              {SLOTS[slot].label}: <strong style={{ color: C.textB }}>{SLOTS[slot].hours}</strong>
            </span>
          </div>

          {/* Progress. One track rather than six nodes: the guest reads
              position from how far the fill has travelled, and the fill
              animates between steps instead of jumping. */}
          <div style={{ marginBottom: mob ? 28 : 40 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <span style={{ color: C.textS, fontSize: 11, letterSpacing: 1.8 }}>
                STEP {currentIdx + 1} OF {labels.length}
              </span>
              <span style={{ color: C.goldInk, fontSize: 11, letterSpacing: 1.8, fontWeight: 700 }}>
                {labels[currentIdx]}
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuenow={currentIdx + 1}
              aria-valuemin={1}
              aria-valuemax={labels.length}
              aria-valuetext={`Step ${currentIdx + 1} of ${labels.length}: ${labels[currentIdx]}`}
              style={{ height: 6, borderRadius: 999, background: isDark ? "#231e18" : "#e6e0d5", overflow: "visible" }}
            >
              <div
                className="sw-progress-fill transition-[width] duration-700 ease-out motion-reduce:transition-none"
                data-complete={step === 7 ? "true" : "false"}
                /* The gradient itself lives in globals.css so it can be
                   animated; the component only hands it the brand gold. */
                style={{ height: "100%", width: `${pct}%`, borderRadius: 999, ["--sw-gold" as string]: gold }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${labels.length},1fr)`, marginTop: 4 }}>
              {labels.map((label, i) => {
                const jump = canJumpTo(i);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!jump && i !== currentIdx}
                    onClick={() => jump && setStep(stepOf[i])}
                    aria-current={i === currentIdx ? "step" : undefined}
                    aria-label={jump ? `Go back to step ${i + 1}, ${label}` : undefined}
                    style={{
                      // 44px keeps the hit area at the HIG default even though
                      // the label itself is one short line.
                      minHeight: 44,
                      padding: "0 4px",
                      background: "transparent",
                      border: "none",
                      textAlign: "center",
                      // 11px is the HIG floor (typography.md > Ensuring
                      // legibility). It was 9.5 here, which put six labels back
                      // under the minimum on a phone.
                      fontSize: 11,
                      letterSpacing: mob ? 0 : 1.4,
                      // Done is stated brightly, the current step in gold and
                      // what is still ahead quietly, so the row reads as
                      // progress rather than as six equal tabs.
                      color: i < currentIdx ? C.textB : i === currentIdx ? C.goldInk : C.textS,
                      fontWeight: i <= currentIdx ? 700 : 500,
                      cursor: jump ? "pointer" : "default",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main card */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "44px 48px", boxShadow: C.shadow }}>

            {/* STEP 1 - Visit type.
                Picking a tile used to jump straight to the next step. It now
                selects, and CONTINUE advances: the guest can change their mind
                before committing, and the venue add-on below is part of the
                same decision rather than an afterthought they scroll past. */}
            {step === 1 && (
              <div>
                {stepHead({
                  eyebrow: "START WITH YOUR SCHEDULE",
                  title: "Choose your visit",
                  note: "LIVE AVAILABILITY CONNECTED",
                  live: true,
                })}
                <p style={{ color: C.textS, fontSize: 14.5, margin: "0 0 24px", lineHeight: 1.65, maxWidth: 560 }}>
                  Choose the time that works best for your group. You can still adjust the guest count and booking type in the next step.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
                  {([
                    { id: "Day", icon: "sun" },
                    { id: "Night", icon: "moon" },
                    { id: "WholeDay", icon: "clock" },
                  ] as const).map((opt) => {
                    const selected = slot === opt.id;
                    // Priced through priceBooking rather than written out, so
                    // these lines cannot drift from what the guest is charged.
                    const excl = opt.id === "WholeDay";
                    const price = excl
                      ? `Exclusive · ${fmt(priceBooking({ resource: "Pool", tier: "Exclusive", slot: opt.id, guests: 1, overtime: 0, roomPrices: [] }).total)}`
                      : `From ${fmt(SHARED_PER_HEAD_RATE)} per guest`;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => { setSlot(opt.id); if (opt.id === "WholeDay") setTierChoice("Exclusive"); }}
                        style={{ ...tileStyle(selected), padding: mob ? "20px 20px" : "24px 20px" }}
                      >
                        <span style={{ display: "block", marginBottom: 16, color: C.goldInk, lineHeight: 0 }}>
                          <Icon name={opt.icon as IconName} size={24} strokeWidth={1.5} />
                        </span>
                        <span style={{ display: "block", color: C.textH, fontSize: 19, fontFamily: "'Satoshi',system-ui,sans-serif", marginBottom: 8 }}>
                          {SLOTS[opt.id].label}
                        </span>
                        <span style={{ display: "block", color: C.textB, fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                          {SLOTS[opt.id].hours}
                        </span>
                        <span style={{ display: "block", color: goldSmall, fontSize: 12 }}>{price}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Events venue. Stated as two named choices rather than a
                    checkbox: "no venue" is a real, priced option, and a lone
                    checkbox left guests unsure whether they had opted in. */}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 28, paddingTop: 24, display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,1fr) minmax(0,1.15fr)", gap: mob ? 20 : 28, alignItems: "center" }}>
                  <div>
                    <p style={{ color: C.goldInk, letterSpacing: 2.2, fontSize: 11, margin: "0 0 8px", fontWeight: 700 }}>EVENT BOOKING</p>
                    <h4 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 20 : 23, margin: "0 0 8px", fontWeight: 400 }}>
                      Need space for a celebration?
                    </h4>
                    <p style={{ color: C.textS, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                      Events are handled separately from your pool visit so pricing and setup remain clear.
                    </p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {([
                      { id: "Pool", title: "Resort visit only", sub: "No event venue" },
                      { id: "Pool+Venue", title: "Add Events Venue", sub: `Private hall · +${fmt(EVENT_VENUE_RATE)} per slot` },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={resource === opt.id}
                        onClick={() => setResource(opt.id)}
                        style={tileStyle(resource === opt.id)}
                      >
                        <span style={{ display: "block", color: C.textH, fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{opt.title}</span>
                        <span style={{ display: "block", color: C.textS, fontSize: 12, lineHeight: 1.5 }}>{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Event packages. Previously reachable only from the Packages
                    page, so a guest already inside Book Now could not see
                    them.

                    Shown only once the guest has asked for the venue: a guest
                    on "Resort visit only" has said they do not want a hall,
                    and a catalogue of halls under that answer is noise. Also
                    hidden while a package booking is already in progress —
                    there is nothing left to choose at that point. */}
                {!isPackage && onBookEventPackage && resource === "Pool+Venue" && (
                  <EventPackages
                    packages={eventPackages}
                    mob={mob}
                    onBook={onBookEventPackage}
                  />
                )}

                {navRow(
                  { label: "BACK TO HOME", onClick: () => onGoHome?.() },
                  { label: "CONTINUE", onClick: () => setStep(3) },
                )}
              </div>
            )}

           {/* STEP 3 – Date & Details */}
              {step === 3 && (
                <div>
                  <p id="booknow-date-label" className="sr-only">Select date</p>
                  {stepHead({
                    eyebrow: "LIVE AVAILABILITY",
                    title: "Select a date and group size",
                    note: "UPDATED IN REAL TIME",
                    live: true,
                  })}

                  {/* The month sits in its own panel so it reads as one object
                      the guest works inside, with the availability verdict
                      attached to it rather than floating after it. */}
                  <div
                    style={{ marginBottom: 24, marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "16px 12px 16px" : "24px 24px 20px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}
                    role="group"
                    aria-labelledby="booknow-date-label"
                  >
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
                      <p style={{ color: "#e07a7a", fontSize: 13, marginTop: 16, marginBottom: 0 }}>
                        {dateCapacity.reason ?? "This date is unavailable. Please choose another."}
                      </p>
                    )}

                    {date && dateOk && (
                      <p style={{ color: "#6ec071", fontSize: 13, marginTop: 16, marginBottom: 0 }}>
                        Available on {fmtDate(date)}. Your date is held only after payment.
                      </p>
                    )}

                    {date && resource !== "Venue" && tier === "Shared" && (
                      <p style={{ color: C.textS, fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
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
                        padding: "20px 20px",
                        marginBottom: 24,
                        background: isDark ? "rgba(201,168,76,0.06)" : "rgba(201,168,76,0.08)",
                      }}
                    >
                      <p style={{ color: C.goldInk, fontSize: 11.5, letterSpacing: 2, marginBottom: 8 }}>PACKAGE</p>
                      <p style={{ color: C.textH, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{initialPackage!.title}</p>
                      <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                        Fixed price of <strong style={{ color: C.goldInk }}>{fmt(initialPackage!.price)}</strong> for up to{" "}
                        <strong style={{ color: C.textH }}>{initialPackage!.capacity} guests</strong>
                        {initialPackage!.slotMode === "WholeDay" ? <>, {SLOTS.WholeDay.hours}</> : " per slot"}.
                        {requiresRoom ? " Pick your room next." : ""}
                      </p>
                      {/* A single-slot package: the guest chooses when. Availability
                          above is checked for the slot picked here. */}
                      {initialPackage!.slotMode !== "WholeDay" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                          {(["Day", "Night"] as const).map((sl) => {
                            const active = slot === sl;
                            return (
                              <button
                                key={sl}
                                type="button"
                                onClick={() => setSlot(sl)}
                                style={{
                                  flex: 1, padding: "12px 8px", borderRadius: 8, cursor: "pointer",
                                  border: `1px solid ${active ? gold : cBr}`,
                                  background: active ? "rgba(201,168,76,0.15)" : "transparent",
                                  color: active ? C.goldInk : C.textS, textAlign: "left",
                                }}
                              >
                                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.8 }}><><Icon name={sl === "Day" ? "sun" : "moon"} size={13} style={{ marginRight: 4 }} />{sl === "Day" ? "DAY" : "NIGHT"}</></div>
                                <div style={{ fontSize: 11.5, marginTop: 4, opacity: 0.8 }}>{SLOTS[sl].hours}</div>
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
                      gap: 16,
                      marginBottom: 24,
                    }}
                  >
                    {/* GUESTS */}
                    <div
                      style={{
                        border: `1px solid ${cBr}`,
                        borderRadius: 10,
                        padding: "16px 20px",
                        background: isDark
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.02)",
                      }}
                    >
                      <p
                        id="booknow-guests-label"
                        style={{
                          color: C.goldInk,
                          fontSize: 11.5,
                          letterSpacing: 2,
                          display: "block",
                          marginBottom: 8,
                        }}
                      >
                        NUMBER OF GUESTS
                      </p>

                      <p
                        style={{
                          color: C.textS,
                          fontSize: 12.5,
                          marginBottom: 16,
                          opacity: 0.75,
                        }}
                      >
                        Tell us how many people are joining.
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
                        <p style={{ color: C.goldInk, fontSize: 12.5, marginTop: 12 }}>
                          🔒 Exclusive buyout — fixed at {RESORT_MAX_CAPACITY} guests, {fmt(tourBase)} flat{slotCount === 2 ? " for the whole day" : ""} regardless of how many actually attend.
                        </p>
                      )}
                      {!guestsLocked && guests >= GUESTS_MAX && (
                        <p style={{ color: C.dangerInk, fontSize: 12.5, marginTop: 8 }}>
                          Maximum {GUESTS_MAX} guests per booking — please call us for larger groups.
                        </p>
                      )}
                      {resource === "Venue" || slot === "WholeDay" ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, padding: "4px 12px", borderRadius: 20, background: "rgba(201,168,76,0.15)", border: `1px solid ${gold}66` }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, color: C.goldInk }}>{resource === "Venue" ? "🔒 EXCLUSIVE — VENUE RENTAL" : "🔒 EXCLUSIVE — WHOLE DAY"}</span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 16 }}>
                          <p style={{ color: C.textS, fontSize: 11.5, letterSpacing: 1.5, marginBottom: 8 }}>
                            POOL ACCESS
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
                                    padding: "8px 8px",
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
                                    color: active ? C.goldInk : C.textS,
                                  }}
                                >
                                  <><Icon name={opt === "Exclusive" ? "lock" : "handshake"} size={12} style={{ marginRight: 4 }} />{opt === "Exclusive" ? "EXCLUSIVE" : "SHARED"}</>
                                  {isDefault ? " (SUGGESTED)" : ""}
                                </button>
                              );
                            })}
                          </div>
                          <p style={{ color: C.textS, fontSize: 11.5, marginTop: 8, opacity: 0.75, lineHeight: 1.5 }}>
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
                        padding: "16px 20px",
                        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                      }}
                    >
                      <p style={{ color: C.goldInk, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 8 }}>
                        YOUR SELECTED EXPERIENCE
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
                      <p style={{ color: C.goldInk, fontSize: 12.5, margin: "16px 0 0", paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                        Shared {fmt(SHARED_PER_HEAD_RATE)} / guest · Exclusive{" "}
                        {fmt(priceBooking({ resource: "Pool", tier: "Exclusive", slot, guests: 1, overtime: 0, roomPrices: [] }).total)}
                      </p>
                    </div>
                  </div>
                  )}

                  {/* Step 4 only holds the room picker now, so skip it when
                      there is no room to pick (venue-only, or a package that
                      doesn't include one). */}
                  {navRow(
                    { label: "BACK", onClick: () => { if (isPackage) onClearPackage?.(); else setStep(1); } },
                    { label: "CONTINUE", onClick: () => setStep(showRoomPicker ? 4 : 5), disabled: !date || !dateOk },
                  )}
                </div>
              )}

            {/* STEP 4 – Rooms (optional add-on, or the package's required room) */}
            {step === 4 && (
              <div>
                {showRoomPicker && (
                <>
                {stepHead({
                  eyebrow: requiresRoom ? "INCLUDED WITH YOUR PACKAGE" : "OPTIONAL ADD-ON",
                  title: requiresRoom ? "Choose your room" : "Would you like a room?",
                  note: requiresRoom
                    ? `${Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}% off its normal rate.`
                    : "Skip this step if you only need the pool.",
                })}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20, marginBottom: 20 }}>
                  {bookableRooms.length === 0 && (
                    <p style={{ color: C.textS, fontSize: 13.5 }}>No rooms are currently available — please check back later or call us.</p>
                  )}

                  {/* "No room" as a row of its own. It used to be the absence of
                      a choice, which left guests unsure whether they had
                      skipped the step or simply not noticed it. */}
                  {!requiresRoom && bookableRooms.length > 0 && (
                    <button
                      type="button"
                      aria-pressed={selRooms.length === 0}
                      onClick={() => selRooms.forEach((id) => toggleRoom(id))}
                      style={{ ...tileStyle(selRooms.length === 0), display: "flex", alignItems: "center", gap: 16, padding: "16px 20px" }}
                    >
                      {pickCircle(selRooms.length === 0)}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", color: C.textH, fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>No room needed</span>
                        <span style={{ display: "block", color: C.textS, fontSize: 12.5 }}>Continue with your pool reservation only.</span>
                      </span>
                      <span style={{ color: C.goldInk, fontSize: 15, fontFamily: "'Satoshi',system-ui,sans-serif", flexShrink: 0 }}>Included</span>
                    </button>
                  )}
                  {bookableRooms.map((r) => {
                    const sel = selRooms.includes(r.id);
                    const taken = takenRooms.has(r.id);
                    const discountedPrice = requiresRoom ? Math.round(r.price * (1 - ROOM_BUNDLE_DISCOUNT_PCT)) : r.price;
                    return (
                      <div
                        key={r.id}
                        style={{ ...tileStyle(sel), opacity: taken && !sel ? 0.45 : 1, cursor: "default", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: mob ? "wrap" : "nowrap" }}
                      >
                        <button
                          type="button"
                          aria-pressed={sel}
                          disabled={taken && !sel}
                          onClick={() => { if (!taken || sel) toggleRoom(r.id); }}
                          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 16, background: "none", border: "none", padding: 0, textAlign: "left", cursor: taken && !sel ? "not-allowed" : "pointer", font: "inherit", color: "inherit" }}
                        >
                          {pickCircle(sel)}
                          {/* alt="" because the room name sits right beside it: a
                              screen reader would otherwise read it twice. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img loading="lazy" decoding="async" src={r.img} alt="" style={{ width: 76, height: 50, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", color: C.textH, fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{r.name}</span>
                            <span style={{ display: "block", color: C.textS, fontSize: 12.5 }}>{r.beds} · Up to {r.capacity} guests</span>
                            {taken && <span style={{ display: "block", color: "#e07a7a", fontSize: 12, marginTop: 4 }}>Already booked on {fmtDate(date)}</span>}
                          </span>
                          <span style={{ textAlign: "right", flexShrink: 0 }}>
                            {requiresRoom && <span style={{ display: "block", color: C.textXS, fontSize: 12, textDecoration: "line-through" }}>{fmt(r.price)}</span>}
                            <span style={{ display: "block", color: C.goldInk, fontWeight: 700, fontSize: 15.5 }}>{fmt(discountedPrice)}</span>
                          </span>
                        </button>

                        {/* Separate control, not part of the row's selection:
                            looking at a room and choosing it are different
                            intentions, and a guest should be able to do the
                            first without committing to the second. */}
                        <button className="sw-btn-out"
                          type="button"
                          onClick={() => setRoomPhoto(r)}
                          aria-label={`View a photo of ${r.name}`}
                          style={{ ...outBtn, color: C.goldInk, flexShrink: 0, minHeight: 44, padding: "0 16px", borderRadius: 8, fontSize: 11.5, letterSpacing: 1.2 }}
                        >
                          VIEW ROOM
                        </button>
                      </div>
                    );
                  })}
                </div>
                {!roomsFree && (
                  <p style={{ color: C.dangerInk, fontSize: 13.5, marginTop: -16, marginBottom: 20 }}>⚠ A room you picked is already booked on this date — please unselect it.</p>
                )}
                {requiresRoom && selRooms.length === 0 && (
                  <p style={{ color: C.dangerInk, fontSize: 13.5, marginTop: -16, marginBottom: 20 }}>⚠ Please pick a room to continue.</p>
                )}
                </>
                )}

                {venueFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: isDark ? "#121212" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ color: C.textS, fontSize: 13.5 }}>Event Venue Rental</span>
                    <span style={{ color: C.goldInk, fontWeight: 700, fontSize: 14.5 }}>{fmt(venueFee)}</span>
                  </div>
                )}

                {showRoomPicker && bookableRooms.length > 0 && (
                  <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 4px" }}>
                    Room availability is checked against your selected date before confirmation.
                  </p>
                )}

                {navRow(
                  { label: "BACK", onClick: () => setStep(3) },
                  { label: "CONTINUE", onClick: () => setStep(5), disabled: (requiresRoom && selRooms.length === 0) || !roomsFree },
                )}
              </div>
            )}

            {/* STEP 5 – Guest Info */}
            {step === 5 && (
              <div>
                {stepHead({
                  eyebrow: "GUEST DETAILS",
                  title: "Who should we contact?",
                  note: "Your information is used only for this reservation.",
                })}
                <div style={{ height: 20 }} />
                {/* Notes spans the pair above it, so the three short fields
                    stay side by side and the free-text box gets the full
                    width it actually needs. */}
                <div className="mb-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="bn-name" className="mb-2 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>FULL NAME</Label>
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
                        style={okField(Boolean(form.name) && isValidName(form.name))}
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, color: form.name.length >= NAME_MAX ? "#e55" : C.textS, fontWeight: 700, fontFamily: "monospace" }}>
                        {form.name.length}/{NAME_MAX}
                      </span>
                    </div>
                    {form.name && !isValidName(form.name) && (
                      <p style={{ color: C.dangerInk, fontSize: 12.5, marginTop: 4 }}>⚠ Please enter your full name (letters only)</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="bn-email" className="mb-2 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>EMAIL ADDRESS</Label>
                    <Input
                      id="bn-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setF("email", e.target.value)}
                      placeholder="example@email.com"
                      autoComplete="email"
                      aria-invalid={Boolean(form.email) && !isValidEmail(form.email)}
                      style={okField(Boolean(form.email) && isValidEmail(form.email))}
                    />
                    {form.email && !isValidEmail(form.email) && (
                      <p style={{ color: C.dangerInk, fontSize: 12.5, marginTop: 4 }}>⚠ Please enter a valid email address</p>
                    )}

                  </div>

                  <div>
                    <Label htmlFor="bn-contact" className="mb-2 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>CONTACT NUMBER</Label>
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
                        style={okField(isValidPHNumber(form.contact))}
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, color: form.contact.length === 11 ? "#4caf50" : form.contact.length > 0 ? "#f5c518" : C.textS, fontWeight: 700, fontFamily: "monospace" }}>{form.contact.length}/11</span>
                    </div>
                    {form.contact.length > 0 && form.contact.length < 11 && <p style={{ color: "#f5c518", fontSize: 12.5, marginTop: 4 }}>⚠ Must be 11 digits</p>}
                    {form.contact.length === 11 && !isValidPHNumber(form.contact) && <p style={{ color: C.dangerInk, fontSize: 12.5, marginTop: 4 }}>⚠ Must start with 09</p>}

                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="bn-notes" className="mb-2 block text-[11.5px] tracking-[2px]" style={{ color: C.goldInk }}>SPECIAL NOTES (OPTIONAL)</Label>
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
                      <span style={{ color: form.notes.length >= NOTES_MAX ? "#e55" : C.textS, fontSize: 11.5, fontFamily: "monospace" }}>
                        {form.notes.length}/{NOTES_MAX}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Summary — an itemized liquidation rather than one lump
                    total, so a guest can see exactly what each peso is for
                    before paying. */}
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "24px 24px", marginBottom: 4, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                    <span style={{ color: C.goldInk, fontSize: 11, letterSpacing: 2.2, fontWeight: 700 }}>RESERVATION SUMMARY</span>
                    <span style={{ color: C.goldInk, fontSize: 24, fontFamily: "'Satoshi',system-ui,sans-serif" }}>{fmt(total)}</span>
                  </div>

                  {([
                    ["Date", date ? fmtDate(date) : "\u2014"],
                    ["Experience", `${packageLabel} · ${tier}`],
                    ["Guests", String(guests)],
                    ["Room", selRooms.length
                      ? rooms.filter((r) => selRooms.includes(r.id)).map((r) => r.name).join(", ")
                      : "No room add-on"],
                  ] as const).map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
                      <span style={{ color: C.textS, fontSize: 13 }}>{l}</span>
                      <span style={{ color: C.textB, fontSize: 13, fontWeight: 600, textAlign: "right" }}>{v}</span>
                    </div>
                  ))}

                  {/* Discounts stay on the page. Everything else in the total is
                      something the guest picked and saw priced; a discount is
                      not, so hiding it would make the total unexplainable. */}
                  {priceLines.filter((l) => l.discount).map((l) => (
                    <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
                      <span style={{ color: "#6ec071", fontSize: 13 }}>{l.label}</span>
                      <span style={{ color: "#6ec071", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>-{fmt(l.amount)}</span>
                    </div>
                  ))}

                  {/* How much to pay now. A radio group of two cards: the 50%
                      deposit stays the default, and paying in full means
                      nothing is left to settle on arrival. */}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 16 }}>
                    <div id="pay-plan-label" style={{ color: C.textS, fontSize: 12, letterSpacing: 1.6, fontWeight: 700, marginBottom: 12 }}>HOW MUCH TO PAY NOW</div>
                    <div role="radiogroup" aria-labelledby="pay-plan-label" style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12 }}>
                      {([
                        { full: false, title: "50% deposit", amount: down, note: `${fmt(total - down)} paid at the resort` },
                        { full: true, title: "Pay in full", amount: total, note: "Nothing to pay on arrival" },
                      ] as const).map((o) => {
                        const on = payFull === o.full;
                        return (
                          <button key={o.title} type="button" role="radio" aria-checked={on} onClick={() => setPayFull(o.full)}
                            style={{ textAlign: "left", padding: "12px 16px", borderRadius: 10, cursor: "pointer", background: on ? "rgba(201,168,76,0.12)" : "transparent", border: `1px solid ${on ? gold : C.border}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${on ? gold : C.textS}`, marginTop: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: gold }} />}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", color: C.textH, fontSize: 13.5, fontWeight: 700 }}>{o.title} · {fmt(o.amount)}</span>
                              <span style={{ display: "block", color: C.textS, fontSize: 12, marginTop: 4 }}>{o.note}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 16 }}>
                    <span style={{ color: C.textS, fontSize: 13 }}>Due now</span>
                    <span style={{ color: C.goldInk, fontSize: 13, fontWeight: 700 }}>{fmt(payFull ? total : down)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 8 }}>
                    <span style={{ color: C.textS, fontSize: 13 }}>Balance on arrival</span>
                    <span style={{ color: C.goldInk, fontSize: 13, fontWeight: 700 }}>{fmt(payFull ? 0 : total - down)}</span>
                  </div>
                </div>
                {!dateOk && (
                  <p style={{ color: C.dangerInk, fontSize: 13.5, marginBottom: 12 }}>
                    ⚠ {describeDateProblem(date) ?? "That date is no longer available — please pick another."}
                  </p>
                )}
                {/* dateOk is re-checked here as well as at step 2: the guest
                    may have sat on this screen past midnight, or the date may
                    have been taken in the meantime. */}
                {navRow(
                  { label: "BACK", onClick: () => setStep(showRoomPicker ? 4 : 3) },
                  {
                    label: "REVIEW PAYMENT POLICY",
                    onClick: () => setShowGcashWarning(true),
                    disabled: !!validateBookingForm(form) || !dateOk || !roomsFree,
                  },
                )}
              </div>
            )}

            {/* STEP 6 – GCash QR */}
            {step === 6 && (
              <div style={{ position: "relative" }}>
                {qrExpired && (
                  <div style={{ position: "absolute", inset: 0, background: isDark ? "rgba(6,5,4,0.96)" : "rgba(250,247,242,0.97)", zIndex: 10, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 28 }}>⏱</div>
                    <h3 style={{ color: C.dangerInk, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 22, fontWeight: 400, marginBottom: 12 }}>QR Code Expired</h3>
                    <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.8, marginBottom: 28, maxWidth: 320 }}>Your payment window has expired. Please go back and try again.</p>
                    <button className="sw-btn" onClick={() => { setQrExpired(false); setQrRetryKey((k) => k + 1); }} style={{ ...goldBtn }}>TRY AGAIN</button>
                  </div>
                )}
                {/* The step used to open with a full-bleed GCash gradient bar,
                    which made this one screen look like a different site. It
                    now carries the same head as every other step, with the
                    countdown as a pill rather than a headline. */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: C.goldInk, letterSpacing: 2.2, fontSize: 11, margin: "0 0 8px", fontWeight: 700 }}>SECURE PAYMENT</p>
                    <h3 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 24 : 30, margin: 0, fontWeight: 400, lineHeight: 1.15 }}>
                      {paidInFull ? "Pay in full" : "Pay the 50% reservation deposit"}
                    </h3>
                  </div>
                  <div style={{ border: `1px solid ${qrSeconds <= 60 ? "#e07a7a" : C.border}`, borderRadius: 999, padding: "8px 16px", fontSize: 12.5, color: qrSeconds <= 60 ? "#e07a7a" : C.textS, whiteSpace: "nowrap", marginTop: mob ? 0 : 20 }}>
                    Session expires in <strong style={{ color: qrSeconds <= 60 ? "#e07a7a" : C.textB, fontFamily: "monospace" }}>{fmtTimer(qrSeconds)}</strong>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "minmax(0,0.85fr) minmax(0,1.15fr)", gap: mob ? 16 : 20, alignItems: "start" }}>
                  {/* QR */}
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "24px 20px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
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
                    <p style={{ color: C.textS, fontSize: 13, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
                      Open GCash and scan the code
                    </p>
                    <div style={{ width: "100%", background: "rgba(0,169,82,0.10)", border: "1px solid rgba(0,169,82,0.35)", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ color: "#4caf50", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>AMOUNT DUE NOW</div>
                      <div style={{ color: isDark ? "#fff" : "#111", fontSize: mob ? 24 : 28, fontWeight: 700, fontFamily: "'Satoshi',system-ui,sans-serif" }}>{fmt(dueNow)}</div>
                    </div>
                  </div>
                  {/* Order summary */}
                  <div style={{ minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "24px 24px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
                    <div style={{ color: C.goldInk, fontSize: 11, letterSpacing: 2.2, fontWeight: 700, marginBottom: 16 }}>ORDER SUMMARY</div>
                    <div style={{ marginBottom: 16 }}>
                      {([
                        ["Guest", form.name || "\u2014"],
                        ["Date", date ? fmtDate(date) : "\u2014"],
                        ["Experience", packageLabel],
                        ["Guests", overtime > 0 ? `${guests} \u00b7 +${overtime}hr OT` : String(guests)],
                        ["Full total", fmt(serverQuote?.total ?? total)],
                      ] as const).map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ color: C.textS, fontSize: 13 }}>{l}</span>
                          <span style={{ color: C.textB, fontSize: 13, fontWeight: 600, textAlign: "right" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, margin: "0 0 16px" }}>
                      Keep this page open while you pay.
                    </p>
                    {/* "I've completed payment" → shows confirm modal */}
                    {/* Live status. There is deliberately no "I've paid"
                        button any more — the old one recorded the booking as
                        Paid on the guest's say-so, whether or not any money
                        had moved. Confirmation now comes from PayMongo. */}
                    {paid ? (
                      <div style={{ background: "rgba(0,169,82,0.10)", border: "1px solid rgba(0,169,82,0.35)", borderRadius: 8, padding: "16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 18 }}>✅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#00a952", fontSize: 14.5, fontWeight: 700 }}>Payment received</div>
                          {!saveError && <div style={{ color: C.textS, fontSize: 12.5 }}>Saving your booking…</div>}
                          {saveError && (
                            <>
                              <div style={{ color: C.dangerInk, fontSize: 12.5, lineHeight: 1.6, margin: "4px 0 8px" }}>
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
                      <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
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
                        style={{ display: "block", marginTop: 12, textAlign: "center", color: C.goldInk, fontSize: 12.5, letterSpacing: 1, textDecoration: "underline" }}
                      >
                        ⚡ TEST MODE — simulate a successful payment
                      </a>
                    )}
                  </div>
                </div>

                {/* Only while the payment is still outstanding. Once PayMongo
                    has confirmed, there is a real payment to reconcile and
                    this is no longer the guest's to undo. */}
                {!paid && (
                  <div style={{ marginTop: 24, textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => setShowCancelPay(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: C.textS,
                        fontSize: 12.5,
                        letterSpacing: 1.2,
                        cursor: "pointer",
                        minHeight: 44,
                        padding: "0 16px",
                        fontFamily: "inherit",
                      }}
                    >
                      CANCEL PAYMENT
                    </button>
                  </div>
                )}
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
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(76,175,80,0.10)", border: "1px solid rgba(76,175,80,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#6ec071", margin: "0 auto 24px" }} aria-hidden="true">✓</div>
                <p style={{ color: C.goldInk, fontSize: 11, letterSpacing: 2.6, fontWeight: 700, margin: "0 0 12px" }}>{confirmedNow ? "RESERVATION CONFIRMED" : "RESERVATION RECEIVED"}</p>
                {/* The guest's own name, because this is the one screen that is
                    addressed to them rather than about the booking. */}
                <h3 style={{ color: C.textH, fontSize: mob ? 28 : 36, fontWeight: 400, margin: "0 0 16px", fontFamily: "'Satoshi',system-ui,sans-serif", lineHeight: 1.15 }}>
                  Thank you{form.name ? `, ${form.name.split(" ")[0]}` : ""}.
                </h3>
                <p style={{ color: C.textS, fontSize: 14.5, margin: "0 auto 28px", lineHeight: 1.7, maxWidth: 520 }}>
                  We received your {fmt(dueNow)} {paidInFull ? "payment, so your stay is fully paid" : "deposit"}.{" "}
                  {confirmedNow
                    ? <>Your reservation is confirmed. See you on {date ? fmtDate(date) : "your visit"}!</>
                    : <>The resort needs to check one detail and will contact you within 24 hours.</>}
                </p>

                {/* Reference ID — prominent at top */}
                <div style={{ background: isDark ? "rgba(201,168,76,0.07)" : "rgba(201,168,76,0.06)", border: `1px solid ${gold}66`, borderRadius: 12, padding: mob ? "20px 20px" : "24px 28px", margin: "0 auto 24px", maxWidth: 540, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <p style={{ color: C.textS, fontSize: 11, letterSpacing: 2.6, margin: 0 }}>YOUR REFERENCE ID</p>
                  <p style={{ color: C.goldInk, fontFamily: "monospace", fontSize: mob ? 28 : 34, fontWeight: 700, letterSpacing: 3, margin: 0 }}>{bookingId}</p>
                  <p style={{ color: C.textB, fontSize: 13, margin: 0 }}>Save this number for follow-ups and booking management.</p>
                </div>

                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "24px 24px", margin: "0 auto 20px", maxWidth: 540, textAlign: "left", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
                  <p style={{ color: C.textH, fontSize: 15, fontWeight: 700, margin: "0 0 16px" }}>What happens next</p>
                  {/* An ordered list, not numbered divs: these are steps in
                      sequence, and a screen reader should say so. */}
                  <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      ...(confirmedNow
                        ? [
                          `Your confirmation is on its way to ${form.email || "your email"}.`,
                          "Your booking page shows your payments and lets you change the date once, if plans change.",
                          paidInFull ? "Nothing more is due on arrival, apart from any damage or extra hours." : "Pay the balance at the resort on the day.",
                        ]
                        : [
                          "Your payment is safe and recorded.",
                          "The resort checks the detail it flagged.",
                          `You'll hear from them at ${form.email || "your email"} within 24 hours.`,
                        ]),
                    ].map((txt, i) => (
                      <li key={txt} style={{ display: "flex", gap: 12, alignItems: "flex-start", color: C.textS, fontSize: 13, lineHeight: 1.6 }}>
                        <span style={{ color: C.goldInk, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                        <span>{txt}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <p style={{ color: C.textS, fontSize: 12.5, margin: "0 auto 24px", maxWidth: 540 }}>
                  {paidInFull
                    ? <>No refunds. Nothing more is due at the resort, apart from any damage or extra hours.</>
                    : <>No refunds. The remaining balance of {fmt(fullTotal - dueNow)} is paid at the resort.</>}
                </p>
                <button className="sw-btn"
                  onClick={() => onGoHome?.()}
                  style={{ ...goldBtn }}
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
        {/* The room's photos. A room carries up to five, and this is the same
            MediaGallery the Rooms page and the package dialogs use, so the
            arrows, counter and thumbnails behave identically -- and stay
            hidden when there is only one photo. */}
        <Dialog open={!!roomPhoto} onOpenChange={(o) => { if (!o) setRoomPhoto(null); }}>
          <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[min(48rem,calc(100%-2rem))]">
            {roomPhoto && (() => {
              const chosen = selRooms.includes(roomPhoto.id);
              const taken = takenRooms.has(roomPhoto.id);
              const shots = roomShots(roomPhoto);
              return (
                /* Photo beside the facts, not underneath them. The photo used
                   to run the full width with the name burned into it and one
                   cramped line below, which wasted the height and said the
                   room's name twice. */
                <div className="grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                  <MediaGallery
                    shots={shots}
                    title={null}
                    className="min-h-[220px] md:min-h-[340px]"
                  />

                  <div style={{ display: "flex", flexDirection: "column", padding: mob ? "20px 20px 24px" : "28px 28px 28px", minWidth: 0 }}>
                    <p style={{ color: C.goldInk, fontSize: 10.5, letterSpacing: 2.4, margin: "0 0 8px", fontWeight: 700 }}>ROOM</p>
                    <DialogTitle asChild>
                      <h3 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 24 : 28, fontWeight: 400, margin: "0 0 16px", lineHeight: 1.15 }}>
                        {roomPhoto.name}
                      </h3>
                    </DialogTitle>

                    {/* The room's own facts, one per line with its own icon,
                        rather than a single run-on sentence. */}
                    <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 8 }}>
                      {([
                        { icon: "bed", text: roomPhoto.beds },
                        { icon: "users", text: `Sleeps up to ${roomPhoto.capacity} guests` },
                        { icon: "clock", text: `One ${SLOTS[slot].label.toLowerCase()} slot · ${SLOTS[slot].hours}` },
                      ] as const).map((row) => (
                        <li key={row.text} style={{ display: "flex", gap: 12, alignItems: "flex-start", color: C.textB, fontSize: 14, lineHeight: 1.5 }}>
                          <span aria-hidden="true" style={{ color: C.goldInk, lineHeight: 0, marginTop: 4, flexShrink: 0 }}>
                            <Icon name={row.icon as IconName} size={15} strokeWidth={1.5} />
                          </span>
                          {row.text}
                        </li>
                      ))}
                    </ul>

                    {roomPhoto.desc && (
                      <DialogDescription asChild>
                        <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                          {roomPhoto.desc}
                        </p>
                      </DialogDescription>
                    )}

                    {/* Price and the action sit at the foot however short the
                        description is, so the panel never ends ragged. */}
                    <div style={{ marginTop: "auto", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                        <span style={{ color: C.goldInk, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
                          {requiresRoom ? fmt(Math.round(roomPhoto.price * (1 - ROOM_BUNDLE_DISCOUNT_PCT))) : fmt(roomPhoto.price)}
                        </span>
                        <span style={{ color: C.textS, fontSize: 12.5 }}>per slot</span>
                        {requiresRoom && (
                          <span style={{ color: C.textXS, fontSize: 12, textDecoration: "line-through" }}>{fmt(roomPhoto.price)}</span>
                        )}
                      </div>

                      {taken && !chosen ? (
                        <p style={{ color: "#e07a7a", fontSize: 13, margin: 0 }}>
                          Already booked on {fmtDate(date)}.
                        </p>
                      ) : (
                        <button className={chosen ? "sw-btn-out" : "sw-btn"}
                          type="button"
                          onClick={() => { toggleRoom(roomPhoto.id); setRoomPhoto(null); }}
                          /* Two whole styles, not a spread with a conditional
                             `color`: `color: undefined` does not fall back to
                             goldBtn's own near-black, it clears it, and the
                             label inherited the dialog's white. */
                          style={chosen
                            ? { ...outBtn, color: C.goldInk, width: "100%", minHeight: 48 }
                            : { ...goldBtn, width: "100%", minHeight: 48 }}
                        >
                          {chosen ? "REMOVE THIS ROOM" : "SELECT THIS ROOM"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Cancelling the payment. Worth a confirm: the guest loses the QR
            they are looking at, and a fresh one is minted on the way back. */}
        <AlertDialog open={showCancelPay} onOpenChange={(o) => { if (!o) setShowCancelPay(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 24, fontWeight: 400 }}>
                Cancel this payment?
              </AlertDialogTitle>
              <AlertDialogDescription style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>
                Nothing has been charged and no reservation has been saved. The QR code on
                screen will stop working, and your date is not held. You can start the
                payment again from your details.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel style={{ ...outBtn, color: C.goldInk, minHeight: 48 }}>
                KEEP PAYING
              </AlertDialogCancel>
              <Button
                onClick={() => {
                  setShowCancelPay(false);
                  setQrExpired(false);
                  // Back to guest details. The step-6 effect's cleanup voids
                  // the payment intent on the way out, so the code cannot be
                  // paid after this.
                  setStep(5);
                }}
                style={{ minHeight: 48, border: "1px solid rgba(214,138,138,0.5)", background: "rgba(180,70,70,0.22)", color: "#f0c9c9", fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4 }}
              >
                YES, CANCEL
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={showGcashWarning}
          onOpenChange={(open) => { if (!open) { setShowGcashWarning(false); setPolicyChecked(false); } }}
        >
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(46rem,calc(100%-2rem))]">
            <DialogHeader>
              {/* The mark is an outline, not a filled red warning: this is a
                  policy the guest has to read, not an error they have made. */}
              <div style={{ width: 48, height: 48, borderRadius: "50%", border: `1.5px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, color: C.goldInk, fontSize: 22, fontWeight: 600, flexShrink: 0 }} aria-hidden="true">
                !
              </div>
              <DialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 26 : 32, fontWeight: 400, lineHeight: 1.15 }}>
                Before you continue
              </DialogTitle>
              <DialogDescription style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
                Please review the resort&rsquo;s payment and stay policies.
              </DialogDescription>
            </DialogHeader>

            {/* Four policies, each a heading and a plain sentence. The old
                version leaned on emoji to carry meaning, which a screen
                reader announces as decoration and which carried no meaning
                for anyone who could not place the pictogram. */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? "20px 16px" : "24px 24px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2" style={{ margin: 0 }}>
                {[
                  ["Cancellations", "If the resort has to cancel, you choose a free new date or a full refund. If you cancel, payments aren't refunded, but you can move your booking to another date once."],
                  [payFull ? "Paying in full" : "50% reservation deposit", payFull ? "The whole total is paid now; nothing is due on arrival." : "Half of the total is due now; the balance is paid on arrival."],
                  ["Flexible rescheduling", "Changes depend on availability and must be arranged with the resort."],
                  ["Quiet hours", QUIET_HOURS_POLICY],
                ].map(([title, body]) => (
                  <div key={title}>
                    <dt style={{ color: C.textH, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</dt>
                    <dd style={{ color: C.textS, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>{body}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* A real <Label htmlFor> rather than an onClick div: the whole
                sentence is the checkbox's hit area AND its accessible name,
                and the space bar toggles it. */}
            <Label
              htmlFor="gcash-policy-ack"
              style={{ display: "flex", alignItems: "center", gap: 12, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)", border: `1px solid ${policyChecked ? gold : C.border}`, borderRadius: 10, padding: "16px 16px", cursor: "pointer", transition: "border-color .18s", userSelect: "none" }}
            >
              <Checkbox
                id="gcash-policy-ack"
                checked={policyChecked}
                onCheckedChange={(v) => setPolicyChecked(v === true)}
                className="size-6 rounded-full border-2 border-[var(--sw-gold)] data-[state=checked]:border-[var(--sw-gold)] data-[state=checked]:bg-[var(--sw-gold)] data-[state=checked]:text-black"
                style={{ ["--sw-gold" as string]: gold }}
              />
              <span style={{ color: C.textB, fontSize: 13.5, lineHeight: 1.6, fontWeight: 400, letterSpacing: 0 }}>
                I understand and agree to the payment and stay policies.
              </span>
            </Label>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setShowGcashWarning(false); setPolicyChecked(false); }}
                style={{ color: C.goldInk, borderColor: gold, letterSpacing: 1.4, fontSize: 12.5, fontWeight: 700, minHeight: 48, padding: "0 24px" }}
              >
                REVIEW DETAILS
              </Button>
              <Button className="sw-btn"
                disabled={!policyChecked}
                onClick={() => { setShowGcashWarning(false); setPolicyChecked(false); setStep(6); }}
                style={{ ...goldBtn, opacity: policyChecked ? 1 : 0.45, cursor: policyChecked ? "pointer" : "not-allowed" }}
              >
                AGREE AND CONTINUE
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    );
  }
