"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";

interface BookingsTabProps {
  bookings: Booking[];
  updateStatus: (id: string, status: string) => void;
  mob: boolean;
  rooms: Room[];
}

export function BookingsTab({ bookings, updateStatus, mob, rooms }: BookingsTabProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const [bf, setBf] = useState("All");
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ bookingId: string; action: string; guestName: string; guestEmail?: string } | null>(null);
  const [rejectionMsg, setRejectionMsg] = useState("");
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);

  const executeAction = () => {
    if (!confirmAction) return;
    updateStatus(confirmAction.bookingId, confirmAction.action);
    if (confirmAction.action === "Cancelled") {
      const msg = rejectionMsg.trim() || "Your booking did not meet our current availability or requirements.";
      toast(`Rejection sent to ${confirmAction.guestEmail || confirmAction.guestName}: "${msg.slice(0, 48)}${msg.length > 48 ? "…" : ""}"`, "warning");
    } else {
      toast(`Booking accepted for ${confirmAction.guestName}.`, "success");
    }
    setRejectionMsg(""); setConfirmAction(null);
  };

  // Derive payment method from package type
  const getPaymentMethod = (b: Booking) => {
    if (b.package === "On-Site Reservation") return { label: "On-Site", color: "#4a9fd4", bg: "rgba(74,159,212,0.08)", border: "rgba(74,159,212,0.25)", icon: "🏡" };
    return { label: "GCash", color: "#00a952", bg: "rgba(0,169,82,0.08)", border: "rgba(0,169,82,0.25)", icon: "G" };
  };

  const filters = ["All", "On Hold", "Confirmed", "Completed", "Cancelled"];
  const fC: Record<string, string[]> = {
    "On Hold":   [isDark ? "#2a2500" : "#fef9e7", "#d4a800"],
    "Confirmed": [isDark ? "#1a3320" : "#edfbf0", "#2e9e4e"],
    "Completed": [isDark ? "#0f1a2a" : "#e8f4fb", "#1a6fa0"],
    "Cancelled": [isDark ? "#2a1010" : "#fdecea", "#c0392b"],
  };
  const q = search.toLowerCase().trim();
  const filtered = (bf === "All" ? bookings : bookings.filter((b) => b.status === bf)).filter(
    (b) => !q ||
      b.name.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      (b.email || "").toLowerCase().includes(q) ||
      b.contact.includes(q) ||
      b.date.includes(q) ||
      b.package.toLowerCase().includes(q)
  );
  const cBg = isDark ? "#0b0a08" : "#ffffff";
  const cBr = isDark ? "#1e1a14" : "#e4ddd1";

  return (
    <div>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.35 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textH} strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <label htmlFor="bookings-search" className="sr-only">Search bookings</label>
        <input
          id="bookings-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, ID, email, phone, date, or package…"
          className="sw-input"
          style={{ ...C.inp, paddingLeft: 36, borderRadius: 6 }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textXS, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
          >✕</button>
        )}
      </div>

      {/* Status filter tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {filters.map((f) => {
          const active = bf === f; const col = fC[f];
          return (
            <button
              key={f}
              onClick={() => setBf(f)}
              style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: "pointer", background: active ? (col ? col[0] : "#1a1a1a") : "transparent", color: active ? (col ? col[1] : gold) : (col ? col[1] + "cc" : C.textS), border: `1px solid ${active ? (col ? col[1] : gold) : (col ? col[1] + "44" : C.border)}` }}
            >
              {f} <span style={{ opacity: 0.7, fontSize: 11 }}>({f === "All" ? bookings.length : bookings.filter((b) => b.status === f).length})</span>
            </button>
          );
        })}
      </div>

      {search && (
        <p style={{ color: C.textXS, fontSize: 12, marginBottom: 12 }}>
          Showing {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "<span style={{ color: gold }}>{search}</span>"
        </p>
      )}

      {/* Table */}
      <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }} aria-label="Bookings list">
            <thead>
              <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                {["ID", "Guest", "Email", "Phone", "Date", "Package", "Payment", "Total", "Down", "Status", "Actions"].map((h) => (
                  <th key={h} scope="col" style={{ padding: "11px 12px", color: C.textXS, fontSize: 9, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: 24, textAlign: "center", color: C.textXS, fontSize: 13 }}>
                    {search ? `No bookings matching "${search}".` : `No bookings for "${bf}".`}
                  </td>
                </tr>
              )}
              {filtered.map((b, idx) => {
                const sc = fC[b.status] || [isDark ? "#111" : "#eee", C.textS];
                const pm = getPaymentMethod(b);
                return (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#090909" : "#080808") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                    <td style={{ padding: "10px 12px", color: gold, fontSize: 11, whiteSpace: "nowrap", fontFamily: "monospace" }}>{b.id}</td>
                    <td style={{ padding: "10px 12px", color: C.textH, fontSize: 12 }}>{b.name}</td>
                    <td style={{ padding: "10px 12px", color: C.textS, fontSize: 11 }}>{b.email || "—"}</td>
                    <td style={{ padding: "10px 12px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.contact || "—"}</td>
                    <td style={{ padding: "10px 12px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.date}</td>
                    <td style={{ padding: "10px 12px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.package}</td>

                    {/* ── Payment Method column ── */}
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: pm.bg, border: `1px solid ${pm.border}`, borderRadius: 20, padding: "3px 8px" }}>
                        {pm.label === "GCash" ? (
                          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#00a952", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: "#fff", flexShrink: 0 }}>G</span>
                        ) : (
                          <span style={{ fontSize: 11 }}>🏡</span>
                        )}
                        <span style={{ color: pm.color, fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>{pm.label.toUpperCase()}</span>
                      </div>
                    </td>

                    <td style={{ padding: "10px 12px", color: C.textH, fontSize: 12, whiteSpace: "nowrap", fontWeight: 600 }}>{fmt(b.total)}</td>
                    <td style={{ padding: "10px 12px", color: "#ff9800", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(b.downpayment)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: sc[0] + "33", color: sc[1], fontSize: 9, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", border: `1px solid ${sc[1]}44`, letterSpacing: 1 }}>
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <button onClick={() => setViewBooking(b)} style={{ background: isDark ? "rgba(201,168,76,0.07)" : "rgba(201,168,76,0.12)", color: gold, border: `1px solid ${gold}44`, padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1, whiteSpace: "nowrap" }}>VIEW</button>
                        {b.status === "Confirmed" && (
                          <button onClick={() => { updateStatus(b.id, "Completed"); toast(`Booking marked complete for ${b.name}.`, "info"); }} style={{ background: "rgba(74,159,212,0.1)", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.25)", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap", letterSpacing: 1 }}>✓ COMPLETE</button>
                        )}
                        {b.status === "On Hold" && <>
                          <button onClick={() => setConfirmAction({ bookingId: b.id, action: "Confirmed", guestName: b.name, guestEmail: b.email })} style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.25)", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>ACCEPT</button>
                          <button onClick={() => { setRejectionMsg(""); setConfirmAction({ bookingId: b.id, action: "Cancelled", guestName: b.name, guestEmail: b.email }); }} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>REJECT</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── View Booking Modal ── */}
      {viewBooking && (() => {
        const b = viewBooking;
        const extraGuests = b.guests > 30 ? (b.guests - 30) * 100 : 0;
        const overtimeFee = (b.overtime || 0) * 500;
        const bookedRooms = rooms.filter((r) => (b.rooms || []).includes(r.id));
        const pm = getPaymentMethod(b);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20, overflowY: "auto" }} role="dialog" aria-modal="true" aria-labelledby="view-booking-title">
            <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: mob ? "24px 18px" : "32px", width: "100%", maxWidth: 520, boxShadow: "0 40px 100px rgba(0,0,0,0.7)", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <p style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>BOOKING DETAILS</p>
                  <h3 id="view-booking-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, margin: 0 }}>{b.name}</h3>
                </div>
                <span style={{ color: gold, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{b.id}</span>
              </div>

              {/* Guest info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[["Date", b.date], ["Contact", b.contact], ["Email", b.email || "—"], ["Guests", `${b.guests} pax`]].map(([l, v]) => (
                  <div key={l} style={{ background: isDark ? "#111" : "#f7f5f0", borderRadius: 5, padding: "10px 13px" }}>
                    <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>{l.toUpperCase()}</div>
                    <div style={{ color: C.textH, fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Payment method badge in modal */}
              <div style={{ background: isDark ? "#111" : "#f7f5f0", borderRadius: 5, padding: "10px 13px", marginBottom: 20 }}>
                <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>PAYMENT METHOD</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: pm.bg, border: `1px solid ${pm.border}`, borderRadius: 20, padding: "5px 12px" }}>
                  {pm.label === "GCash" ? (
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#00a952", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0 }}>G</span>
                  ) : (
                    <span style={{ fontSize: 14 }}>🏡</span>
                  )}
                  <span style={{ color: pm.color, fontSize: 12, fontWeight: 700 }}>{pm.label === "GCash" ? "GCash (Online Payment)" : "On-Site (Pay on Arrival)"}</span>
                </div>
              </div>

              {/* Pricing breakdown */}
              <div style={{ border: `1px solid ${cBr}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ background: isDark ? "#0f0e0b" : "#f5f0e8", padding: "10px 18px", borderBottom: `1px solid ${cBr}` }}>
                  <span style={{ color: C.textS, fontSize: 11, fontWeight: 600 }}>Pricing Breakdown</span>
                </div>
                <div style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${cBr}` }}>
                    <div style={{ color: C.textH, fontSize: 13 }}>☀️ Day Tour</div>
                    <span style={{ color: C.textH, fontSize: 13, fontWeight: 600 }}>₱6,000</span>
                  </div>
                  {extraGuests > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${cBr}` }}>
                      <div style={{ color: C.textH, fontSize: 13 }}>👥 Extra Guests ({b.guests - 30} × ₱100)</div>
                      <span style={{ color: "#f5c518", fontSize: 13 }}>{fmt(extraGuests)}</span>
                    </div>
                  )}
                  {(b.overtime || 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${cBr}` }}>
                      <div style={{ color: C.textH, fontSize: 13 }}>🕐 Overtime ({b.overtime}hr × ₱500)</div>
                      <span style={{ color: "#ff9800", fontSize: 13 }}>{fmt(overtimeFee)}</span>
                    </div>
                  )}
                  {bookedRooms.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${cBr}` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.img} alt={r.name} style={{ width: 44, height: 36, objectFit: "cover", borderRadius: 3 }} />
                        <div style={{ color: C.textH, fontSize: 13 }}>🛏 {r.name}</div>
                      </div>
                      <span style={{ color: gold, fontSize: 13 }}>{fmt(r.price)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `2px solid ${gold}33`, marginTop: 4, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>TOTAL</span>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: gold, fontWeight: 700, fontSize: 18 }}>{fmt(b.total)}</div>
                      <div style={{ color: "#ff9800", fontSize: 12, fontWeight: 600 }}>Down: {fmt(b.downpayment)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                <div style={{ background: isDark ? "#111" : "#f7f5f0", borderRadius: 5, padding: "10px 13px" }}>
                  <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>PAYMENT PROOF</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{b.paymentProof ? "✅" : "❌"}</span>
                    <span style={{ color: b.paymentProof ? "#4caf50" : "#e55", fontSize: 12, fontWeight: 600 }}>{b.paymentProof ? "Submitted" : "Not Yet"}</span>
                  </div>
                </div>
                <div style={{ background: isDark ? "#111" : "#f7f5f0", borderRadius: 5, padding: "10px 13px" }}>
                  <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>PACKAGE TYPE</div>
                  <div style={{ color: C.textH, fontSize: 12 }}>{b.package}</div>
                </div>
              </div>
              {b.notes && (
                <div style={{ background: isDark ? "#111" : "#f7f5f0", borderRadius: 5, padding: "12px 14px", marginBottom: 20 }}>
                  <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>GUEST NOTES</div>
                  <p style={{ color: C.textB, fontSize: 13, lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>"{b.notes}"</p>
                </div>
              )}
              <button onClick={() => setViewBooking(null)} style={{ ...goldBtn, width: "100%", padding: 12 }}>CLOSE</button>
            </div>
          </div>
        );
      })()}

      {/* ── Accept / Reject Confirm Modal ── */}
      {confirmAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "#0d0d0d" : "#fff", border: `1px solid ${confirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}`, borderRadius: 8, padding: "32px 28px", width: "100%", maxWidth: 420, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: confirmAction.action === "Confirmed" ? "rgba(76,175,80,0.1)" : "rgba(229,85,85,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, fontSize: 22 }}>
              {confirmAction.action === "Confirmed" ? "✓" : "✕"}
            </div>
            <h3 style={{ color: isDark ? "#e8e8e8" : "#111", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, fontWeight: 400, marginBottom: 8 }}>
              {confirmAction.action === "Confirmed" ? "Accept this booking?" : "Reject this booking?"}
            </h3>
            <p style={{ color: isDark ? "#888" : "#666", fontSize: 13, lineHeight: 1.7, marginBottom: confirmAction.action === "Cancelled" ? 16 : 24 }}>
              {confirmAction.action === "Confirmed"
                ? <>{`Accept booking for `}<strong style={{ color: isDark ? "#ddd" : "#333" }}>{confirmAction.guestName}</strong>?</>
                : <>{`Reject booking for `}<strong style={{ color: isDark ? "#ddd" : "#333" }}>{confirmAction.guestName}</strong>. A rejection message will be sent to the guest.</>
              }
            </p>
            {confirmAction.action === "Cancelled" && (
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="rejection-msg" style={{ color: isDark ? "#888" : "#666", fontSize: 9, letterSpacing: 3, display: "block", marginBottom: 8 }}>
                  REJECTION MESSAGE <span style={{ color: "#888", letterSpacing: 0 }}>(sent to guest)</span>
                </label>
                <div style={{ background: isDark ? "rgba(229,85,85,0.04)" : "rgba(229,85,85,0.03)", border: "1px solid rgba(229,85,85,0.25)", borderRadius: 5, padding: "2px 0" }}>
                  <textarea
                    id="rejection-msg"
                    value={rejectionMsg}
                    onChange={(e) => setRejectionMsg(e.target.value)}
                    rows={4}
                    placeholder={`Hi ${confirmAction.guestName},\n\nWe regret to inform you that your booking has been declined.`}
                    style={{ background: "transparent", border: "none", color: isDark ? "#e0e0e0" : "#222", fontSize: 13, lineHeight: 1.7, padding: "12px 14px", width: "100%", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                {confirmAction.guestEmail && (
                  <p style={{ color: C.textXS, fontSize: 11, marginTop: 6 }}>
                    ✉️ Will be sent to: <span style={{ color: gold }}>{confirmAction.guestEmail}</span>
                  </p>
                )}
              </div>
            )}
            <div style={{ borderTop: `1px solid ${isDark ? "#1e1e1e" : "#eee"}`, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setConfirmAction(null); setRejectionMsg(""); }} style={{ flex: 1, background: "transparent", color: isDark ? "#777" : "#888", border: `1px solid ${isDark ? "#2a2a2a" : "#ddd"}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}>GO BACK</button>
              <button onClick={executeAction} style={{ flex: 2, background: confirmAction.action === "Confirmed" ? "rgba(76,175,80,0.12)" : "rgba(229,85,85,0.10)", color: confirmAction.action === "Confirmed" ? "#4caf50" : "#e55", border: `1px solid ${confirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}`, padding: "11px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 4, letterSpacing: 2 }}>
                {confirmAction.action === "Confirmed" ? "YES, ACCEPT" : "YES, SEND & REJECT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
