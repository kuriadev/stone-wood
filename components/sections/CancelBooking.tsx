"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmtDate } from "@/lib/utils";
import type { Booking } from "@/types/booking";

interface ManageBookingProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  onGoHome?: () => void;
}

const CANCEL_REASONS = [
  { icon: "🚨", label: "Emergencies" },
  { icon: "ℹ️", label: "Panic Booking" },
  { icon: "📅", label: "Change of Plans" },
  { icon: "⊙", label: "Other" },
];

export function ManageBooking({ bookings, setBookings }: ManageBookingProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  const [refInput, setRefInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [found, setFound] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelDone, setCancelDone] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleFind = () => {
    setSearched(true);
    setCancelDone(false);
    const match = bookings.find(
      (b) =>
        b.id.toLowerCase() === refInput.trim().toLowerCase() &&
        b.email.toLowerCase() === emailInput.trim().toLowerCase()
    );
    if (match) {
      setFound(match);
      setNotFound(false);
    } else {
      setFound(null);
      setNotFound(true);
    }
  };

  const handleProceedCancel = () => {
    setShowCancelConfirm(true);
  };

  const confirmCancel = () => {
    if (!found) return;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === found.id ? { ...b, status: "Cancelled" } : b
      )
    );
    setFound((prev) => prev ? { ...prev, status: "Cancelled" } : null);
    setCancelDone(true);
    setShowCancelConfirm(false);
  };

  const statusColor = (s: string) => {
    if (s === "Confirmed") return "#4caf50";
    if (s === "On Hold") return "#f5c518";
    if (s === "Cancelled") return "#e55555";
    if (s === "Completed") return "#4a9fd4";
    return "#888";
  };

  const inpStyle: React.CSSProperties = {
    ...C.inp,
    borderRadius: 6,
    width: "100%",
    boxSizing: "border-box",
  };

  const cBr = isDark ? "#2a2520" : "#d6cfc4";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: mob ? "32px 16px" : "80px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ height: 1, width: 40, background: `linear-gradient(to right, transparent, ${gold}88)` }} />
            <p style={{ color: gold, letterSpacing: 4, fontSize: 10, margin: 0 }}>CANCEL BOOKING</p>
            <div style={{ height: 1, width: 40, background: `linear-gradient(to left, transparent, ${gold}88)` }} />
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: mob ? 28 : 42,
              color: C.textH,
              fontWeight: 400,
              marginBottom: 12,
              lineHeight: 1.2,
            }}
          >
            Cancel{" "}
            <span style={{ color: gold, fontStyle: "italic" }}>Your Booking</span>
          </h1>
          <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.8, maxWidth: 480, margin: "0 auto" }}>
            Need to cancel your reservation? We're here to help.
            <br />
            Enter your booking details below to get started.
          </p>
        </div>

        {/* Find Booking Card */}
        <div
          style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: mob ? "20px 16px" : "32px",
            marginBottom: 20,
            boxShadow: C.shadow,
          }}
        >
          <p style={{ color: gold, fontSize: 10, letterSpacing: 3, marginBottom: 20 }}>FIND YOUR BOOKING</p>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr auto", gap: 14, alignItems: "flex-end" }}>
            <div>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                BOOKING REFERENCE / ID
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Enter booking reference"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFind()}
                  className="sw-input"
                  style={{ ...inpStyle, paddingRight: 36 }}
                />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.4 }}>🔖</span>
              </div>
            </div>
            <div>
              <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                EMAIL ADDRESS
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFind()}
                  className="sw-input"
                  style={{ ...inpStyle, paddingRight: 36 }}
                />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.4 }}>✉️</span>
              </div>
            </div>
            <button
              onClick={handleFind}
              style={{
                ...goldBtn,
                padding: "12px 20px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                letterSpacing: 1.5,
                fontSize: 11,
                width: mob ? "100%" : "auto",
              }}
            >
              FIND BOOKING →
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>🔒</span>
            <span style={{ color: C.textXS, fontSize: 11 }}>Your information is secure and encrypted</span>
          </div>
        </div>

        {/* Not Found */}
        {searched && notFound && (
          <div
            style={{
              background: C.bgCard,
              border: `1px solid rgba(229,85,85,0.3)`,
              borderRadius: 12,
              padding: mob ? "20px 16px" : "28px 32px",
              marginBottom: 20,
              boxShadow: C.shadow,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <h3 style={{ color: "#e55", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 8 }}>
              Booking Not Found
            </h3>
            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7 }}>
              We couldn't find a booking matching those details. Please double-check your reference ID and email address.
            </p>
          </div>
        )}

        {/* Booking Found Card */}
        {found && (
          <div
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: mob ? "20px 16px" : "28px 32px",
              marginBottom: 20,
              boxShadow: C.shadow,
            }}
          >
            {/* Found indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(76,175,80,0.15)", border: "1.5px solid #4caf50", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>✓</div>
              <span style={{ color: "#4caf50", fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>BOOKING FOUND</span>
            </div>

            {/* Booking Info */}
            <div style={{ display: "flex", gap: mob ? 12 : 20, marginBottom: 24, flexWrap: "wrap" }}>
              {/* Image placeholder */}
              <div
                style={{
                  width: mob ? "100%" : 130,
                  height: mob ? 120 : 100,
                  borderRadius: 8,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: isDark ? "#1a1714" : "#e8e0d4",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400&q=80"
                  alt="Resort"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 500, marginBottom: 14 }}>
                  {found.package === "Day Tour + Room" ? "Deluxe Pool Villa" : "Day Tour Package"}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12 }}>
                  {[
                    { icon: "📅", label: "CHECK-IN", value: fmtDate(found.date), sub: "" },
                    { icon: "📅", label: "CHECK-OUT", value: fmtDate(found.date), sub: "" },
                    { icon: "👤", label: "GUESTS", value: `${found.guests} Adults`, sub: "" },
                    { icon: "🔖", label: "BOOKING REFERENCE", value: found.id, sub: "", isRef: true },
                  ].map(({ label, value, sub, isRef }) => (
                    <div key={label}>
                      <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: isRef ? gold : C.textH, fontSize: isRef ? 12 : 13, fontWeight: isRef ? 700 : 500, fontFamily: isRef ? "monospace" : "inherit" }}>
                        {value}
                      </div>
                      {sub && <div style={{ color: C.textS, fontSize: 11, marginTop: 2 }}>{sub}</div>}
                      {isRef && (
                        <span style={{ display: "inline-block", marginTop: 4, background: "rgba(76,175,80,0.12)", color: "#4caf50", fontSize: 9, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(76,175,80,0.3)", letterSpacing: 1 }}>
                          {found.status.toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Total row — no action buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: `1px solid ${C.border}`,
                paddingTop: 16,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>TOTAL AMOUNT</div>
                <div style={{ color: gold, fontWeight: 700, fontSize: 22, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>
                  ₱{found.total.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Booking Section */}
        {found && found.status !== "Cancelled" && found.status !== "Completed" && !cancelDone && (
          <div
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: mob ? "20px 16px" : "28px 32px",
              boxShadow: C.shadow,
            }}
          >
            <p style={{ color: gold, fontSize: 10, letterSpacing: 3, marginBottom: 16 }}>CANCEL YOUR BOOKING</p>

            <div style={{ marginBottom: 20 }}>
              <p style={{ color: C.textH, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Help us improve (optional)</p>
              <p style={{ color: C.textS, fontSize: 12, marginBottom: 16 }}>Let us know why you're canceling your booking.</p>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
                {CANCEL_REASONS.map(({ icon, label }) => {
                  const sel = cancelReason === label;
                  return (
                    <div
                      key={label}
                      onClick={() => setCancelReason(label)}
                      style={{
                        border: `1px solid ${sel ? "#4caf50" : cBr}`,
                        borderRadius: 8,
                        padding: "12px 10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: sel ? "rgba(76,175,80,0.08)" : "transparent",
                        transition: "all .2s",
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{icon}</span>
                      <span style={{ color: sel ? "#4caf50" : C.textS, fontSize: 12, flex: 1 }}>{label}</span>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          border: `1.5px solid ${sel ? "#4caf50" : cBr}`,
                          background: sel ? "#4caf50" : "transparent",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {sel && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                background: isDark ? "rgba(245,197,24,0.05)" : "rgba(245,197,24,0.06)",
                border: "1px solid rgba(245,197,24,0.2)",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
              <span style={{ color: gold, fontSize: 12, lineHeight: 1.6 }}>
                Free cancellation available up to 24 hours before check-in.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleProceedCancel}
                style={{
                  ...goldBtn,
                  padding: "13px 28px",
                  borderRadius: 6,
                  letterSpacing: 2,
                  fontSize: 11,
                }}
              >
                PROCEED TO CANCEL →
              </button>
            </div>
          </div>
        )}

        {/* Cancellation Done */}
        {cancelDone && (
          <div
            style={{
              background: C.bgCard,
              border: "1px solid rgba(229,85,85,0.3)",
              borderRadius: 12,
              padding: mob ? "28px 16px" : "40px 32px",
              textAlign: "center",
              boxShadow: C.shadow,
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>
              ✓
            </div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 400, marginBottom: 8 }}>
              Booking Cancelled
            </h3>
            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7 }}>
              Your booking <strong style={{ color: gold }}>{found?.id}</strong> has been successfully cancelled.
            </p>
          </div>
        )}

        {/* Already Cancelled / Completed Notice */}
        {found && (found.status === "Cancelled" || found.status === "Completed") && !cancelDone && (
          <div
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: mob ? "20px 16px" : "24px 32px",
              boxShadow: C.shadow,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>{found.status === "Cancelled" ? "❌" : "✅"}</span>
            <p style={{ color: C.textS, fontSize: 13 }}>
              This booking is already{" "}
              <strong style={{ color: statusColor(found.status) }}>{found.status}</strong> and cannot be modified.
            </p>
          </div>
        )}
      </div>

      {/* Confirm Cancel Modal */}
      {showCancelConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 500,
            padding: 20,
          }}
        >
          <div
            style={{
              background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
              border: "1px solid rgba(229,85,85,0.3)",
              borderRadius: 14,
              padding: mob ? "28px 20px" : "36px",
              width: "100%",
              maxWidth: 420,
              boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 18 }}>
              ⚠️
            </div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              Confirm Cancellation
            </h3>
            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
              Are you sure you want to cancel booking <strong style={{ color: gold }}>{found?.id}</strong>? This action cannot be undone.
            </p>
            <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{ ...outBtn, flex: 1, padding: "12px 16px", fontSize: 11, borderRadius: 8 }}
              >
                GO BACK
              </button>
              <button
                onClick={confirmCancel}
                style={{
                  flex: 2,
                  background: "rgba(229,85,85,0.12)",
                  color: "#e55",
                  border: "1px solid rgba(229,85,85,0.3)",
                  padding: "12px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  borderRadius: 8,
                  letterSpacing: 2,
                }}
              >
                YES, CANCEL BOOKING
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
