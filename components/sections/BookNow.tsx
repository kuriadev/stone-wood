"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt, calcTotal, genBookingId, fmtTimer, fmtDate } from "@/lib/utils";
import { BookingDatePicker } from "@/components/booking/BookingDatePicker";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";

interface BookNowProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  closedDates: string[];
  preselectedRoom?: number | null;
  clearPreselected?: () => void;
  preselectedDate?: string;
  clearPreselectedDate?: () => void;
  onGoHome?: () => void;
}

export function BookNow({
  bookings, setBookings, rooms, closedDates,
  preselectedRoom, clearPreselected,
  preselectedDate, clearPreselectedDate,
  onGoHome,
}: BookNowProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;

  const [method, setMethod] = useState<null | "online" | "onsite">(null);
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(preselectedDate || "");
  const [guests, setGuests] = useState(10);
  const [overtime, setOvertime] = useState(0);
  const [selRooms, setSelRooms] = useState<number[]>(preselectedRoom ? [preselectedRoom] : []);
  const [form, setFormState] = useState({ name: "", email: "", contact: "", notes: "" });
  const [bookingId, setBookingId] = useState("");
  const [osForm, setOsFormState] = useState({ name: "", contact: "", email: "", date: "" });
  const [qrSeconds, setQrSeconds] = useState(600);
  const [qrExpired, setQrExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [gcashSelected, setGcashSelected] = useState(false);

  // Modal states
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [showGcashWarning, setShowGcashWarning] = useState(false);
  const [showOnsiteConfirm, setShowOnsiteConfirm] = useState(false);
  const [pendingOnsiteId, setPendingOnsiteId] = useState("");

  const setF = (k: string, v: string) => setFormState((f) => ({ ...f, [k]: v }));
  const setOsF = (k: string, v: string) => setOsFormState((f) => ({ ...f, [k]: v }));

  const bookedDates = bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date);
  const closedSet = new Set(closedDates);
  const dateOk = date && !bookedDates.includes(date) && !closedSet.has(date);
  const total = calcTotal(guests, overtime, selRooms, rooms);
  const down = Math.ceil(total / 2);
  const toggleRoom = (id: number) => setSelRooms((r) => r.includes(id) ? r.filter((x) => x !== id) : [...r, id]);
  const handleContact = (v: string) => setF("contact", v.replace(/\D/g, "").slice(0, 11));
  const handleOsContact = (v: string) => setOsF("contact", v.replace(/\D/g, "").slice(0, 11));

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
  }, [step]);

  // Called after payment confirm modal is accepted
  const confirmOnline = () => {
    const id = genBookingId(bookings.length);
    setBookingId(id);
    setBookings((b) => [...b, {
      id, name: form.name, contact: form.contact, email: form.email,
      date, guests, package: selRooms.length > 0 ? "Day Tour + Room" : "Day Tour",
      rooms: selRooms, overtime, total, downpayment: down,
      status: "On Hold", paymentProof: false, notes: form.notes, createdAt: Date.now(),
    }]);
    clearPreselected?.(); clearPreselectedDate?.();
    if (timerRef.current) clearInterval(timerRef.current);
    setShowPaymentConfirm(false);
    setStep(7);
  };

  // Pre-generate ID and show onsite confirm modal
  const requestOnsiteConfirm = () => {
    const id = genBookingId(bookings.length);
    setPendingOnsiteId(id);
    setShowOnsiteConfirm(true);
  };

  // Called after onsite confirm modal is accepted
  const confirmOnsite = () => {
    setBookings((b) => [...b, {
      id: pendingOnsiteId,
      name: osForm.name, contact: osForm.contact,
      email: osForm.email || "—", date: osForm.date || "—",
      guests: 1, package: "On-Site Reservation", rooms: [],
      overtime: 0, total: 0, downpayment: 0,
      status: "On Hold", paymentProof: false,
      notes: "On-site reservation — payment upon arrival",
      createdAt: Date.now(),
    }]);
    setBookingId(pendingOnsiteId);
    clearPreselected?.(); clearPreselectedDate?.();
    setShowOnsiteConfirm(false);
    toast("On-site reservation confirmed! Redirecting to home…", "success");
    // Redirect to home after short delay so toast is visible
    setTimeout(() => { onGoHome?.(); }, 2200);
  };

  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const cBr = isDark ? "#2a2520" : "#d6cfc4";

  const stepLabelsOnline = ["Method", "e-Wallet", "Details", "Rooms", "Review", "GCash", "Done"];
  const stepLabelsOnsite = ["Method", "Your Info", "Visit Info"];
  const stepIdxOnline: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };
  const stepIdxOnsite: Record<number, number> = { 1: 0, 10: 1, 11: 2 };
  const labels = method === "onsite" ? stepLabelsOnsite : stepLabelsOnline;
  const currentIdx = method === "onsite" ? (stepIdxOnsite[step] ?? 0) : (stepIdxOnline[step] ?? 0);

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
          <span style={{ color: C.textS, fontSize: 13 }}>Resort Hours: <strong style={{ color: C.textB }}>8:00 AM – 5:00 PM</strong></span>
        </div>

        {/* Step indicator */}
        {method !== null && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 32, overflowX: "auto" }}>
            {labels.map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: i < currentIdx ? gold : "transparent", border: i === currentIdx ? `2px solid ${gold}` : i < currentIdx ? "none" : `1px solid ${isDark ? "#2a2520" : "#d6cfc4"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: i < currentIdx ? "#000" : i === currentIdx ? gold : C.textXS, fontWeight: 700, flexShrink: 0 }}>
                    {i < currentIdx ? "✓" : i + 1}
                  </div>
                  <span style={{ color: i === currentIdx ? gold : C.textXS, fontSize: mob ? 8 : 9, letterSpacing: 1, whiteSpace: "nowrap" }}>{label.toUpperCase()}</span>
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

          {/* STEP 1 – Method */}
          {step === 1 && (
            <div>
              <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>How would you like to reserve?</h3>
              <p style={{ color: C.textS, fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>Choose how you'd like to make your reservation.</p>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14 }}>
                {[
                  { id: "online", icon: "💳", title: "Book Online", sub: "Reserve now via GCash. 50% down payment required.", badge: "RECOMMENDED" },
                  { id: "onsite", icon: "🏡", title: "On-Site Visit", sub: "Call ahead and pay in full or 50% upon arrival.", badge: "" },
                ].map((opt) => (
                  <div key={opt.id} onClick={() => { setMethod(opt.id as "online" | "onsite"); setStep(opt.id === "online" ? 2 : 10); }}
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
            </div>
          )}

          {/* STEP 2 – e-Wallet */}
          {step === 2 && (
            <div>
              <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>Select Payment Method</h3>
              <p style={{ color: C.textS, fontSize: 13, marginBottom: 24 }}>We currently accept GCash for online reservations.</p>

              {/* GCash button — 3 states: unselected (dark) → hover (green highlight) → selected (solid green) */}
              <div
                onClick={() => {
                  if (!gcashSelected) {
                    setGcashSelected(true);
                    // brief green confirmation flash then proceed
                    setTimeout(() => setStep(3), 420);
                  }
                }}
                style={{
                  borderRadius: 10,
                  padding: "20px 22px",
                  cursor: gcashSelected ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 16,
                  transition: "background .25s, border-color .25s",
                  background: gcashSelected
                    ? "rgba(0,169,82,0.18)"
                    : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)",
                  border: gcashSelected
                    ? "2px solid rgba(0,169,82,0.8)"
                    : `2px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}`,
                }}
                onMouseEnter={(e) => {
                  if (gcashSelected) return;
                  e.currentTarget.style.background = "rgba(0,169,82,0.1)";
                  e.currentTarget.style.borderColor = "rgba(0,169,82,0.55)";
                }}
                onMouseLeave={(e) => {
                  if (gcashSelected) return;
                  e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
                  e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";
                }}
              >
                {/* GCash icon — grey when unselected, green when selected */}
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: gcashSelected ? "#00a952" : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
                  transition: "background .25s",
                }}>
                  <span style={{ color: gcashSelected ? "#fff" : C.textS, fontSize: 20, fontWeight: 900 }}>G</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: gcashSelected ? "#00a952" : C.textH, fontSize: 15, fontWeight: 600, marginBottom: 2, transition: "color .25s" }}>GCash</div>
                  <div style={{ color: C.textS, fontSize: 12 }}>Scan QR code · Instant confirmation</div>
                </div>
                {/* Checkmark — only visible when selected */}
                <div style={{ color: "#00a952", fontSize: 18, opacity: gcashSelected ? 1 : 0, transition: "opacity .25s" }}>✓</div>
              </div>

              <button onClick={() => { setGcashSelected(false); setStep(1); }} style={{ ...outBtn, width: "100%", padding: 12, borderRadius: 6, marginTop: 8 }}>← BACK</button>
            </div>
          )}

          {/* STEP 3 – Date & Details */}
          {step === 3 && (
            <div>
              <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 20, fontWeight: 400 }}>Pick Your Date & Details</h3>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 10 }}>SELECT DATE</label>
              <div style={{ marginBottom: 20 }}>
                <BookingDatePicker bookings={bookings} closedDates={closedDates} selectedDate={date} onSelectDate={(ds) => setDate(ds)} isDark={isDark} />
                {date && !dateOk && <p style={{ color: "#e55", fontSize: 12, marginTop: 6 }}>⚠ This date is unavailable. Please choose another.</p>}
                {date && dateOk && <p style={{ color: "#4caf50", fontSize: 12, marginTop: 6 }}>✓ Date available!</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>NUMBER OF GUESTS</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => setGuests((g) => Math.max(1, g - 1))} style={{ width: 36, height: 36, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span style={{ color: C.textH, fontSize: 18, fontWeight: 700, minWidth: 40, textAlign: "center" }}>{guests}</span>
                    <button onClick={() => setGuests((g) => g + 1)} style={{ width: 36, height: 36, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                  {guests > 30 && <p style={{ color: "#f5c518", fontSize: 11, marginTop: 6 }}>+{guests - 30} extra guests × ₱100 = {fmt((guests - 30) * 100)}</p>}
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>OVERTIME HOURS (after 5PM)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => setOvertime((o) => Math.max(0, o - 1))} style={{ width: 36, height: 36, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span style={{ color: C.textH, fontSize: 18, fontWeight: 700, minWidth: 40, textAlign: "center" }}>{overtime}</span>
                    <button onClick={() => setOvertime((o) => o + 1)} style={{ width: 36, height: 36, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                  {overtime > 0 && <p style={{ color: "#f5c518", fontSize: 11, marginTop: 6 }}>{overtime}hr OT × ₱500 = {fmt(overtime * 500)}</p>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(2)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                <button disabled={!date || !dateOk} onClick={() => setStep(4)} style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: !date || !dateOk ? 0.4 : 1 }}>CONTINUE →</button>
              </div>
            </div>
          )}

          {/* STEP 4 – Room Selection */}
          {step === 4 && (
            <div>
              <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>Add a Room? <span style={{ color: C.textXS, fontSize: 14, fontWeight: 300 }}>(Optional)</span></h3>
              <p style={{ color: C.textS, fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>Rooms are rented separately from the pool. Optional add-on.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {rooms.map((r) => {
                  const sel = selRooms.includes(r.id);
                  return (
                    <div key={r.id} onClick={() => toggleRoom(r.id)} style={{ background: sel ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)") : C.bgCard2, border: `1px solid ${sel ? gold : C.border}`, borderRadius: 10, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "all .2s" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.img} alt={r.name} style={{ width: 72, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: C.textH, fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
                        <div style={{ color: C.textS, fontSize: 12 }}>🛏 {r.beds} · 👥 Up to {r.capacity}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: gold, fontWeight: 700, fontSize: 15 }}>{fmt(r.price)}</div>
                        <div style={{ marginTop: 6, width: 22, height: 22, borderRadius: "50%", border: `2px solid ${sel ? gold : C.border}`, background: sel ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: sel ? "#000" : "transparent", marginLeft: "auto" }}>✓</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(3)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                <button onClick={() => setStep(5)} style={{ ...goldBtn, flex: 2, borderRadius: 6 }}>CONTINUE →</button>
              </div>
            </div>
          )}

          {/* STEP 5 – Guest Info */}
          {step === 5 && (
            <div>
              <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 20, fontWeight: 400 }}>Your Information</h3>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 20 }}>
                {[["FULL NAME", "name", "text"], ["EMAIL ADDRESS", "email", "email"]].map(([l, k, t]) => (
                  <div key={k}>
                    <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>{l}</label>
                    <input type={t} value={form[k as keyof typeof form]} onChange={(e) => setF(k, e.target.value)} className="sw-input" style={inpS} />
                  </div>
                ))}
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>CONTACT NUMBER</label>
                  <div style={{ position: "relative" }}>
                    <input type="tel" value={form.contact} onChange={(e) => handleContact(e.target.value)} maxLength={11} placeholder="09XXXXXXXXX" className="sw-input" style={{ ...inpS, paddingRight: 52 }} />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: form.contact.length === 11 ? "#4caf50" : form.contact.length > 0 ? "#f5c518" : C.textXS, fontWeight: 700, fontFamily: "monospace" }}>{form.contact.length}/11</span>
                  </div>
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>SPECIAL NOTES (OPTIONAL)</label>
                  <textarea value={form.notes} onChange={(e) => setF("notes", e.target.value)} rows={2} className="sw-input" style={{ ...inpS, resize: "vertical" }} />
                </div>
              </div>
              {/* Summary */}
              <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
                <p style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 12 }}>BOOKING SUMMARY</p>
                {[["Date", fmtDate(date)], ["Guests", `${guests} pax${overtime > 0 ? ` · +${overtime}hr OT` : ""}`], ["Package", selRooms.length > 0 ? "Day Tour + Room" : "Day Tour"]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: C.textS, fontSize: 12 }}>{l}</span>
                    <span style={{ color: C.textH, fontSize: 12, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>Total</span>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{fmt(total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ color: C.textS, fontSize: 12 }}>50% Down Payment</span>
                  <span style={{ color: "#ff9800", fontWeight: 700, fontSize: 12 }}>{fmt(down)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(4)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                <button
                  disabled={!form.name || !form.email || form.contact.length !== 11}
                  onClick={() => setShowGcashWarning(true)}
                  style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: !form.name || !form.email || form.contact.length !== 11 ? 0.4 : 1 }}
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
                  <button onClick={() => { setStep(2); setQrExpired(false); }} style={{ ...goldBtn, padding: "13px 32px", letterSpacing: 2, borderRadius: 6 }}>TRY AGAIN</button>
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
                  <p style={{ color: C.textXS, fontSize: 11, textAlign: "center", maxWidth: 220, lineHeight: 1.6 }}>Open your <strong style={{ color: isDark ? "#ccc" : "#333" }}>GCash app</strong> → tap <strong style={{ color: isDark ? "#ccc" : "#333" }}>Scan QR</strong> → point your camera at the code above</p>
                </div>
                {/* Order summary */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 3, marginBottom: 14 }}>ORDER SUMMARY</div>
                  <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                    {[["Ref ID", `SW-${10007 + bookings.length}`], ["Guest", form.name], ["Date", date], ["Package", selRooms.length ? "Day Tour + Room" : "Day Tour"]].map(([l, v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                        <span style={{ color: C.textXS, fontSize: 11 }}>{l}</span>
                        <span style={{ color: l === "Ref ID" ? gold : C.textH, fontSize: 11, fontWeight: l === "Ref ID" ? 700 : 500, fontFamily: l === "Ref ID" ? "monospace" : "inherit" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                      <span style={{ color: C.textXS, fontSize: 11 }}>Guests</span>
                      <span style={{ color: C.textH, fontSize: 11 }}>{guests} pax{overtime > 0 ? ` · +${overtime}hr OT` : ""}</span>
                    </div>
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
                  <p style={{ color: C.textXS, fontSize: 11, textAlign: "center", marginTop: 10 }}>Tap above once your GCash payment is done.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 7 – Online Done (auto-redirect, shown briefly) */}
          {step === 7 && (
            <div style={{ padding: "8px 0", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(0,169,82,0.1)", border: "1px solid rgba(0,169,82,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
              <h3 style={{ color: C.textH, fontSize: 24, fontWeight: 400, marginBottom: 10, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>Booking Submitted!</h3>
              <p style={{ color: C.textS, fontSize: 14, marginBottom: 24 }}>Your booking is <span style={{ color: "#f5c518", fontWeight: 600 }}>On Hold</span> pending payment verification.</p>

              {/* Reference ID — prominent at top */}
              <div style={{ background: isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.06)", border: `1px solid ${gold}55`, borderRadius: 12, padding: "20px 24px", marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, margin: 0 }}>YOUR REFERENCE ID</p>
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
              <p style={{ color: C.textXS, fontSize: 12, marginBottom: 20 }}>⚠ No refunds. Full payment of {fmt(total)} is also accepted.</p>
              <p style={{ color: C.textXS, fontSize: 12 }}>Redirecting you to the home page…</p>
            </div>
          )}

          {/* STEP 10 – Onsite Info & Form */}
          {step === 10 && (
            <div>
              <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, marginBottom: 6, fontWeight: 400 }}>On-Site Reservation</h3>
              <p style={{ color: C.textS, fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>Fill in your details and check the calendar for available dates before visiting the resort.</p>
              <div style={{ background: isDark ? "rgba(245,197,24,0.05)" : "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.25)", borderRadius: 10, padding: "16px 18px", marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <span style={{ color: "#f5c518", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>ON-SITE RESERVATION RULES</span>
                </div>
                {["⏰ Resort hours: 8:00 AM – 5:00 PM only.", "📞 Call ahead to confirm staff availability before visiting.", "🗓 Walk-in reservations are subject to date availability.", "💵 Full payment or 50% down is collected upon arrival.", "❌ No refunds once reservation is confirmed on-site.", "📱 Keep your reference number for any follow-up inquiries."].map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: i < 5 ? 8 : 0 }}>
                    <span style={{ color: C.textB, fontSize: 12, lineHeight: 1.7 }}>{r}</span>
                  </div>
                ))}
              </div>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 10 }}>CHECK AVAILABILITY</label>
              <div style={{ marginBottom: 22 }}>
                <BookingDatePicker bookings={bookings} closedDates={closedDates} selectedDate={osForm.date} onSelectDate={(v) => setOsF("date", v)} isDark={isDark} />
                {osForm.date && (bookedDates.includes(osForm.date) || closedSet.has(osForm.date)) && <p style={{ color: "#e55", fontSize: 12, marginTop: 6 }}>⚠ {closedSet.has(osForm.date) ? "This date is closed." : "Date already booked — please pick another."}</p>}
                {osForm.date && !bookedDates.includes(osForm.date) && !closedSet.has(osForm.date) && <p style={{ color: "#4caf50", fontSize: 12, marginTop: 6 }}>✓ Date looks available — please still call ahead to confirm.</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>FULL NAME</label>
                  <input value={osForm.name} onChange={(e) => setOsF("name", e.target.value)} placeholder="Your full name" className="sw-input" style={inpS} />
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>CONTACT NUMBER</label>
                  <div style={{ position: "relative" }}>
                    <input type="tel" value={osForm.contact} onChange={(e) => handleOsContact(e.target.value)} maxLength={11} placeholder="09XXXXXXXXX" className="sw-input" style={{ ...inpS, paddingRight: 52 }} />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: osForm.contact.length === 11 ? "#4caf50" : osForm.contact.length > 0 ? "#f5c518" : C.textXS, fontWeight: 700, fontFamily: "monospace" }}>{osForm.contact.length}/11</span>
                  </div>
                  {osForm.contact.length > 0 && osForm.contact.length < 11 && <p style={{ color: "#f5c518", fontSize: 11, marginTop: 4 }}>⚠ Must be 11 digits</p>}
                  {osForm.contact.length === 11 && <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Valid</p>}
                </div>
                <div>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                    GMAIL ADDRESS <span style={{ color: "#e55", fontSize: 9 }}>*REQUIRED</span>
                  </label>
                  <input
                    type="email"
                    value={osForm.email}
                    onChange={(e) => setOsF("email", e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="sw-input"
                    style={{ ...inpS, borderColor: osForm.email && !osForm.email.toLowerCase().endsWith("@gmail.com") ? "rgba(229,85,85,0.6)" : undefined }}
                  />
                  {osForm.email && !osForm.email.toLowerCase().endsWith("@gmail.com") && (
                    <p style={{ color: "#e55", fontSize: 11, marginTop: 4 }}>⚠ Must be a Gmail address (@gmail.com)</p>
                  )}
                  {osForm.email && osForm.email.toLowerCase().endsWith("@gmail.com") && (
                    <p style={{ color: "#4caf50", fontSize: 11, marginTop: 4 }}>✓ Valid Gmail</p>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(1)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                <button
                  disabled={
                    !osForm.name ||
                    osForm.contact.length !== 11 ||
                    !osForm.email ||
                    !osForm.email.toLowerCase().endsWith("@gmail.com")
                  }
                  onClick={() => setStep(11)}
                  style={{
                    ...goldBtn, flex: 2, borderRadius: 6,
                    opacity: (!osForm.name || osForm.contact.length !== 11 || !osForm.email || !osForm.email.toLowerCase().endsWith("@gmail.com")) ? 0.4 : 1,
                  }}
                >
                  VIEW VISIT INFORMATION
                </button>
              </div>
            </div>
          )}

          {/* STEP 11 – Onsite Visit Info */}
          {step === 11 && (
            <div style={{ padding: "8px 0" }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(74,159,212,0.1)", border: "1px solid rgba(74,159,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 14px" }}>🏡</div>
                <h3 style={{ color: C.textH, fontSize: 22, fontWeight: 400, marginBottom: 6, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>You're Almost Set!</h3>
                <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.7 }}>Please <strong style={{ color: gold }}>call ahead</strong> before visiting to confirm staff availability.</p>
              </div>

              {/* Reference ID — shown prominently BEFORE confirm button */}
              <div style={{ background: isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.06)", border: `2px solid ${gold}66`, borderRadius: 12, padding: "18px 22px", marginBottom: 20, textAlign: "center" }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>📌 YOUR REFERENCE ID — SAVE THIS</p>
                <p style={{ color: gold, fontFamily: "monospace", fontSize: mob ? 22 : 28, fontWeight: 700, letterSpacing: 3, marginBottom: 6 }}>{pendingOnsiteId || `SW-${10007 + bookings.length}`}</p>
                <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>You will need this when you arrive at the resort.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[["📞", "Resort Landline", "(02) 8123-4567", "Call to check availability"], ["📱", "Owner / Admin", "+63 917 123 4567", "Primary contact for reservations"]].map(([icon, label, number, note]) => (
                  <div key={label} style={{ background: isDark ? "rgba(74,159,212,0.06)" : "rgba(74,159,212,0.05)", border: "1px solid rgba(74,159,212,0.2)", borderRadius: 10, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(74,159,212,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
                      <div><div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2 }}>{label.toUpperCase()}</div><div style={{ color: "#4a9fd4", fontSize: 15, fontWeight: 700 }}>{number}</div></div>
                    </div>
                    <p style={{ color: C.textS, fontSize: 11, margin: 0 }}>{note}</p>
                  </div>
                ))}
              </div>

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                <div style={{ background: isDark ? "#0f0e0b" : "#f5f0e8", padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📍</span>
                  <span style={{ color: C.textS, fontSize: 12, fontWeight: 600 }}>Resort Location & Details</span>
                </div>
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["📍", "Address", "Angono, Rizal, Philippines"], ["🕗", "Operating Hours", "8:00 AM – 5:00 PM daily"], ["💵", "Payment on Arrival", "Cash / GCash accepted at resort"], ["🗓", "Reservation Validity", "Date held for 24 hours after call confirmation"]].map(([icon, l, v]) => (
                    <div key={l} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                      <div><div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 2 }}>{l.toUpperCase()}</div><div style={{ color: C.textH, fontSize: 13 }}>{v}</div></div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>RESORT SURROUNDINGS</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {["https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=400&q=80", "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=400&q=80", "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400&q=80"].map((src, i) => (
                    <div key={i} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, aspectRatio: "4/3" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Surroundings ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(10)} style={{ ...outBtn, flex: 1, padding: "12px 10px", borderRadius: 6 }}>BACK</button>
                <button onClick={requestOnsiteConfirm} style={{ ...goldBtn, flex: 2, borderRadius: 6, letterSpacing: 1.5, fontSize: 12 }}>✓ CONFIRM ON-SITE RESERVATION</button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── MODAL: GCash No-Refund Warning (Step 5 → 6) ── */}
      {showGcashWarning && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }}
          role="dialog" aria-modal="true" aria-labelledby="gcash-warning-title"
        >
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: "1px solid rgba(76,175,80,0.3)", borderRadius: 14, padding: mob ? "28px 20px" : "36px", width: "100%", maxWidth: 420, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
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

            <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowGcashWarning(false)}
                style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${C.border}`, padding: "12px 16px", fontSize: 11, cursor: "pointer", borderRadius: 8, letterSpacing: 1 }}
              >
                CANCEL
              </button>
              <button
                onClick={() => { setShowGcashWarning(false); setStep(6); }}
                style={{ flex: 2, background: "rgba(76,175,80,0.12)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.35)", padding: "12px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 8, letterSpacing: 1.5 }}
              >
                ✓ YES, I UNDERSTAND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: On-Site Reservation Confirmation ── */}
      {showOnsiteConfirm && (
        <div style={modalBackdrop}>
          <div style={modalBox}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(74,159,212,0.1)", border: "1px solid rgba(74,159,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 18 }}>🏡</div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Confirm On-Site Reservation</h3>

            {/* Reference ID shown prominently in the modal */}
            <div style={{ background: isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.06)", border: `1px solid ${gold}55`, borderRadius: 10, padding: "14px 18px", marginBottom: 16, textAlign: "center" }}>
              <p style={{ color: C.textXS, fontSize: 9, letterSpacing: 3, marginBottom: 6 }}>YOUR REFERENCE ID</p>
              <p style={{ color: gold, fontFamily: "monospace", fontSize: 24, fontWeight: 700, letterSpacing: 3, marginBottom: 4 }}>{pendingOnsiteId}</p>
              <p style={{ color: C.textS, fontSize: 11, margin: 0 }}>Screenshot or note this down — you'll need it at the resort.</p>
            </div>

            <div style={{ background: isDark ? "rgba(74,159,212,0.05)" : "rgba(74,159,212,0.04)", border: "1px solid rgba(74,159,212,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <p style={{ color: "#4a9fd4", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>🔔 RESORT STAFF NOTIFIED</p>
              <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, margin: 0 }}>Our resort staff has been notified of your on-site reservation request. Please <strong style={{ color: C.textH }}>call ahead</strong> on the day of your visit to confirm availability.</p>
            </div>

            <div style={{ background: isDark ? "rgba(245,197,24,0.05)" : "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 22, display: "flex", gap: 8 }}>
              <span style={{ flexShrink: 0 }}>📱</span>
              <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>Remember: <strong style={{ color: C.textH }}>payment is collected upon arrival</strong>. Full payment or 50% down is required before use of resort facilities.</span>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowOnsiteConfirm(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${C.border}`, padding: "12px 16px", fontSize: 11, cursor: "pointer", borderRadius: 8, letterSpacing: 1 }}>GO BACK</button>
              <button onClick={confirmOnsite} style={{ flex: 2, ...goldBtn, borderRadius: 8, fontSize: 11, letterSpacing: 2 }}>CONFIRM & GO HOME</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
