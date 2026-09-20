  "use client";

  import { useState, useEffect, useRef } from "react";
  import { createPortal } from "react-dom";
  import { useTheme } from "@/contexts/ThemeContext";
  import { useWidth } from "@/hooks/useWidth";
  import { useToast } from "@/contexts/ToastContext";
  import { T } from "@/lib/theme";
  import { gold, goldBtn, outBtn } from "@/lib/styles";
  import { fmt, calcTourBase, calcExclusiveDiscount, calcComboDiscount, calcPackageFoodDiscount, hasComboItem, calcFoodTotal, genBookingId, fmtTimer, fmtDate, getPackageTier, checkBookingAvailability, getSharedPoolUsage, calcVenueFee, isMenuItemSellable, deductRecipeStock, isRoomOpen } from "@/lib/utils";
  import { BookingDatePicker } from "@/components/booking/BookingDatePicker";
  import type { Booking, BookingFoodItem, BookingResource, BookingTier, PackageDeepLink } from "@/types/booking";
  import type { Room } from "@/types/room";
  import type { MenuItem } from "@/types/menu";
  import type { InventoryItem } from "@/types/inventory";
  import type { Facility } from "@/types/facility";
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
    OVERTIME_MIN,
    OVERTIME_MAX,
    RESORT_MAX_CAPACITY,
    COMBO_DISCOUNT_PCT,
    ROOM_BUNDLE_DISCOUNT_PCT,
  } from "@/lib/validators";

  interface BookNowProps {
    bookings: Booking[];
    setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
    rooms: Room[];
    menuItems?: MenuItem[];
    inventory?: InventoryItem[];
    setInventory?: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
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
     *  picker UI is hidden and the guest only picks a date and food. */
    initialPackage?: PackageDeepLink;
  }

  export function BookNow({
    bookings, setBookings, rooms, menuItems = [], inventory = [], setInventory, closedDates,
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
    // the date and the food/combo order are left for the guest to pick.
    const isPackage = !!initialPackage;
    const [tourType, setTourType] = useState<"Day Tour" | "Night Tour">("Day Tour");
    const [step, setStep] = useState(initialResource ? 3 : 1);
    const [date, setDate] = useState(preselectedDate || "");
    const [guests, setGuests] = useState(initialPackage?.capacity ?? 10);
    const [overtime, setOvertime] = useState(0);
    // Which resource is being booked (Pool / events Venue / both), and an
    // explicit Shared-vs-Exclusive override. tierChoice starts as null so the
    // guest-count-derived default still applies until they actively pick one —
    // this is what answers "is it not better if we add if they are booking
    // exclusively?" without forcing a choice on everyone.
    const [resource, setResource] = useState<BookingResource>(initialResource ?? "Pool");
    const [tierChoice, setTierChoice] = useState<BookingTier | null>(initialTier ?? null);
    const [selRooms, setSelRooms] = useState<number[]>(preselectedRoom ? [preselectedRoom] : []);
    const [foodQty, setFoodQty] = useState<Record<number, number>>({});
    const [form, setFormState] = useState({ name: "", email: "", contact: "", notes: "" });
    const [bookingId, setBookingId] = useState("");
    const [qrSeconds, setQrSeconds] = useState(600);
    const [qrExpired, setQrExpired] = useState(false);
    const [qrRetryKey, setQrRetryKey] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Modal states
    const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
    const [showGcashWarning, setShowGcashWarning] = useState(false);
    const [policyChecked, setPolicyChecked] = useState(false);
    // Modals are portaled straight into document.body (see the GCash
    // warning modal below) so they can never be broken by some ancestor
    // ending up with a non-"none" CSS transform — document isn't available
    // during SSR, so this only flips true once we're safely in the browser.
    const [portalReady, setPortalReady] = useState(false);
    useEffect(() => setPortalReady(true), []);


    const setF = (k: string, v: string) => setFormState((f) => ({ ...f, [k]: v }));

    const closedSet = new Set(closedDates);
    // A Venue-only booking is always exclusive to the venue by definition —
    // there's no "sharing" a rented hall. Otherwise, the guest's explicit
    // choice wins; absent that, fall back to the guest-count-derived default.
    const tier: BookingTier = resource === "Venue" ? "Exclusive" : (tierChoice ?? getPackageTier(guests));

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
    const dateCapacity = date ? checkBookingAvailability(date, guests, tier, resource, bookings, facilities) : { ok: true };
    const dateOk =
      !!date &&
      isWithinBookingWindow(date) &&
      dateCapacity.ok &&
      !closedSet.has(date);
    const sharedUsage = date ? getSharedPoolUsage(date, bookings) : { used: 0, max: 0 };
    // An Exclusive buyout fixes the guest count to the resort's full
    // capacity — the stepper is locked (not just defaulted) once that's
    // chosen, so it can't drift away from what the flat rate actually buys.
    const guestsLocked = !isPackage && resource !== "Venue" && tier === "Exclusive";
    const packageLabel = isPackage
      ? initialPackage!.title
      : resource === "Venue"
      ? "Event Venue Rental (Exclusive)"
      : resource === "Pool+Venue"
      ? `${tourType} + Event Venue (Exclusive)${selRooms.length > 0 ? " + Room" : ""}`
      : `${tourType}${selRooms.length > 0 ? " + Room" : ""}`;

    // Tour base: a package's fixed price when arriving from one, otherwise
    // the tier-dependent rate (flat Exclusive buyout vs per-head Shared).
    const tourBase = isPackage ? initialPackage!.price : resource === "Venue" ? 0 : calcTourBase(guests, tier);
    // Reward for an Exclusive buyout — never applies to a package, since a
    // package's price is already its final, fixed price.
    const exclusiveDiscount = isPackage || resource === "Venue" ? 0 : calcExclusiveDiscount(tier, guests);
    const venueFee = isPackage ? 0 : calcVenueFee(resource);
    const overtimeFee = isPackage || resource === "Venue" ? 0 : overtime * 500;
    // A "Pool + Room" package still needs ONE room picked (see
    // requiresRoom) — everything else about a package is fixed, but a room
    // can't be priced before it's chosen. Bookable rooms exclude any
    // flagged "Under Maintenance" in Facilities.
    const requiresRoom = !!initialPackage?.requiresRoom;
    const bookableRooms = rooms.filter((r) => isRoomOpen(r.id, facilities));
    const showRoomPicker = (!isPackage && resource !== "Venue") || (isPackage && requiresRoom);
    const selectedRoomDetails = selRooms.map((rid) => rooms.find((r) => r.id === rid)).filter((r): r is Room => !!r);
    const roomsFeeRaw = selectedRoomDetails.reduce((sum, r) => sum + r.price, 0);
    // A room bundled into a package costs less than renting it standalone.
    const roomBundleDiscount = isPackage && requiresRoom ? Math.round(roomsFeeRaw * ROOM_BUNDLE_DISCOUNT_PCT) : 0;
    const roomsFee = roomsFeeRaw - roomBundleDiscount;
    const foodOrder: BookingFoodItem[] = Object.entries(foodQty)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const item = menuItems.find((m) => m.id === Number(itemId));
        return { itemId: Number(itemId), name: item?.name ?? "Item", price: item?.price ?? 0, qty };
      });
    const foodTotal = calcFoodTotal(foodOrder);
    // Ordering at least one Combo item discounts the whole food subtotal —
    // works the same whether or not this booking is a package. A "Pool +
    // Food" package additionally discounts the WHOLE food order regardless
    // of what's in it (see PackageDeepLink.foodDiscountPct) — the two stack.
    const comboDiscount = calcComboDiscount(foodOrder, menuItems);
    const packageFoodDiscount = isPackage ? calcPackageFoodDiscount(foodOrder, initialPackage?.foodDiscountPct) : 0;
    const total = tourBase - exclusiveDiscount + overtimeFee + roomsFee + venueFee + foodTotal - comboDiscount - packageFoodDiscount;
    const down = Math.ceil(total / 2);
    // A package requiring a room only ever wants ONE — picking a new one
    // replaces the selection instead of adding to it.
    const toggleRoom = (id: number) => {
      if (isPackage && requiresRoom) {
        setSelRooms((r) => (r.includes(id) ? [] : [id]));
      } else {
        setSelRooms((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
      }
    };
    const setFoodItemQty = (id: number, qty: number) => setFoodQty((f) => ({ ...f, [id]: Math.max(0, qty) }));
    const handleContact = (v: string) => setF("contact", sanitizeContact(v));
    // Names are filtered as they are typed, so digits and symbols never even
    // appear in the field — the user sees the rule instead of being told off
    // for breaking it after the fact.
    const handleName = (v: string) => setF("name", sanitizeName(v));
    const handleNotes = (v: string) => setF("notes", sanitizeNotes(v));

    // Auto-redirect to home after online booking is confirmed (step 7)
    useEffect(() => {
      if (step === 7) {
        const t = setTimeout(() => { onGoHome?.(); }, 18000);
        return () => clearTimeout(t);
      }
    }, [step, onGoHome]);

    useEffect(() => {
      if (step === 6) {
        setQrSeconds(600); setQrExpired(false);
        timerRef.current = setInterval(() => {
          setQrSeconds((s) => {
            if (s <= 1) { clearInterval(timerRef.current!); setQrExpired(true); return 0; }
            return s - 1;
          });
        }, 1000);
      } else { if (timerRef.current) clearInterval(timerRef.current); }
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [step, qrRetryKey]);

    // Called after payment confirm modal is accepted
    const confirmOnline = () => {
      const id = genBookingId(bookings.length);
      setBookingId(id);
      setBookings((b) => [...b, {
        id, name: form.name, contact: form.contact, email: form.email,
        date, guests, package: packageLabel,
        rooms: selRooms, overtime, total, downpayment: down,
        status: "Paid", paymentProof: false, notes: form.notes, createdAt: Date.now(),
        source: "Online",
        foodOrder: foodOrder.length ? foodOrder : undefined,
        foodTotal: foodTotal || undefined,
        resource, tier,
      }]);
      if (foodOrder.length) {
        setInventory?.((inv) => deductRecipeStock(foodOrder, menuItems, inv));
      }
      clearPreselected?.(); clearPreselectedDate?.();
      if (timerRef.current) clearInterval(timerRef.current);
      setShowPaymentConfirm(false);
      setStep(7);
    };

    const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
    const cBr = isDark ? "#2a2520" : "#d6cfc4";

    const stepLabels = ["Tour Type", "Details", "Rooms & Food", "Your Info", "GCash", "Done"];
    const stepIdx: Record<number, number> = { 1: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
    const labels = stepLabels;
    const currentIdx = stepIdx[step] ?? 0;

    // Shared modal backdrop style
    const modalBackdrop: React.CSSProperties = {
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 500, padding: 20,
    };
    const modalBox: React.CSSProperties = {
      background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: mob ? "28px 20px" : "36px",
      width: "100%", maxWidth: 420,
      boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
    };

    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "32px 16px" : "80px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <p style={{ color: gold, letterSpacing: 4, fontSize: 11, marginBottom: 8, textAlign: "center" }}>RESERVATIONS</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 26 : 40, color: C.textH, textAlign: "center", marginBottom: 12 }}>Book Your Stay</h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2" style={{ opacity: 0.7, flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <span style={{ color: C.textS, fontSize: 13 }}>
              {step === 1
                ? <>Day Tour: <strong style={{ color: C.textB }}>8AM–5PM</strong> · Night Tour: <strong style={{ color: C.textB }}>6PM–12AM</strong></>
                : <>{tourType} Hours: <strong style={{ color: C.textB }}>{tourType === "Night Tour" ? "6:00 PM – 12:00 AM" : "8:00 AM – 5:00 PM"}</strong></>
              }
            </span>
          </div>

          {/* Step indicator */}
          {step > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 32, overflowX: "auto" }}>
              {labels.map((label, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: i < currentIdx ? gold : "transparent", border: i === currentIdx ? `2px solid ${gold}` : i < currentIdx ? "none" : `1px solid ${isDark ? "#2a2520" : "#d6cfc4"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: i < currentIdx ? "#000" : i === currentIdx ? gold : C.textS, fontWeight: 700, flexShrink: 0 }}>
                      {i < currentIdx ? "✓" : i + 1}
                    </div>
                    <span style={{ color: i === currentIdx ? gold : C.textS, fontSize: mob ? 8 : 9, letterSpacing: 1, whiteSpace: "nowrap" }}>{label.toUpperCase()}</span>
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
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>Which tour would you like?</h3>
                <p style={{ color: C.textS, fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>Reserve online now via GCash. 50% down payment required.</p>
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14 }}>
                  {[
                    { id: "Day Tour", icon: "☀️", title: "Day Tour", sub: "Whole-day resort use, 8:00 AM – 5:00 PM.", badge: "POPULAR" },
                    { id: "Night Tour", icon: "🌙", title: "Night Tour", sub: "Whole-night resort use, 6:00 PM – 12:00 AM.", badge: "NEW" },
                  ].map((opt) => (
                    <div key={opt.id} onClick={() => { setTourType(opt.id as "Day Tour" | "Night Tour"); setStep(3); }}
                      style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "24px 20px", cursor: "pointer", position: "relative", transition: "border-color .2s,box-shadow .2s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${gold}66`; e.currentTarget.style.boxShadow = isDark ? "0 8px 24px rgba(0,0,0,0.4)" : "0 8px 24px rgba(100,70,10,0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      {opt.badge && <span style={{ position: "absolute", top: 12, right: 12, background: `${gold}22`, color: gold, fontSize: 8, padding: "3px 8px", borderRadius: 20, letterSpacing: 1, border: `1px solid ${gold}44` }}>{opt.badge}</span>}
                      <div style={{ fontSize: 32, marginBottom: 12 }}>{opt.icon}</div>
                      <h4 style={{ color: C.textH, fontSize: 16, fontFamily: "'Cormorant Garamond',Georgia,serif", marginBottom: 6 }}>{opt.title}</h4>
                      <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{opt.sub}</p>
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
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${resource === "Pool+Venue" ? gold : cBr}`, background: resource === "Pool+Venue" ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#000", flexShrink: 0 }}>
                    {resource === "Pool+Venue" && "✓"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.textH, fontSize: 13, fontWeight: 600 }}>Also rent the Events Venue</div>
                    <div style={{ color: C.textS, fontSize: 11, marginTop: 2 }}>
                      Exclusive buyout of the events hall alongside your tour · +{fmt(calcVenueFee("Venue"))}
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

                  <label
                    style={{
                      color: gold,
                      fontSize: 10,
                      letterSpacing: 2,
                      display: "block",
                      marginBottom: 10,
                    }}
                  >
                    SELECT DATE
                  </label>

                  <div style={{ marginBottom: 28 }}>
                    <BookingDatePicker
                      bookings={bookings}
                      closedDates={closedDates}
                      selectedDate={date}
                      onSelectDate={(ds) => setDate(ds)}
                      isDark={isDark}
                      guests={guests}
                      resource={resource}
                      tier={tier}
                    />

                    {date && !dateOk && (
                      <p style={{ color: "#e55", fontSize: 12, marginTop: 6 }}>
                        ⚠ {dateCapacity.reason ?? "This date is unavailable. Please choose another."}
                      </p>
                    )}

                    {date && dateOk && (
                      <p style={{ color: "#4caf50", fontSize: 12, marginTop: 6 }}>
                        ✓ Date looks available — please still call ahead to confirm!
                      </p>
                    )}

                    {date && resource !== "Venue" && tier === "Shared" && (
                      <p style={{ color: C.textS, fontSize: 11, marginTop: 6 }}>
                        Shared: {sharedUsage.used} of {sharedUsage.max} spots taken that day.
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
                      <p style={{ color: gold, fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>PACKAGE</p>
                      <p style={{ color: C.textH, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{initialPackage!.title}</p>
                      <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                        Fixed price of <strong style={{ color: gold }}>{fmt(initialPackage!.price)}</strong> for up to{" "}
                        <strong style={{ color: C.textH }}>{initialPackage!.capacity} guests</strong>. Guests, tier and overtime
                        aren't customizable for a package — {requiresRoom ? "just pick your room, date and food next." : "just pick your date and food next."}
                      </p>
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
                      <label
                        style={{
                          color: gold,
                          fontSize: 10,
                          letterSpacing: 2,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        NUMBER OF GUESTS
                      </label>

                      <p
                        style={{
                          color: C.textS,
                          fontSize: 11,
                          marginBottom: 14,
                          opacity: 0.75,
                        }}
                      >
                        How many people will attend?
                      </p>

                      <div
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
                        <p style={{ color: gold, fontSize: 11, marginTop: 12 }}>
                          🔒 Exclusive buyout — fixed at {RESORT_MAX_CAPACITY} guests, {fmt(tourBase - exclusiveDiscount)} flat regardless of how many actually attend.
                        </p>
                      )}
                      {!guestsLocked && guests >= GUESTS_MAX && (
                        <p style={{ color: "#e55", fontSize: 11, marginTop: 6 }}>
                          Maximum {GUESTS_MAX} guests per booking — please call us for larger groups.
                        </p>
                      )}
                      {resource === "Venue" ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "5px 10px", borderRadius: 20, background: "rgba(201,168,76,0.15)", border: `1px solid ${gold}66` }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: gold }}>🔒 EXCLUSIVE — VENUE RENTAL</span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 14 }}>
                          <p style={{ color: C.textS, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 }}>
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
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: 0.8,
                                    border: `1px solid ${active ? (opt === "Exclusive" ? gold : "#4caf50") : cBr}`,
                                    background: active ? (opt === "Exclusive" ? "rgba(201,168,76,0.15)" : "rgba(76,175,80,0.12)") : "transparent",
                                    color: active ? (opt === "Exclusive" ? gold : "#4caf50") : C.textS,
                                  }}
                                >
                                  {opt === "Exclusive" ? "🔒 EXCLUSIVE" : "🤝 SHARED"}
                                  {isDefault ? " (SUGGESTED)" : ""}
                                </button>
                              );
                            })}
                          </div>
                          <p style={{ color: C.textS, fontSize: 10, marginTop: 6, opacity: 0.75, lineHeight: 1.5 }}>
                            {tier === "Exclusive"
                              ? `Whole-resort buyout, fixed at ${RESORT_MAX_CAPACITY} guests — no other booking allowed that date. Earns a discount on the tour rate.`
                              : "Pool shared with other same-day guests — billed per attending head, up to the resort's shared capacity."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* OVERTIME */}
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
                      <label
                        style={{
                          color: gold,
                          fontSize: 10,
                          letterSpacing: 2,
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        OVERTIME HOURS
                      </label>

                      <p
                        style={{
                          color: C.textS,
                          fontSize: 11,
                          marginBottom: 14,
                          opacity: 0.75,
                        }}
                      >
                        Additional hours after {tourType === "Night Tour" ? "12AM" : "5PM"}
                      </p>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <button
                          onClick={() => setOvertime((o) => clamp(o - 1, OVERTIME_MIN, OVERTIME_MAX))}
                          disabled={overtime <= OVERTIME_MIN}
                          aria-label="Fewer overtime hours"
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
                          {overtime}
                        </span>

                        <button
                          onClick={() => setOvertime((o) => clamp(o + 1, OVERTIME_MIN, OVERTIME_MAX))}
                          disabled={overtime >= OVERTIME_MAX}
                          aria-label="More overtime hours"
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

                      {overtime > 0 && (
                        <p style={{ color: "#f5c518", fontSize: 11, marginTop: 12 }}>
                          {overtime}hr OT × ₱500 = {fmt(overtime * 500)}
                        </p>
                      )}
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
                      onClick={() => setStep(4)}
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

            {/* STEP 4 – Rooms + Food & Drinks (both optional, one screen) */}
            {step === 4 && (
              <div>
                {showRoomPicker && (
                <>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>
                  {requiresRoom ? "Choose Your Room" : "Add a Room?"} <span style={{ color: C.textB, fontSize: 14, fontWeight: 800 }}>{requiresRoom ? "(Required)" : "(Optional)"}</span>
                </h3>
                <p style={{ color: C.textS, fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>
                  {requiresRoom
                    ? `Pick the one room included with this package — ${Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}% off its normal rate.`
                    : "Rooms are rented separately from the pool. Optional add-on."}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                  {bookableRooms.length === 0 && (
                    <p style={{ color: C.textS, fontSize: 12 }}>No rooms are currently available — please check back later or call us.</p>
                  )}
                  {bookableRooms.map((r) => {
                    const sel = selRooms.includes(r.id);
                    const discountedPrice = requiresRoom ? Math.round(r.price * (1 - ROOM_BUNDLE_DISCOUNT_PCT)) : r.price;
                    return (
                      <div key={r.id} onClick={() => toggleRoom(r.id)} style={{ background: sel ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)") : C.bgCard2, border: `1px solid ${sel ? gold : C.border}`, borderRadius: 10, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "all .2s" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.img} alt={r.name} style={{ width: 72, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: C.textH, fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
                          <div style={{ color: C.textS, fontSize: 12 }}>🛏 {r.beds} · 👥 Up to {r.capacity}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {requiresRoom && <div style={{ color: C.textXS, fontSize: 11, textDecoration: "line-through" }}>{fmt(r.price)}</div>}
                          <div style={{ color: gold, fontWeight: 700, fontSize: 15 }}>{fmt(discountedPrice)}</div>
                          <div style={{ marginTop: 6, width: 22, height: 22, borderRadius: requiresRoom ? 6 : "50%", border: `2px solid ${sel ? gold : C.border}`, background: sel ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: sel ? "#000" : "transparent", marginLeft: "auto" }}>✓</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {requiresRoom && selRooms.length === 0 && (
                  <p style={{ color: "#e55", fontSize: 12, marginTop: -16, marginBottom: 20 }}>⚠ Please pick a room to continue.</p>
                )}
                </>
                )}

                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>Add Food & Drinks? <span style={{ color: C.textB, fontSize: 14, fontWeight: 800 }}>(Optional)</span></h3>
                <p style={{ color: C.textS, fontSize: 13, marginBottom: 8, lineHeight: 1.7 }}>
                  {resource === "Venue"
                    ? "No catering — combo meals or self-orders only."
                    : "Pre-order from our menu — it'll be ready when you arrive. You can skip this and order on-site instead."}
                </p>
                <p style={{ color: gold, fontSize: 11, marginBottom: 20, lineHeight: 1.6 }}>
                  {hasComboItem(foodOrder, menuItems)
                    ? "✓ Combo discount applied — see the price breakdown on the next step."
                    : "🍽 Order a Combo item to unlock a discount on your whole food order."}
                </p>
                {menuItems.length === 0 && (
                  <p style={{ color: C.textS, fontSize: 12, marginBottom: 20 }}>No menu items yet.</p>
                )}
                {/* Every item is listed, sellable or not, so a guest can see WHY
                    something isn't orderable (marked out by staff, or out of an
                    ingredient) instead of it silently disappearing. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, maxHeight: 380, overflowY: "auto" }}>
                  {menuItems.map((m) => {
                    const qty = foodQty[m.id] || 0;
                    const sellable = isMenuItemSellable(m, inventory);
                    return (
                      <div key={m.id} style={{ opacity: sellable ? 1 : 0.55, background: qty > 0 ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)") : C.bgCard2, border: `1px solid ${qty > 0 ? gold : C.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.img} alt={m.name} style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.textH, fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                          <div style={{ color: C.textS, fontSize: 11 }}>
                            {fmt(m.price)} · <span style={{ opacity: 0.75 }}>{m.category}</span>
                            {!sellable && <span style={{ color: "#e55", marginLeft: 6, fontWeight: 600 }}>UNAVAILABLE</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => setFoodItemQty(m.id, qty - 1)} disabled={qty <= 0} aria-label={`Fewer ${m.name}`} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", fontSize: 14 }}>−</button>
                          <span style={{ color: C.textH, fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{qty}</span>
                          <button onClick={() => setFoodItemQty(m.id, qty + 1)} disabled={!sellable} aria-label={`More ${m.name}`} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: sellable ? "pointer" : "not-allowed", fontSize: 14 }}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {venueFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ color: C.textS, fontSize: 12 }}>Event Venue Rental</span>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{fmt(venueFee)}</span>
                  </div>
                )}
                {foodTotal > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 20 }}>
                    <span style={{ color: C.textS, fontSize: 12 }}>Food & Drinks Subtotal</span>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{fmt(foodTotal)}</span>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(3)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                  <button
                    disabled={requiresRoom && selRooms.length === 0}
                    onClick={() => setStep(5)}
                    style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: requiresRoom && selRooms.length === 0 ? 0.4 : 1 }}
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
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>FULL NAME</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => handleName(e.target.value)}
                        maxLength={NAME_MAX}
                        placeholder="Juan Dela Cruz"
                        autoComplete="name"
                        className="sw-input"
                        style={{
                          ...inpS,
                          paddingRight: 52,
                          border: form.name && !isValidName(form.name)
                            ? "1px solid rgba(229,85,85,0.6)"
                            : inpS.border,
                        }}
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: form.name.length >= NAME_MAX ? "#e55" : C.textS, fontWeight: 700, fontFamily: "monospace" }}>
                        {form.name.length}/{NAME_MAX}
                      </span>
                    </div>
                    {form.name && !isValidName(form.name) && (
                      <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Please enter your full name (letters only)</p>
                    )}
                    {form.name && isValidName(form.name) && (
                      <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Valid</p>
                    )}
                  </div>
                  <div>
                    <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>EMAIL ADDRESS</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setF("email", e.target.value)}
                      placeholder="example@email.com"
                      className="sw-input"
                      style={{
                        ...inpS,
                        border:
                          form.email && !isValidEmail(form.email)
                            ? "1px solid rgba(229,85,85,0.6)" 
                            : inpS.border 
                      }}
                    />
                    {form.email && !isValidEmail(form.email) && (
                      <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Please enter a valid email address</p>
                    )}
                    {form.email && isValidEmail(form.email) && (
                      <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Valid email</p>
                    )}
                  </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>CONTACT NUMBER</label>
                  <div style={{ position: "relative" }}>
                    <input type="tel" value={form.contact} onChange={(e) => handleContact(e.target.value)} maxLength={11} placeholder="09XXXXXXXXX" className="sw-input" style={{ ...inpS, paddingRight: 52 }} />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: form.contact.length === 11 ? "#4caf50" : form.contact.length > 0 ? "#f5c518" : C.textS, fontWeight: 700, fontFamily: "monospace" }}>{form.contact.length}/11</span>
                  </div>
                  {form.contact.length > 0 && form.contact.length < 11 && <p style={{ color: "#f5c518", fontSize: 11, marginTop: 4 }}>⚠ Must be 11 digits</p>}
                  {form.contact.length === 11 && !isValidPHNumber(form.contact) && <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Must start with 09</p>}
                  {isValidPHNumber(form.contact) && <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Valid</p>}
                </div>
                  
                  <div>
                    <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>SPECIAL NOTES (OPTIONAL)</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => handleNotes(e.target.value)}
                      maxLength={NOTES_MAX}
                      rows={3}
                      placeholder="Anything we should know? (optional)"
                      className="sw-input"
                      style={{ ...inpS, resize: "none", minHeight: 88 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      <span style={{ color: form.notes.length >= NOTES_MAX ? "#e55" : C.textXS, fontSize: 10, fontFamily: "monospace" }}>
                        {form.notes.length}/{NOTES_MAX}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Summary — an itemized liquidation rather than one lump
                    total, so a guest can see exactly what each peso is for
                    before paying. */}
                <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
                  <p style={{ color: C.textS, fontSize: 9, letterSpacing: 2, marginBottom: 12 }}>BOOKING DETAILS</p>
                  {[["Date", fmtDate(date)], ["Guests", `${guests} pax`], ["Package", packageLabel], ["Tier", tier]].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.textS, fontSize: 12 }}>{l}</span>
                      <span style={{ color: C.textH, fontSize: 12, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}

                  <p style={{ color: C.textS, fontSize: 9, letterSpacing: 2, marginTop: 16, marginBottom: 10 }}>PRICE BREAKDOWN</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {isPackage ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: C.textS, fontSize: 12 }}>
                            {initialPackage!.title} (package{initialPackage!.listPrice ? ", bundle discount included" : ""})
                          </span>
                          <span style={{ color: C.textB, fontSize: 12 }}>
                            {initialPackage!.listPrice && (
                              <span style={{ textDecoration: "line-through", color: C.textS, marginRight: 6 }}>{fmt(initialPackage!.listPrice)}</span>
                            )}
                            {fmt(initialPackage!.price)}
                          </span>
                        </div>
                        {selectedRoomDetails.map((r) => (
                          <div key={r.id} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: C.textS, fontSize: 12 }}>Room — {r.name} (bundled)</span>
                            <span style={{ color: C.textB, fontSize: 12 }}>
                              {requiresRoom && (
                                <span style={{ textDecoration: "line-through", color: C.textS, marginRight: 6 }}>{fmt(r.price)}</span>
                              )}
                              {fmt(roomsFee)}
                            </span>
                          </div>
                        ))}
                        {roomBundleDiscount > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#4caf50", fontSize: 12 }}>Room bundle discount (-{Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}%)</span>
                            <span style={{ color: "#4caf50", fontSize: 12 }}>-{fmt(roomBundleDiscount)}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {resource !== "Venue" && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: C.textS, fontSize: 12 }}>
                              {tier === "Exclusive" ? "Exclusive buyout (flat rate)" : `Shared tour (${guests} × ${fmt(200)})`}
                            </span>
                            <span style={{ color: C.textB, fontSize: 12 }}>{fmt(tourBase)}</span>
                          </div>
                        )}
                        {exclusiveDiscount > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#4caf50", fontSize: 12 }}>Exclusive discount (-{Math.round((exclusiveDiscount / tourBase) * 100)}%)</span>
                            <span style={{ color: "#4caf50", fontSize: 12 }}>-{fmt(exclusiveDiscount)}</span>
                          </div>
                        )}
                        {overtimeFee > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: C.textS, fontSize: 12 }}>Overtime ({overtime}hr × {fmt(500)})</span>
                            <span style={{ color: C.textB, fontSize: 12 }}>{fmt(overtimeFee)}</span>
                          </div>
                        )}
                        {selectedRoomDetails.map((r) => (
                          <div key={r.id} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: C.textS, fontSize: 12 }}>Room — {r.name}</span>
                            <span style={{ color: C.textB, fontSize: 12 }}>{fmt(r.price)}</span>
                          </div>
                        ))}
                        {venueFee > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: C.textS, fontSize: 12 }}>Event venue rental</span>
                            <span style={{ color: C.textB, fontSize: 12 }}>{fmt(venueFee)}</span>
                          </div>
                        )}
                      </>
                    )}
                    {foodOrder.map((f) => (
                      <div key={f.itemId} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.textS, fontSize: 12 }}>{f.name} × {f.qty}</span>
                        <span style={{ color: C.textB, fontSize: 12 }}>{fmt(f.price * f.qty)}</span>
                      </div>
                    ))}
                    {comboDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#4caf50", fontSize: 12 }}>Combo meal discount (-{Math.round(COMBO_DISCOUNT_PCT * 100)}%)</span>
                        <span style={{ color: "#4caf50", fontSize: 12 }}>-{fmt(comboDiscount)}</span>
                      </div>
                    )}
                    {packageFoodDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#4caf50", fontSize: 12 }}>Package food discount (-{Math.round((initialPackage?.foodDiscountPct ?? 0) * 100)}%)</span>
                        <span style={{ color: "#4caf50", fontSize: 12 }}>-{fmt(packageFoodDiscount)}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>Total</span>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{fmt(total)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ color: C.textS, fontSize: 12 }}>50% Down payment (due now)</span>
                    <span style={{ color: "#ff9800", fontWeight: 700, fontSize: 12 }}>{fmt(down)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: C.textS, fontSize: 12 }}>Remaining balance (due on visit)</span>
                    <span style={{ color: C.textB, fontSize: 12, fontWeight: 600 }}>{fmt(total - down)}</span>
                  </div>
                </div>
                {!dateOk && (
                  <p style={{ color: "#e55", fontSize: 12, marginBottom: 10 }}>
                    ⚠ {describeDateProblem(date) ?? "That date is no longer available — please pick another."}
                  </p>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(4)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                  <button
                    // dateOk is re-checked here as well as at step 2: the guest may
                    // have sat on this screen past midnight, or the date may have
                    // been taken in the meantime.
                    disabled={!!validateBookingForm(form) || !dateOk}
                    onClick={() => setShowGcashWarning(true)}
                    style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: validateBookingForm(form) || !dateOk ? 0.4 : 1 }}
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
                    <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.8, marginBottom: 28, maxWidth: 320 }}>Your payment window has expired. Please go back and try again.</p>
                    <button onClick={() => { setQrExpired(false); setQrRetryKey((k) => k + 1); }} style={{ ...goldBtn, padding: "13px 32px", letterSpacing: 2, borderRadius: 6 }}>TRY AGAIN</button>
                  </div>
                )}
                {/* GCash header */}
                <div style={{ background: "linear-gradient(135deg,#00a952,#007a3d)", borderRadius: "8px 8px 0 0", marginTop: mob ? -20 : -40, marginLeft: mob ? -16 : -40, marginRight: mob ? -16 : -40, marginBottom: 0, padding: mob ? "18px 20px" : "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontSize: 16, fontWeight: 900 }}>G</span></div>
                    <div><div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>GCash Payment</div><div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Scan to pay with GCash app</div></div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
                    <div style={{ color: qrSeconds <= 60 ? "#ff6b6b" : "rgba(255,255,255,0.7)", fontSize: 9, letterSpacing: 2, marginBottom: 2 }}>EXPIRES IN</div>
                    <div style={{ color: qrSeconds <= 60 ? "#ff6b6b" : "#fff", fontSize: mob ? 18 : 22, fontWeight: 700, fontFamily: "monospace", letterSpacing: 2 }}>{fmtTimer(qrSeconds)}</div>
                  </div>
                </div>
                <div style={{ padding: mob ? "24px 0 0" : "32px 0 0", display: "flex", flexDirection: mob ? "column" : "row", gap: mob ? 24 : 32, alignItems: "flex-start" }}>
                  {/* QR */}
                  <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: mob ? "100%" : "auto" }}>
                    <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 8px 32px rgba(0,169,82,0.15),0 2px 8px rgba(0,0,0,0.1)", border: "2px solid rgba(0,169,82,0.15)" }}>
                      <svg width={mob ? 200 : 220} height={mob ? 200 : 220} viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
                        <rect width="220" height="220" fill="#fff" />
                        <rect x="10" y="10" width="56" height="56" rx="4" fill="#000" /><rect x="18" y="18" width="40" height="40" rx="2" fill="#fff" /><rect x="24" y="24" width="28" height="28" rx="1" fill="#000" />
                        <rect x="154" y="10" width="56" height="56" rx="4" fill="#000" /><rect x="162" y="18" width="40" height="40" rx="2" fill="#fff" /><rect x="168" y="24" width="28" height="28" rx="1" fill="#000" />
                        <rect x="10" y="154" width="56" height="56" rx="4" fill="#000" /><rect x="18" y="162" width="40" height="40" rx="2" fill="#fff" /><rect x="24" y="168" width="28" height="28" rx="1" fill="#000" />
                        {[76,84,92,100,108,116,124,132,140,148].map(x=>[10,18,26,34,42,50,58,66].map(y=>((x+y)%17===0||(x*y)%13===0||(x+y*2)%11===0)?<rect key={`${x}${y}`} x={x} y={y} width="7" height="7" fill="#000"/>:null))}
                        {[10,18,26,34,42,50,58,66].map(x=>[76,84,92,100,108,116,124,132,140,148].map(y=>((x+y)%13===0||(x*y)%17===0||(x*2+y)%11===0)?<rect key={`${x}${y}b`} x={x} y={y} width="7" height="7" fill="#000"/>:null))}
                        {[76,84,92,100,108,116,124,132,140,148].map(x=>[76,84,92,100,108,116,124,132,140,148].map(y=>((x+y)%7===0||(x*y)%19===0||(x-y+200)%11===0)?<rect key={`${x}${y}c`} x={x} y={y} width="7" height="7" fill="#000"/>:null))}
                        {[76,92,108,124,140].map(x=><rect key={`t${x}`} x={x} y="154" width="7" height="7" fill="#000"/>)}
                        {[76,92,108,124,140].map(y=><rect key={`tr${y}`} x="154" y={y} width="7" height="7" fill="#000"/>)}
                        <rect x="93" y="93" width="34" height="34" rx="6" fill="#00a952" />
                        <text x="110" y="115" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="Arial,sans-serif">G</text>
                      </svg>
                    </div>
                    <div style={{ background: isDark ? "rgba(0,169,82,0.08)" : "rgba(0,169,82,0.06)", border: "1px solid rgba(0,169,82,0.2)", borderRadius: 8, padding: "8px 16px", textAlign: "center" }}>
                      <div style={{ color: "#00a952", fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 2 }}>AMOUNT DUE (50% DOWN)</div>
                      <div style={{ color: isDark ? "#fff" : "#111", fontSize: mob ? 22 : 26, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>₱{down.toLocaleString()}</div>
                    </div>
                    <p style={{ color: C.textS, fontSize: 11, textAlign: "center", maxWidth: 220, lineHeight: 1.6 }}>Open your <strong style={{ color: isDark ? "#ccc" : "#333" }}>GCash app</strong> → tap <strong style={{ color: isDark ? "#ccc" : "#333" }}>Scan QR</strong> → point your camera at the code above</p>
                  </div>
                  {/* Order summary */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.textS, fontSize: 9, letterSpacing: 3, marginBottom: 14 }}>ORDER SUMMARY</div>
                    <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                      {[["Ref ID", `SW-${10007 + bookings.length}`], ["Guest", form.name], ["Date", date], ["Package", packageLabel]].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                          <span style={{ color: C.textS, fontSize: 11 }}>{l}</span>
                          <span style={{ color: l === "Ref ID" ? gold : C.textH, fontSize: 11, fontWeight: l === "Ref ID" ? 700 : 500, fontFamily: l === "Ref ID" ? "monospace" : "inherit" }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                        <span style={{ color: C.textS, fontSize: 11 }}>Guests</span>
                        <span style={{ color: C.textH, fontSize: 11 }}>{guests} pax{overtime > 0 ? ` · +${overtime}hr OT` : ""}</span>
                      </div>
                      {foodTotal > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                          <span style={{ color: C.textS, fontSize: 11 }}>Food & Drinks</span>
                          <span style={{ color: C.textH, fontSize: 11 }}>{fmt(foodTotal)}</span>
                        </div>
                      )}
                      <div style={{ padding: "12px 14px", background: isDark ? "#0d0c09" : "#ece6db" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: C.textS, fontSize: 11 }}>Full Total</span><span style={{ color: C.textH, fontSize: 11, fontWeight: 600 }}>{fmt(total)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#00a952", fontSize: 12, fontWeight: 700 }}>50% Down Due Now</span><span style={{ color: "#00a952", fontSize: 14, fontWeight: 700 }}>{fmt(down)}</span></div>
                      </div>
                    </div>
                    <div style={{ background: "rgba(229,85,85,0.05)", border: "1px solid rgba(229,85,85,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
                      <span style={{ color: C.textS, fontSize: 11, lineHeight: 1.7 }}>Do not close this page while paying. QR expires in <strong style={{ color: qrSeconds <= 60 ? "#e55" : gold }}>{fmtTimer(qrSeconds)}</strong>.</span>
                    </div>
                    {/* "I've completed payment" → shows confirm modal */}
                    <button onClick={confirmOnline} style={{ ...goldBtn, width: "100%", padding: 14, borderRadius: 6, letterSpacing: 1.5, fontSize: 12 }}>✓ I'VE COMPLETED PAYMENT</button>
                    <p style={{ color: C.textS, fontSize: 11, textAlign: "center", marginTop: 10 }}>Tap above once your GCash payment is done.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7 – Online Done (auto-redirect, shown briefly) */}
            {step === 7 && (
              <div style={{ padding: "8px 0", textAlign: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(0,169,82,0.1)", border: "1px solid rgba(0,169,82,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
                <h3 style={{ color: C.textH, fontSize: 24, fontWeight: 400, marginBottom: 10, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>Booking Submitted!</h3>
                <p style={{ color: C.textS, fontSize: 14, marginBottom: 24 }}>Your booking is <span style={{ color: "#f5c518", fontWeight: 600 }}>Paid</span> pending payment verification.</p>

                {/* Reference ID — prominent at top */}
                <div style={{ background: isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.06)", border: `1px solid ${gold}55`, borderRadius: 12, padding: "20px 24px", marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <p style={{ color: C.textS, fontSize: 10, letterSpacing: 3, margin: 0 }}>YOUR REFERENCE ID</p>
                  <p style={{ color: gold, fontFamily: "monospace", fontSize: 28, fontWeight: 700, letterSpacing: 3, margin: 0 }}>{bookingId}</p>
                  <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>Save this — you'll need it for follow-ups.</p>
                </div>

                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20, textAlign: "left" }}>
                  <div style={{ background: isDark ? "#0f0e0b" : "#f5f0e8", padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.textS, fontSize: 12, fontWeight: 600 }}>What Happens Next</span></div>
                  <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {[["1", "Send your GCash screenshot to our contact number."], ["2", "Admin will verify and confirm within 24 hours."], ["3", "You'll receive confirmation once approved."]].map(([n, txt]) => (
                      <div key={n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${gold}22`, border: `1px solid ${gold}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: gold, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{n}</div>
                        <span style={{ color: C.textB, fontSize: 13, lineHeight: 1.6 }}>{txt}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p style={{ color: C.textS, fontSize: 12, marginBottom: 20 }}>⚠ No refunds. Full payment of {fmt(total)} is also accepted.</p>
                <p style={{ color: C.textS, fontSize: 12 }}>Redirecting you to the home page…</p>
              </div>
            )}

          </div>
        </div>

        {/* ── MODAL: GCash No-Refund Warning (Step 5 → 6) ──
            Portaled into document.body — see Home.tsx's package modal for
            why: a fixed-position modal nested inside the ordinary page tree
            can get silently hijacked by any ancestor that ends up with a
            non-"none" transform (page-load animations, hover effects...),
            which resizes/repositions it against that ancestor's box instead
            of the viewport. A portal removes the ancestor chain entirely. */}
        {showGcashWarning && portalReady && createPortal(
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", zIndex: 500, padding: mob ? "20px" : "40px 20px" }}
            role="dialog" aria-modal="true" aria-labelledby="gcash-warning-title"
          >
            <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: "1px solid rgba(76,175,80,0.3)", borderRadius: 14, padding: mob ? "28px 20px" : "36px", width: "100%", maxWidth: 420, margin: "auto 0", boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
              {/* Icon */}
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(76,175,80,0.1)", border: "2px solid rgba(76,175,80,0.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 28 }}>
                ⚠️
              </div>

              <h3 id="gcash-warning-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 400, marginBottom: 8 }}>
                Before You Proceed
              </h3>
              <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
                Please read and understand the following payment policy before continuing to the GCash payment step.
              </p>

              {/* Policy box — green highlighted */}
              <div style={{ background: "rgba(76,175,80,0.07)", border: "1.5px solid rgba(76,175,80,0.4)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                  <span style={{ color: "#4caf50", fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>PAYMENT POLICY</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#4caf50", fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>❌</span>
                    <span style={{ color: C.textH, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                      No Refunds — All payments are non-refundable once submitted.
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#4caf50", fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>💰</span>
                    <span style={{ color: C.textH, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                      50% Down Payment — Only half the total is required now. The remaining balance is due on the day of your visit.
                    </span>
                  </div>
                  <div style={{ height: 1, background: "rgba(76,175,80,0.2)", marginTop: 4 }} />
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#4caf50", fontSize: 12, flexShrink: 0, marginTop: 2 }}>📅</span>
                    <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>
                      Rescheduling is subject to availability and must be discussed with the admin directly.
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkbox acknowledgement */}
              <div
                onClick={() => setPolicyChecked((v) => !v)}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, background: policyChecked ? "rgba(76,175,80,0.06)" : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1.5px solid ${policyChecked ? "rgba(76,175,80,0.5)" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 18, cursor: "pointer", transition: "all .2s", userSelect: "none" }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${policyChecked ? "#4caf50" : isDark ? "#444" : "#bbb"}`, background: policyChecked ? "#4caf50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all .2s" }}>
                  {policyChecked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>
                  I have read and understood the payment policy. I agree that <strong style={{ color: C.textH }}>all payments are non-refundable</strong> and that a <strong style={{ color: C.textH }}>50% down payment</strong> is required to confirm my booking.
                </span>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 18 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowGcashWarning(false); setPolicyChecked(false); }}
                  style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${C.border}`, padding: "12px 16px", fontSize: 11, cursor: "pointer", borderRadius: 8, letterSpacing: 1 }}
                >
                  CANCEL
                </button>
                <button
                  disabled={!policyChecked}
                  onClick={() => { setShowGcashWarning(false); setPolicyChecked(false); setStep(6); }}
                  style={{ flex: 2, background: policyChecked ? "rgba(76,175,80,0.12)" : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", color: policyChecked ? "#4caf50" : C.textS, border: `1px solid ${policyChecked ? "rgba(76,175,80,0.35)" : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`, padding: "12px 16px", fontSize: 11, fontWeight: 700, cursor: policyChecked ? "pointer" : "not-allowed", borderRadius: 8, letterSpacing: 1.5, transition: "all .2s", opacity: policyChecked ? 1 : 0.5 }}
                >
                  ✓ YES, I UNDERSTAND
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </div>
    );
  }
