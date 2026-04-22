"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmt } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BookingsTab } from "@/components/admin/BookingsTab";
import { InventoryTab } from "@/components/admin/InventoryTab";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { Review } from "@/types/review";
import type { AdminTab, CustomerMessage } from "@/types/admin";

interface AdminProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  galleryImgs: string[];
  setGalleryImgs: React.Dispatch<React.SetStateAction<string[]>>;
  closedDates: string[];
  setClosedDates: React.Dispatch<React.SetStateAction<string[]>>;
  reviews: Review[];
  onLogout: () => void;
  customerMessages: CustomerMessage[];
  setCustomerMessages: React.Dispatch<React.SetStateAction<CustomerMessage[]>>;
}

// ── OnsiteTab sub-component ──────────────────────────────────────────────────
interface OnsiteTabProps {
  onsiteBookings: Booking[];
  onsitePending: Booking[];
  onsiteConfirmed: Booking[];
  onsiteCompleted: Booking[];
  updateStatus: (id: string, status: string) => void;
  isDark: boolean;
  C: ReturnType<typeof T>;
  cBg: string;
  cBr: string;
  mob: boolean;
  toast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
  gold: string;
}

function OnsiteTab({
  onsiteBookings, onsitePending, onsiteConfirmed, onsiteCompleted,
  updateStatus, isDark, C, cBg, cBr, mob, toast, gold,
}: OnsiteTabProps) {
  const [osSearch, setOsSearch] = useState("");
  const [osTab, setOsTab] = useState<"On Hold" | "Confirmed" | "Completed" | "Cancelled">("On Hold");
  const [onsiteConfirmAction, setOnsiteConfirmAction] = useState<{
    bookingId: string;
    action: "Confirmed" | "Cancelled" | "Completed";
    guestName: string;
  } | null>(null);

  const onsiteCancelled = onsiteBookings.filter(b => b.status === "Cancelled");

  const tabMap = {
    "On Hold":   onsitePending,
    "Confirmed": onsiteConfirmed,
    "Completed": onsiteCompleted,
    "Cancelled": onsiteCancelled,
  };
  const tabColors: Record<string, string> = {
    "On Hold":   "#f5c518",
    "Confirmed": "#4caf50",
    "Completed": "#4a9fd4",
    "Cancelled": "#c0392b",
  };

  const q = osSearch.toLowerCase().trim();
  const displayRows = tabMap[osTab].filter(
    (b) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.contact.includes(q) || (b.date && b.date.includes(q))
  );

  const sc: Record<string, string[]> = {
    "On Hold":   [isDark ? "#2a2500" : "#fef9e7", "#d4a800"],
    "Confirmed": [isDark ? "#1a3320" : "#edfbf0", "#2e9e4e"],
    "Completed": [isDark ? "#0f1a2a" : "#e8f4fb", "#1a6fa0"],
    "Cancelled": [isDark ? "#2a1010" : "#fdecea", "#c0392b"],
  };

  const executeOnsiteAction = () => {
    if (!onsiteConfirmAction) return;
    updateStatus(onsiteConfirmAction.bookingId, onsiteConfirmAction.action);
    if (onsiteConfirmAction.action === "Confirmed") {
      toast(`On-site reservation confirmed for ${onsiteConfirmAction.guestName}. Payment received.`, "success");
    } else if (onsiteConfirmAction.action === "Cancelled") {
      toast(`On-site reservation cancelled for ${onsiteConfirmAction.guestName}.`, "warning");
    } else {
      toast(`Visit completed for ${onsiteConfirmAction.guestName}.`, "info");
    }
    setOnsiteConfirmAction(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>ON-SITE RESERVATIONS</p>
        <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>On-Site Walk-In Management</h2>
        <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>Payment collected upon arrival — only confirm after payment is received in person.</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(5,1fr)", gap: mob ? 10 : 14, marginBottom: 24 }}>
        {([
          ["Total",     onsiteBookings.length,  gold],
          ["On Hold",   onsitePending.length,   "#f5c518"],
          ["Confirmed", onsiteConfirmed.length, "#4caf50"],
          ["Completed", onsiteCompleted.length, "#4a9fd4"],
          ["Cancelled", onsiteCancelled.length, "#c0392b"],
        ] as [string, number, string][]).map(([l, v, c]) => (
          <div key={l} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? "14px 12px" : "20px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${c}22,${c})` }} />
            <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>{l.toUpperCase()}</div>
            <div style={{ color: c, fontSize: mob ? 24 : 30, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Policy notice */}
      <div style={{ background: isDark ? "rgba(74,159,212,0.05)" : "rgba(74,159,212,0.04)", border: "1px solid rgba(74,159,212,0.2)", borderRadius: 10, padding: "14px 18px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🏡</span>
        <div>
          <p style={{ color: "#4a9fd4", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>ON-SITE PAYMENT POLICY</p>
          <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.7, margin: 0 }}>
            On-site reservations are <strong style={{ color: C.textH }}>NOT confirmed</strong> until the guest physically arrives and pays at least 50% of the fee. Only press <strong style={{ color: "#4caf50" }}>ACCEPT</strong> after payment has been collected in person.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.35 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textH} strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <label htmlFor="onsite-search" className="sr-only">Search on-site reservations</label>
        <input
          id="onsite-search"
          value={osSearch}
          onChange={(e) => setOsSearch(e.target.value)}
          placeholder="Search by name, ID, contact, or date…"
          className="sw-input"
          style={{ ...C.inp, paddingLeft: 36, borderRadius: 6 }}
        />
        {osSearch && (
          <button
            onClick={() => setOsSearch("")}
            aria-label="Clear search"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textXS, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
          >✕</button>
        )}
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["On Hold", "Confirmed", "Completed", "Cancelled"] as const).map((t) => {
          const active = osTab === t;
          const c = tabColors[t];
          const count = tabMap[t].length;
          return (
            <button
              key={t}
              onClick={() => setOsTab(t)}
              aria-pressed={active}
              style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: "pointer", background: active ? `${c}18` : "transparent", color: active ? c : C.textS, border: `1px solid ${active ? c + "55" : cBr}`, letterSpacing: 1 }}
            >
              {t} <span style={{ opacity: 0.7, fontSize: 10 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 480 : 0 }} aria-label="On-site reservations">
            <thead>
              <tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>
                {["Ref ID", "Guest", "Contact", "Date", "Status", "Actions"].map((h) => (
                  <th key={h} scope="col" style={{ padding: "11px 14px", color: C.textXS, fontSize: 9, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 13 }}>
                    {osSearch ? `No results for "${osSearch}".` : `No ${osTab.toLowerCase()} reservations.`}
                  </td>
                </tr>
              )}
              {displayRows.map((b, idx) => {
                const col = sc[b.status] || [isDark ? "#111" : "#eee", C.textS];
                return (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#090909" : "#080808") : (idx % 2 === 0 ? "#fff" : "#faf7f2") }}>
                    <td style={{ padding: "12px 14px", color: gold, fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" }}>{b.id}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ color: C.textH, fontSize: 12, fontWeight: 600 }}>{b.name}</div>
                      <div style={{ color: C.textXS, fontSize: 11 }}>{b.email !== "—" ? b.email : ""}</div>
                    </td>
                    <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.contact}</td>
                    <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>
                      {b.date !== "—" ? b.date : <span style={{ color: C.textXS }}>Walk-in</span>}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ background: col[0] + "33", color: col[1], fontSize: 9, padding: "3px 9px", borderRadius: 20, border: `1px solid ${col[1]}44`, letterSpacing: 1 }}>
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {b.status === "On Hold" && (
                          <>
                            <button
                              onClick={() => setOnsiteConfirmAction({ bookingId: b.id, action: "Confirmed", guestName: b.name })}
                              style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.25)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                            >✓ ACCEPT</button>
                            <button
                              onClick={() => setOnsiteConfirmAction({ bookingId: b.id, action: "Cancelled", guestName: b.name })}
                              style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
                            >CANCEL</button>
                          </>
                        )}
                        {b.status === "Confirmed" && (
                          <button
                            onClick={() => setOnsiteConfirmAction({ bookingId: b.id, action: "Completed", guestName: b.name })}
                            style={{ background: "rgba(74,159,212,0.1)", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.25)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                          >✓ COMPLETE</button>
                        )}
                        {(b.status === "Completed" || b.status === "Cancelled") && (
                          <span style={{ color: C.textXS, fontSize: 11 }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* How it works */}
      <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>HOW ON-SITE RESERVATIONS WORK</p>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
        {([
          ["1. Guest Reserves Online", "Guest fills out the on-site form and gets a reference ID. No payment collected yet.", "#4a9fd4"],
          ["2. Guest Arrives at Resort", "Guest shows their reference ID and pays 50% down or full amount upon arrival.", "#f5c518"],
          ["3. Admin Confirms Here", "Once payment is received in person, press ACCEPT to confirm in the system.", "#4caf50"],
        ] as [string, string, string][]).map(([title, desc, c]) => (
          <div key={title} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: c }} />
            <h4 style={{ color: C.textH, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</h4>
            <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* ── On-Site Confirm Modal ── */}
      {onsiteConfirmAction && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }}
          role="dialog" aria-modal="true" aria-labelledby="onsite-confirm-title"
        >
          <div style={{
            background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
            border: `1px solid ${
              onsiteConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)"
              : onsiteConfirmAction.action === "Completed" ? "rgba(74,159,212,0.3)"
              : "rgba(229,85,85,0.3)"
            }`,
            borderRadius: 12, padding: "32px 28px", width: "100%", maxWidth: 400, boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
          }}>
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: "50%", marginBottom: 18, fontSize: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: onsiteConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.1)"
                : onsiteConfirmAction.action === "Completed" ? "rgba(74,159,212,0.1)"
                : "rgba(229,85,85,0.1)",
              border: `1px solid ${
                onsiteConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)"
                : onsiteConfirmAction.action === "Completed" ? "rgba(74,159,212,0.3)"
                : "rgba(229,85,85,0.3)"
              }`,
            }}>
              {onsiteConfirmAction.action === "Confirmed" ? "✓" : onsiteConfirmAction.action === "Completed" ? "🏁" : "✕"}
            </div>

            <h3 id="onsite-confirm-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              {onsiteConfirmAction.action === "Confirmed" ? "Accept this on-site reservation?"
                : onsiteConfirmAction.action === "Completed" ? "Mark visit as completed?"
                : "Cancel this reservation?"}
            </h3>

            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
              {onsiteConfirmAction.action === "Confirmed" && (
                <>Confirm that <strong style={{ color: C.textH }}>{onsiteConfirmAction.guestName}</strong> has arrived and payment has been collected at the resort.</>
              )}
              {onsiteConfirmAction.action === "Completed" && (
                <>Mark <strong style={{ color: C.textH }}>{onsiteConfirmAction.guestName}</strong>'s visit as completed. This records their stay in the system.</>
              )}
              {onsiteConfirmAction.action === "Cancelled" && (
                <>Cancel the on-site reservation for <strong style={{ color: C.textH }}>{onsiteConfirmAction.guestName}</strong>. This action cannot be undone.</>
              )}
            </p>

            {/* Warning for accept */}
            {onsiteConfirmAction.action === "Confirmed" && (
              <div style={{ background: isDark ? "rgba(76,175,80,0.05)" : "rgba(76,175,80,0.04)", border: "1px solid rgba(76,175,80,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8 }}>
                <span style={{ flexShrink: 0 }}>💵</span>
                <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>
                  Only confirm if payment (50% down or full amount) has been <strong style={{ color: "#4caf50" }}>physically collected</strong> at the resort.
                </span>
              </div>
            )}

            {/* Warning for cancel */}
            {onsiteConfirmAction.action === "Cancelled" && (
              <div style={{ background: "rgba(229,85,85,0.04)", border: "1px solid rgba(229,85,85,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8 }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>The guest will be notified that their reservation has been cancelled.</span>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setOnsiteConfirmAction(null)}
                style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}
              >GO BACK</button>
              <button
                onClick={executeOnsiteAction}
                style={{
                  flex: 2, padding: "11px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2,
                  background: onsiteConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.12)"
                    : onsiteConfirmAction.action === "Completed" ? "rgba(74,159,212,0.1)"
                    : "rgba(229,85,85,0.10)",
                  color: onsiteConfirmAction.action === "Confirmed" ? "#4caf50"
                    : onsiteConfirmAction.action === "Completed" ? "#4a9fd4"
                    : "#e55",
                  border: `1px solid ${
                    onsiteConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)"
                    : onsiteConfirmAction.action === "Completed" ? "rgba(74,159,212,0.3)"
                    : "rgba(229,85,85,0.3)"
                  }`,
                }}
              >
                {onsiteConfirmAction.action === "Confirmed" ? "YES, ACCEPT & CONFIRM"
                  : onsiteConfirmAction.action === "Completed" ? "YES, MARK COMPLETE"
                  : "YES, CANCEL"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Component ───────────────────────────────────────────────────────────
export function Admin({
  bookings, setBookings, rooms, setRooms,
  galleryImgs, setGalleryImgs, closedDates, setClosedDates,
  reviews, onLogout, customerMessages, setCustomerMessages,
}: AdminProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;

  const [tab, setTab] = useState<AdminTab>("Dashboard");
  const [sideOpen, setSideOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [rf, setRf] = useState({ name: "", beds: "", capacity: "", price: "", desc: "", img: "" });
  const [imgPrev, setImgPrev] = useState("");
  const [confirmRemoveRoom, setConfirmRemoveRoom] = useState<Room | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const [calMonth, setCalMonth] = useState(new Date(2026, 2));
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [autoRejectHours, setAutoRejectHours] = useState(48);
  const [autoRejectEnabled, setAutoRejectEnabled] = useState(true);
  const [archivedMessages, setArchivedMessages] = useState<CustomerMessage[]>([]);
  const [csView, setCsView] = useState<"inbox" | "archive">("inbox");
  const [confirmArchiveMsg, setConfirmArchiveMsg] = useState<CustomerMessage | null>(null);
  const [dashConfirm, setDashConfirm] = useState<{
    bookingId: string; action: "Confirmed" | "Cancelled"; guestName: string;
  } | null>(null);

  const tabs: AdminTab[] = ["Dashboard", "Bookings", "On-Site", "Occupancy", "Rooms", "Gallery", "Inventory", "Analytics", "Reports", "Customer Service"];
  const tabIcons: Record<AdminTab, string> = { Dashboard: "⊞", Bookings: "📋", "On-Site": "🏡", Occupancy: "📅", Rooms: "🛏", Gallery: "🖼", Inventory: "📦", Analytics: "📈", Reports: "📊", "Customer Service": "💬" };

  const updateStatus = (id: string, status: string) => setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status: status as Booking["status"] } : b));

  // Auto-reject on-hold bookings past deadline
  useEffect(() => {
    if (!autoRejectEnabled) return;
    const check = () => {
      const now = Date.now();
      setBookings((bs) => bs.map((b) => {
        if (b.status !== "On Hold") return b;
        const created = b.createdAt || now;
        if (now - created > autoRejectHours * 60 * 60 * 1000) {
          toast(`Auto-rejected: ${b.name}'s booking exceeded the ${autoRejectHours}h payment window.`, "warning");
          return { ...b, status: "Cancelled" };
        }
        return b;
      }));
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [autoRejectEnabled, autoRejectHours]);

  const onHold = bookings.filter((b) => b.status === "On Hold").length;
  const confirmed = bookings.filter((b) => b.status === "Confirmed").length;
  const completed = bookings.filter((b) => b.status === "Completed").length;

  // Calendar
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
  const getDateStatus = (d: number) => {
    const ds = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (closedDates.includes(ds)) return "Closed";
    return bookings.find((x) => x.date === ds)?.status || null;
  };
  const toggleClosed = (ds: string) => { setClosedDates((p) => p.includes(ds) ? p.filter((x) => x !== ds) : [...p, ds]); toast("Date availability updated.", "info"); };

  // Rooms
  const openAdd = () => { setEditRoom(null); setRf({ name: "", beds: "", capacity: "", price: "", desc: "", img: "" }); setImgPrev(""); setShowModal(true); };
  const openEdit = (r: Room) => { setEditRoom(r); setRf({ name: r.name, beds: r.beds, capacity: String(r.capacity), price: String(r.price), desc: r.desc, img: r.img }); setImgPrev(r.img); setShowModal(true); };
  const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = (ev) => { setImgPrev(ev.target?.result as string); setRf((x) => ({ ...x, img: ev.target?.result as string })); }; rd.readAsDataURL(f);
  };
  const saveRoom = () => {
    const data = { ...rf, capacity: Number(rf.capacity), price: Number(rf.price), img: rf.img || "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=85" };
    if (editRoom) { setRooms((rs) => rs.map((r) => r.id === editRoom.id ? { ...r, ...data } : r)); toast("Room updated.", "success"); }
    else { setRooms((rs) => [...rs, { id: Date.now(), ...data }]); toast("Room added.", "success"); }
    setShowModal(false);
  };
  const deleteRoom = (id: number) => { setRooms((rs) => rs.filter((r) => r.id !== id)); toast("Room removed.", "warning"); };
  const deleteGalleryImg = (idx: number) => { setGalleryImgs((g) => g.filter((_, i) => i !== idx)); toast("Photo removed.", "warning"); };
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => { Array.from(e.target.files || []).forEach((f) => { const rd = new FileReader(); rd.onload = (ev) => { setGalleryImgs((g) => [...g, ev.target?.result as string]); toast("Photo added.", "success"); }; rd.readAsDataURL(f); }); };
  const archiveMessage = (msg: CustomerMessage) => { setCustomerMessages((p) => p.filter((m) => m.id !== msg.id)); setArchivedMessages((p) => [...p, msg]); toast("Message archived.", "info"); setConfirmArchiveMsg(null); };

  const goTab = (t: AdminTab) => { setTab(t); if (mob) setSideOpen(false); };

  const adminBg = isDark ? "#080706" : "#f2ede6";
  const sideBg = isDark ? "#0a0906" : "#ffffff";
  const sideBorder = isDark ? "#141210" : "#ede8df";
  const cBg = isDark ? "#0c0b09" : "#ffffff";
  const cBr = isDark ? "#1a1714" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const sideS = (t: AdminTab): React.CSSProperties => ({
    padding: "11px 20px 11px 24px", cursor: "pointer", fontSize: 11, letterSpacing: 1.5,
    borderLeft: `2px solid ${tab === t ? gold : "transparent"}`,
    background: tab === t ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)") : "transparent",
    color: tab === t ? gold : (isDark ? "#4a4035" : "#9a8878"),
    display: "flex", alignItems: "center", gap: 10, transition: "all .15s",
  });

  return (
    <div style={{ background: adminBg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Mobile Top Bar */}
      {mob && (
        <div style={{ background: sideBg, borderBottom: `1px solid ${sideBorder}`, padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: gold }} />
            <span style={{ color: isDark ? "#e0e0e0" : "#111", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 15, letterSpacing: 2 }}>STONEWOOD</span>
          </div>
          <button onClick={() => setSideOpen((o) => !o)} style={{ background: "none", border: `1px solid ${cBr}`, color: isDark ? "#888" : "#666", cursor: "pointer", padding: "6px 10px", borderRadius: 3, fontSize: 13 }}>{sideOpen ? "✕" : "☰"}</button>
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        {(!mob || sideOpen) && (
          <div style={{ width: mob ? "100%" : 220, background: sideBg, borderRight: mob ? "none" : `1px solid ${sideBorder}`, flexShrink: 0, display: "flex", flexDirection: "column", position: mob ? "fixed" : "relative", inset: mob ? "56px 0 0 0" : "auto", zIndex: mob ? 80 : 1, overflowY: "auto", boxShadow: isDark ? "none" : "2px 0 16px rgba(80,55,20,0.06)" }}>
            {!mob && (
              <div style={{ padding: "32px 24px 24px", borderBottom: `1px solid ${sideBorder}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: gold, flexShrink: 0 }} />
                  <span style={{ color: isDark ? "#e0e0e0" : "#111", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 16, letterSpacing: 2 }}>STONEWOOD</span>
                </div>
                <div style={{ color: isDark ? "#333" : "#bbb", fontSize: 9, letterSpacing: 3, marginLeft: 16 }}>ADMIN PANEL</div>
              </div>
            )}
            <div style={{ padding: "16px 0", flex: 1 }}>
              {tabs.map((t) => (
                <div key={t} onClick={() => goTab(t)} className="sw-sidebar-item" style={sideS(t)}>
                  <span style={{ fontSize: 13, opacity: tab === t ? 1 : 0.6 }}>{tabIcons[t]}</span>
                  <span>{t.toUpperCase()}</span>
                  {t === "Bookings" && onHold > 0 && <span style={{ background: gold, color: "#000", fontSize: 9, fontWeight: 800, borderRadius: 20, padding: "2px 7px", marginLeft: "auto", letterSpacing: 0 }}>{onHold}</span>}
                  {t === "On-Site" && bookings.filter(b => b.package === "On-Site Reservation" && b.status === "On Hold").length > 0 && <span style={{ background: "#4a9fd4", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 20, padding: "2px 7px", marginLeft: "auto", letterSpacing: 0 }}>{bookings.filter(b => b.package === "On-Site Reservation" && b.status === "On Hold").length}</span>}
                  {t === "Customer Service" && customerMessages.length > 0 && <span style={{ background: "#4a9fd4", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 20, padding: "2px 7px", marginLeft: "auto", letterSpacing: 0 }}>{customerMessages.length}</span>}
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${sideBorder}` }}>
              <button onClick={() => setShowLogoutConfirm(true)} style={{ width: "100%", background: "transparent", color: isDark ? "#444" : "#aaa", border: `1px solid ${isDark ? "#1a1a1a" : "#ddd"}`, padding: "9px 12px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                SIGN OUT
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div style={{ flex: 1, padding: mob ? "20px 16px" : "40px", overflowY: "auto", minWidth: 0, background: adminBg }}>

          {/* DASHBOARD */}
          {tab === "Dashboard" && (
            <div>
              <div style={{ marginBottom: 32 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>OVERVIEW</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Dashboard</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: mob ? 10 : 14, marginBottom: 36 }}>
                {[["On Hold", onHold, "#f5c518", "Pending review"], ["Confirmed", confirmed, "#4caf50", "Approved"], ["Completed", completed, "#4a9fd4", "Past stays"], ["Rooms", rooms.length, gold, "Active listings"]].map(([l, v, c, sub]) => (
                  <div key={l as string} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? "14px 12px" : "22px 20px", position: "relative", overflow: "hidden", boxShadow: C.shadowCard }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${c}22,${c})` }} />
                    <div style={{ color: isDark ? "#4a4035" : "#9a8878", fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>{(l as string).toUpperCase()}</div>
                    <div style={{ color: c as string, fontSize: mob ? 26 : 34, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif", lineHeight: 1, marginBottom: 6 }}>{v as number}</div>
                    {!mob && <div style={{ color: isDark ? "#3a3025" : "#b0a090", fontSize: 11 }}>{sub as string}</div>}
                  </div>
                ))}
              </div>

              {/* Pending approvals */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3 }}>PENDING APPROVALS</p>
                {onHold > 0 && <span style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 10, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.15)" }}>{onHold} awaiting</span>}
              </div>
              <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 560 : 0 }}>
                    <thead><tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["ID", "Guest", "Email", "Phone", "Date", "Total", "Status", "Actions"].map((h) => <th key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 9, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {bookings.filter((b) => b.status === "On Hold").map((b, idx) => (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                          <td style={{ padding: "12px 14px", color: gold, fontSize: 11, whiteSpace: "nowrap", fontFamily: "monospace" }}>{b.id}</td>
                          <td style={{ padding: "12px 14px", color: C.textH, fontSize: 12 }}>{b.name}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11 }}>{b.email || "—"}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.contact || "—"}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.date}</td>
                          <td style={{ padding: "12px 14px", color: C.textH, fontSize: 12, whiteSpace: "nowrap", fontWeight: 600 }}>{fmt(b.total)}</td>
                          <td style={{ padding: "12px 14px" }}><span style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 9, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.2)", letterSpacing: 1 }}>ON HOLD</span></td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Confirmed", guestName: b.name })} style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.2)", padding: "5px 12px", fontSize: 10, cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap", letterSpacing: 1 }}>ACCEPT</button>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Cancelled", guestName: b.name })} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>REJECT</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {onHold === 0 && <tr><td colSpan={8} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 13 }}>No pending bookings.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Availability Calendar */}
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, margin: 0 }}>AVAILABILITY OVERVIEW</p>
                  <div style={{ display: "flex", gap: 14 }}>
                    {[["Booked", "#4caf50"], ["Closed", "#e07070"], ["Available", isDark ? "#2a2620" : "#e8e0d4"]].map(([l, c]) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: c }} /><span style={{ color: C.textXS, fontSize: 10 }}>{l}</span></div>
                    ))}
                  </div>
                </div>
                {(() => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const bookedSet = new Set(bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date));
                  const closedSet2 = new Set(closedDates);
                  const monthDates = [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)];
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 16 }}>
                      {monthDates.map((mDate, mi) => {
                        const yr = mDate.getFullYear(), mo = mDate.getMonth();
                        const dIM = new Date(yr, mo + 1, 0).getDate();
                        const fD = new Date(yr, mo, 1).getDay();
                        const toStr = (d: number) => `${yr}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                        const label = mDate.toLocaleString("default", { month: "long", year: "numeric" });
                        return (
                          <div key={mi} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "20px 18px", boxShadow: C.shadowCard }}>
                            <p style={{ color: gold, fontSize: 11, fontFamily: "'Cormorant Garamond',Georgia,serif", letterSpacing: 2, marginBottom: 14, textAlign: "center" }}>{label}</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
                              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 9, color: C.textXS, padding: "2px 0" }}>{d}</div>)}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
                              {Array.from({ length: fD }).map((_, i) => <div key={`e${i}`} />)}
                              {Array.from({ length: dIM }, (_, i) => i + 1).map((d) => {
                                const ds = toStr(d);
                                const dayDate = new Date(yr, mo, d);
                                const isPast = dayDate < today;
                                const isBooked = bookedSet.has(ds);
                                const isClosed = closedSet2.has(ds);
                                let bg = isDark ? "#1a1814" : "#f0ede7", col = C.textB, dot: string | null = null;
                                if (isPast) { bg = isDark ? "#0c0b09" : "#f8f6f3"; col = C.textXS; }
                                else if (isBooked) { bg = isDark ? "#0f2018" : "#eafaf0"; col = "#4caf50"; dot = "#4caf50"; }
                                else if (isClosed) { bg = isDark ? "#1a0a0a" : "#fff0f0"; col = "#e07070"; dot = "#e07070"; }
                                const booking = isBooked ? bookings.find((b) => b.date === ds && b.status !== "Cancelled") : null;
                                return (
                                  <div key={d} title={booking ? `${booking.name} · ${booking.guests} guests` : isClosed ? "Closed" : ""} style={{ textAlign: "center", padding: "5px 2px", borderRadius: 3, background: bg, color: col, fontSize: 11, cursor: booking || isClosed ? "pointer" : "default", userSelect: "none", position: "relative", transition: "background .1s" }}>
                                    {d}{dot && <div style={{ width: 3, height: 3, borderRadius: "50%", background: dot, margin: "1px auto 0" }} />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* BOOKINGS TAB */}
          {tab === "Bookings" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>MANAGEMENT</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>All Bookings</h2>
              </div>
              <BookingsTab bookings={bookings.filter(b => b.package !== "On-Site Reservation" || b.status === "Confirmed" || b.status === "Completed")} updateStatus={updateStatus} mob={mob} rooms={rooms} />
            </div>
          )}

          {/* ON-SITE TAB */}
          {tab === "On-Site" && (() => {
            const onsiteBookings = bookings.filter(b => b.package === "On-Site Reservation");
            const onsitePending   = onsiteBookings.filter(b => b.status === "On Hold");
            const onsiteConfirmed = onsiteBookings.filter(b => b.status === "Confirmed");
            const onsiteCompleted = onsiteBookings.filter(b => b.status === "Completed");

            return (
              <OnsiteTab
                onsiteBookings={onsiteBookings}
                onsitePending={onsitePending}
                onsiteConfirmed={onsiteConfirmed}
                onsiteCompleted={onsiteCompleted}
                updateStatus={updateStatus}
                isDark={isDark}
                C={C}
                cBg={cBg}
                cBr={cBr}
                mob={mob}
                toast={toast}
                gold={gold}
              />
            );
          })()}

          {/* OCCUPANCY */}
          {tab === "Occupancy" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>CALENDAR VIEW</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Occupancy</h2>
                <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>Click a date to toggle it as closed.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={{ background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", borderRadius: 4, padding: "6px 14px", fontSize: 13 }}>‹</button>
                <span style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18 }}>{calMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
                <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} style={{ background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", borderRadius: 4, padding: "6px 14px", fontSize: 13 }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center", color: C.textXS, fontSize: 10, padding: "6px 0", letterSpacing: 1 }}>{d}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 24 }}>
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const ds = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const status = getDateStatus(d);
                  const isPast = new Date(calMonth.getFullYear(), calMonth.getMonth(), d) < new Date(new Date().setHours(0, 0, 0, 0));
                  let bg = isDark ? "#111" : "#f0ede7", col = C.textB, border = `1px solid ${cBr}`;
                  if (isPast) { bg = isDark ? "#0c0b09" : "#f8f6f3"; col = C.textXS; }
                  else if (status === "Closed") { bg = isDark ? "#1a0a0a" : "#fff0f0"; col = "#e07070"; border = "1px solid rgba(229,85,85,0.3)"; }
                  else if (status === "Confirmed" || status === "On Hold") { bg = isDark ? "#0f2018" : "#eafaf0"; col = "#4caf50"; border = "1px solid rgba(76,175,80,0.3)"; }
                  else if (status === "Completed") { bg = isDark ? "#0f1a2a" : "#e8f4fb"; col = "#4a9fd4"; border = "1px solid rgba(74,159,212,0.3)"; }
                  return (
                    <div key={d} onClick={() => !isPast && !(status && status !== "Closed") && toggleClosed(ds)} style={{ textAlign: "center", padding: mob ? "12px 4px" : "16px 4px", borderRadius: 6, background: bg, border, color: col, fontSize: mob ? 11 : 13, cursor: isPast ? "default" : (status && status !== "Closed") ? "default" : "pointer", userSelect: "none", transition: "all .15s", position: "relative" }}>
                      {d}
                      {status && <div style={{ fontSize: 8, marginTop: 3, opacity: 0.8 }}>{status === "Closed" ? "CLOSED" : status === "On Hold" ? "HOLD" : status?.toUpperCase().slice(0, 4)}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[["Booked/Confirmed", "#4caf50"], ["On Hold", "#f5c518"], ["Completed", "#4a9fd4"], ["Closed", "#e07070"], ["Click to close/open", gold]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: c }} /><span style={{ color: C.textS, fontSize: 11 }}>{l}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* ROOMS */}
          {tab === "Rooms" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
                <div><p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>ACCOMMODATIONS</p><h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Rooms</h2></div>
                <button onClick={openAdd} style={{ ...goldBtn, padding: "10px 20px", fontSize: 11, letterSpacing: 2 }}>+ ADD ROOM</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
                {rooms.map((r) => (
                  <div key={r.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden", boxShadow: C.shadowCard }}>
                    <div style={{ position: "relative", overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.img} alt={r.name} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.5),transparent 60%)" }} />
                      <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: "2px 8px" }}>👥 Up to {r.capacity}</span>
                        <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{fmt(r.price)}<span style={{ fontSize: 9, opacity: 0.8 }}>/night</span></span>
                      </div>
                    </div>
                    <div style={{ padding: "16px 18px" }}>
                      <h4 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 16, marginBottom: 4, fontWeight: 400 }}>{r.name}</h4>
                      <p style={{ color: gold, fontSize: 11, marginBottom: 8 }}>🛏 {r.beds}</p>
                      <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>{r.desc}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(r)} style={{ ...outBtn, flex: 1, padding: "8px 12px", fontSize: 10, letterSpacing: 1 }}>EDIT</button>
                        <button onClick={() => setConfirmRemoveRoom(r)} style={{ flex: 1, background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "8px 12px", fontSize: 10, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>REMOVE</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GALLERY */}
          {tab === "Gallery" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
                <div><p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>MEDIA</p><h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Gallery</h2></div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={galleryFileRef} type="file" accept="image/*" multiple onChange={handleGalleryUpload} style={{ display: "none" }} />
                  <button onClick={() => galleryFileRef.current?.click()} style={{ ...goldBtn, padding: "10px 20px", fontSize: 11, letterSpacing: 2 }}>+ ADD PHOTOS</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3,1fr)", gap: 12 }}>
                {galleryImgs.map((src, i) => (
                  <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${cBr}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                    <button onClick={() => deleteGalleryImg(i)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(229,85,85,0.9)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INVENTORY */}
          {tab === "Inventory" && <InventoryTab />}

          {/* ANALYTICS */}
          {tab === "Analytics" && <AnalyticsTab bookings={bookings} reviews={reviews} />}

          {/* REPORTS */}
          {tab==="Reports"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,flexWrap:"wrap",gap:12}}>
                <div><p style={{color:C.textXS,fontSize:10,letterSpacing:3,marginBottom:8}}>INSIGHTS</p><h2 style={{color:C.textH,fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:mob?22:26,fontWeight:400,margin:0}}>Reports</h2></div>
                <button onClick={()=>{
                  // Build CSV content for Excel
                  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  const now=new Date();
                  const selMonthIdx=now.getMonth();
                  const selYear=now.getFullYear();
                  const monthStr=String(selMonthIdx+1).padStart(2,"0");
                  const monthBookings=bookings.filter(b=>b.date&&b.date.startsWith(`${selYear}-${monthStr}`));
                  const header=["Booking ID","Guest Name","Contact","Email","Date","Package","Guests","Overtime (hrs)","Rooms","Total (₱)","Downpayment (₱)","Status","Payment Proof","Notes"];
                  const rows=monthBookings.map(b=>[
                    b.id,b.name,b.contact||"",b.email||"",b.date,b.package,b.guests,b.overtime||0,
                    (b.rooms||[]).map(rid=>rooms.find(r=>r.id===rid)?.name||"").filter(Boolean).join(" | ")||"None",
                    b.total,b.downpayment,b.status,b.paymentProof?"Yes":"No",b.notes||""
                  ]);
                  const totalRev=monthBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.total,0);
                  const totalDown=monthBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.downpayment,0);
                  const summary=[
                    [],
                    ["MONTHLY SUMMARY",""],
                    ["Month",`${months[selMonthIdx]} ${selYear}`],
                    ["Total Bookings",monthBookings.length],
                    ["Confirmed",monthBookings.filter(b=>b.status==="Confirmed").length],
                    ["Completed",monthBookings.filter(b=>b.status==="Completed").length],
                    ["Cancelled",monthBookings.filter(b=>b.status==="Cancelled").length],
                    ["On Hold",monthBookings.filter(b=>b.status==="On Hold").length],
                    ["Total Revenue (non-cancelled)",totalRev],
                    ["Total Downpayments Collected",totalDown],
                    ["Total Guests",monthBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.guests,0)],
                  ];
                  const csvRows=[header,...rows,...summary];
                  const csv=csvRows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
                  const url=URL.createObjectURL(blob);
                  const a=document.createElement("a");
                  a.href=url;a.download=`StoneWood_Report_${months[selMonthIdx]}${selYear}.csv`;
                  a.click();URL.revokeObjectURL(url);
                  toast(`Report exported: ${months[selMonthIdx]} ${selYear}.csv`,"success");
                }} style={{...goldBtn,padding:"10px 20px",fontSize:10,letterSpacing:2,display:"flex",alignItems:"center",gap:8}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  EXPORT THIS MONTH
                </button>
              </div>

              {/* KPI Cards */}
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:mob?10:14,marginBottom:28}}>
                {[
                  ["Total Revenue",fmt(bookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.total,0)),"💰","#4caf50"],
                  ["Down Collected",fmt(bookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.downpayment,0)),"📥",gold],
                  ["Active Bookings",bookings.filter(b=>["On Hold","Confirmed"].includes(b.status)).length,"📋","#4a9fd4"],
                  ["Completed",bookings.filter(b=>b.status==="Completed").length,"✅","#4caf50"]
                ].map(([l,v,icon,c])=>(
                  <div key={l} style={{background:cBg,border:`1px solid ${cBr}`,borderRadius:10,padding:mob?"16px 12px":"22px 18px",display:"flex",alignItems:"center",gap:14,boxShadow:C.shadowCard,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,bottom:0,width:3,background:`linear-gradient(to bottom,${c}66,${c})`}}/>
                    <div style={{width:42,height:42,borderRadius:10,background:`${c}14`,border:`1px solid ${c}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
                    <div><div style={{color:C.textXS,fontSize:9,letterSpacing:2,marginBottom:5}}>{(l as string).toUpperCase()}</div><div style={{color: c as string, fontSize: mob ? 18 : 22, fontWeight: 700, fontFamily:"'Cormorant Garamond',Georgia,serif"}}>{String(v)}</div></div>
                  </div>
                ))}
              </div>

              {/* Monthly Revenue Breakdown */}
              {(()=>{
                const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const monthlyData=months.map((_,mi)=>{
                  const m=String(mi+1).padStart(2,"0");
                  const mBookings=bookings.filter(b=>b.date&&b.date.startsWith(`2026-${m}`)&&b.status!=="Cancelled");
                  return{label:months[mi],revenue:mBookings.reduce((s,b)=>s+b.total,0),count:mBookings.length,guests:mBookings.reduce((s,b)=>s+b.guests,0)};
                });
                const maxRev=Math.max(...monthlyData.map(m=>m.revenue),1);
                return(
                  <div style={{background:cBg,border:`1px solid ${cBr}`,borderRadius:10,padding:"24px 20px",marginBottom:20,boxShadow:C.shadowCard}}>
                    <h3 style={{color:C.textS,fontSize:10,letterSpacing:2,marginBottom:20}}>MONTHLY REVENUE (2026)</h3>
                    <div style={{display:"flex",alignItems:"flex-end",gap:mob?5:10,height:150,paddingBottom:32,position:"relative"}}>
                      {monthlyData.map((m,i)=>(
                        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          {m.revenue>0&&<span style={{color:gold,fontSize:mob?7:9,fontWeight:700,textAlign:"center",whiteSpace:"nowrap"}}>₱{m.revenue>=1000?`${(m.revenue/1000).toFixed(1)}k`:m.revenue}</span>}
                          <div style={{width:"100%",background:m.revenue>0?(isDark?"#1a1400":"#fef6d8"):isDark?"#100e0b":"#f0ece4",border:`1px solid ${m.revenue>0?gold+"66":cBr}`,borderRadius:"3px 3px 0 0",height:`${(m.revenue/maxRev)*118}px`,minHeight:m.revenue>0?4:0,transition:"height .4s cubic-bezier(.22,1,.36,1)"}}/>
                          <span style={{color:C.textXS,fontSize:mob?7:9,position:"absolute",bottom:0}}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Booking Status Breakdown + Cancellation Rate */}
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:20}}>
                <div style={{background:cBg,border:`1px solid ${cBr}`,borderRadius:10,padding:"24px 20px",boxShadow:C.shadowCard}}>
                  <h3 style={{color:C.textS,fontSize:10,letterSpacing:2,marginBottom:18}}>STATUS BREAKDOWN</h3>
                  {[["On Hold","#f5c518"],["Confirmed","#4caf50"],["Completed","#4a9fd4"],["Cancelled","#e55"]].map(([s,c])=>{
                    const n=bookings.filter(b=>b.status===s).length;
                    const pct=bookings.length?Math.round((n/bookings.length)*100):0;
                    return(
                      <div key={s} style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.textB,fontSize:12}}>{s}</span><span style={{color:c,fontWeight:700,fontSize:12}}>{n} <span style={{color:C.textXS,fontWeight:400}}>({pct}%)</span></span></div>
                        <div style={{background:isDark?"#1a1714":"#ede8de",borderRadius:4,height:6,overflow:"hidden"}}><div style={{width:`${pct}%`,background:c,height:"100%",borderRadius:4,transition:"width .6s cubic-bezier(.22,1,.36,1)"}}/></div>
                      </div>
                    );
                  })}
                </div>
                <div style={{background:cBg,border:`1px solid ${cBr}`,borderRadius:10,padding:"24px 20px",boxShadow:C.shadowCard}}>
                  <h3 style={{color:C.textS,fontSize:10,letterSpacing:2,marginBottom:18}}>FINANCIAL SUMMARY</h3>
                  {(()=>{
                    const active=bookings.filter(b=>b.status!=="Cancelled");
                    const totalRev=active.reduce((s,b)=>s+b.total,0);
                    const collected=active.reduce((s,b)=>s+b.downpayment,0);
                    const balance=totalRev-collected;
                    const cancelled=bookings.filter(b=>b.status==="Cancelled").length;
                    const cancelRate=bookings.length?Math.round((cancelled/bookings.length)*100):0;
                    const avgBookingVal=active.length?Math.round(totalRev/active.length):0;
                    return(
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {[["Gross Revenue",fmt(totalRev),"#4caf50"],["Downpayments In",fmt(collected),gold],["Balance Remaining",fmt(balance),"#4a9fd4"],["Avg Booking Value",fmt(avgBookingVal),C.textH],["Cancellation Rate",`${cancelRate}%`,"#e55"]].map(([l,v,c])=>(
                          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${cBr}`}}>
                            <span style={{color:C.textS,fontSize:12}}>{l}</span>
                            <span style={{color:c,fontWeight:700,fontSize:13}}>{v}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Auto-Reject Settings */}
              <div style={{background:cBg,border:`1px solid ${cBr}`,borderRadius:10,padding:"24px 20px",marginBottom:20,boxShadow:C.shadowCard}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                  <div>
                    <h3 style={{color:C.textS,fontSize:10,letterSpacing:2,margin:"0 0 4px"}}>AUTO-REJECT SETTINGS</h3>
                    <p style={{color:C.textXS,fontSize:11,margin:0}}>Automatically cancel "On Hold" bookings if payment is not confirmed within the set window.</p>
                  </div>
                  <button onClick={()=>setAutoRejectEnabled(v=>!v)} style={{padding:"7px 16px",fontSize:10,fontWeight:700,borderRadius:20,cursor:"pointer",letterSpacing:1,background:autoRejectEnabled?"rgba(76,175,80,0.1)":"rgba(229,85,85,0.08)",color:autoRejectEnabled?"#4caf50":"#e55",border:`1px solid ${autoRejectEnabled?"rgba(76,175,80,0.3)":"rgba(229,85,85,0.25)"}`}}>
                    {autoRejectEnabled?"● ENABLED":"○ DISABLED"}
                  </button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                  <label style={{color:C.textXS,fontSize:10,letterSpacing:2}}>PAYMENT WINDOW</label>
                  <div style={{display:"flex",gap:8}}>
                    {[12,24,48,72].map(h=>(
                      <button key={h} onClick={()=>setAutoRejectHours(h)} style={{padding:"7px 14px",fontSize:11,fontWeight:700,borderRadius:6,cursor:"pointer",background:autoRejectHours===h?`${gold}18`:"transparent",color:autoRejectHours===h?gold:C.textS,border:`1px solid ${autoRejectHours===h?gold:cBr}`}}>
                        {h}h
                      </button>
                    ))}
                  </div>
                  <span style={{color:C.textXS,fontSize:11}}>Current: bookings auto-cancelled after <strong style={{color:gold}}>{autoRejectHours} hours</strong> with no payment</span>
                </div>
              </div>

              {/* Export by Month */}
              <div style={{background:cBg,border:`1px solid ${cBr}`,borderRadius:10,padding:"24px 20px",boxShadow:C.shadowCard}}>
                <h3 style={{color:C.textS,fontSize:10,letterSpacing:2,marginBottom:16}}>EXPORT MONTHLY REPORTS</h3>
                <p style={{color:C.textXS,fontSize:11,marginBottom:16}}>Download a full booking report for any month as a CSV file (opens in Excel/Sheets).</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((mon,mi)=>{
                    const m=String(mi+1).padStart(2,"0");
                    const mBookings=bookings.filter(b=>b.date&&b.date.startsWith(`2026-${m}`));
                    const hasData=mBookings.length>0;
                    return(
                      <button key={mon} disabled={!hasData} onClick={()=>{
                        const header=["Booking ID","Guest Name","Contact","Email","Date","Package","Guests","Overtime (hrs)","Rooms","Total (₱)","Downpayment (₱)","Status","Payment Proof","Notes"];
                        const rows=mBookings.map(b=>[b.id,b.name,b.contact||"",b.email||"",b.date,b.package,b.guests,b.overtime||0,(b.rooms||[]).map(rid=>rooms.find(r=>r.id===rid)?.name||"").filter(Boolean).join(" | ")||"None",b.total,b.downpayment,b.status,b.paymentProof?"Yes":"No",b.notes||""]);
                        const totalRev=mBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.total,0);
                        const summary=[[],["SUMMARY",""],["Month",`${mon} 2026`],["Bookings",mBookings.length],["Revenue (non-cancelled)",totalRev],["Guests",mBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.guests,0)]];
                        const csv=[header,...rows,...summary].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                        const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
                        const url=URL.createObjectURL(blob);
                        const a=document.createElement("a");a.href=url;a.download=`StoneWood_${mon}2026.csv`;a.click();URL.revokeObjectURL(url);
                        toast(`Exported ${mon} 2026 report.`,"success");
                      }} style={{padding:"8px 14px",fontSize:10,fontWeight:700,borderRadius:6,cursor:hasData?"pointer":"not-allowed",letterSpacing:1,background:hasData?(isDark?"rgba(201,168,76,0.08)":"rgba(201,168,76,0.1)"):(isDark?"#0e0c09":"#f5f0e8"),color:hasData?gold:C.textXS,border:`1px solid ${hasData?gold+"55":cBr}`,opacity:hasData?1:0.5,display:"flex",alignItems:"center",gap:5}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {mon}
                        {hasData&&<span style={{background:`${gold}22`,borderRadius:10,padding:"1px 6px",fontSize:9}}>{mBookings.length}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMER SERVICE */}
          {tab === "Customer Service" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>MESSAGES</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Customer Service</h2>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                {(["inbox", "archive"] as const).map((v) => (
                  <button key={v} onClick={() => setCsView(v)} style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: "pointer", background: csView === v ? `${gold}18` : "transparent", color: csView === v ? gold : C.textS, border: `1px solid ${csView === v ? gold + "55" : cBr}`, letterSpacing: 1 }}>{v.toUpperCase()} {v === "inbox" && customerMessages.length > 0 && `(${customerMessages.length})`}{v === "archive" && archivedMessages.length > 0 && `(${archivedMessages.length})`}</button>
                ))}
              </div>
              {(csView === "inbox" ? customerMessages : archivedMessages).length === 0 ? (
                <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "52px 20px", textAlign: "center", boxShadow: C.shadowCard }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                  <p style={{ color: C.textS, fontSize: 14 }}>{csView === "inbox" ? "No new messages." : "No archived messages."}</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(csView === "inbox" ? customerMessages : archivedMessages).map((msg) => (
                    <div key={msg.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "20px 22px", boxShadow: C.shadowCard }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ color: C.textH, fontSize: 14, fontWeight: 600 }}>{msg.name}</div>
                          <div style={{ color: C.textXS, fontSize: 11 }}>{msg.email} · {msg.date}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ background: `${gold}18`, color: gold, fontSize: 9, padding: "3px 8px", borderRadius: 20, border: `1px solid ${gold}44`, letterSpacing: 1 }}>{msg.type.toUpperCase()}</span>
                          {csView === "inbox" && <button onClick={() => setConfirmArchiveMsg(msg)} style={{ background: "transparent", border: `1px solid ${cBr}`, color: C.textXS, padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4 }}>ARCHIVE</button>}
                        </div>
                      </div>
                      <p style={{ color: C.textB, fontSize: 13, lineHeight: 1.7, margin: 0 }}>{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
              {confirmArchiveMsg && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }}>
                  <div style={{ background: isDark ? "#0e0c09" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: "28px 26px", width: "100%", maxWidth: 400 }}>
                    <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, marginBottom: 12, fontWeight: 400 }}>Archive this message?</h3>
                    <p style={{ color: C.textS, fontSize: 13, marginBottom: 22 }}>From <strong style={{ color: C.textH }}>{confirmArchiveMsg.name}</strong>: "{confirmArchiveMsg.message.slice(0, 80)}{confirmArchiveMsg.message.length > 80 ? "…" : ""}"</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setConfirmArchiveMsg(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: 11, fontSize: 11, cursor: "pointer", borderRadius: 6 }}>CANCEL</button>
                      <button onClick={() => archiveMessage(confirmArchiveMsg)} style={{ ...goldBtn, flex: 2 }}>ARCHIVE</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Dashboard Accept / Reject Confirm Modal (#3) ── */}
      {dashConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} role="dialog" aria-modal="true" aria-labelledby="dash-confirm-title">
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.35)" : "rgba(229,85,85,0.35)"}`, borderRadius: 14, padding: mob ? "28px 20px" : "36px 32px", width: "100%", maxWidth: 410, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
            {/* Icon */}
            <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 26, background: dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.1)" : "rgba(229,85,85,0.1)", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}` }}>
              {dashConfirm.action === "Confirmed" ? "✓" : "✕"}
            </div>

            <h3 id="dash-confirm-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              {dashConfirm.action === "Confirmed" ? "Accept this booking?" : "Reject this booking?"}
            </h3>
            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              {dashConfirm.action === "Confirmed"
                ? <>You are about to <strong style={{ color: "#4caf50" }}>accept</strong> the booking for <strong style={{ color: C.textH }}>{dashConfirm.guestName}</strong>. This will confirm their reservation.</>
                : <>You are about to <strong style={{ color: "#e55" }}>reject</strong> the booking for <strong style={{ color: C.textH }}>{dashConfirm.guestName}</strong>. This cannot be undone.</>
              }
            </p>

            {/* Warning callout */}
            <div style={{ background: dashConfirm.action === "Confirmed" ? (isDark ? "rgba(76,175,80,0.06)" : "rgba(76,175,80,0.05)") : (isDark ? "rgba(229,85,85,0.06)" : "rgba(229,85,85,0.04)"), border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.2)" : "rgba(229,85,85,0.15)"}`, borderRadius: 8, padding: "11px 14px", marginBottom: 22, display: "flex", gap: 8 }}>
              <span style={{ flexShrink: 0 }}>{dashConfirm.action === "Confirmed" ? "✅" : "⚠️"}</span>
              <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>
                {dashConfirm.action === "Confirmed"
                  ? "Make sure the guest's GCash payment proof has been verified before accepting."
                  : "The guest will be notified that their booking has been declined."
                }
              </span>
            </div>

            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDashConfirm(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "12px 16px", fontSize: 11, cursor: "pointer", borderRadius: 8, letterSpacing: 1 }}>
                GO BACK
              </button>
              <button
                onClick={() => {
                  updateStatus(dashConfirm.bookingId, dashConfirm.action);
                  if (dashConfirm.action === "Confirmed") toast(`Booking accepted for ${dashConfirm.guestName}.`, "success");
                  else toast(`Booking rejected for ${dashConfirm.guestName}.`, "warning");
                  setDashConfirm(null);
                }}
                style={{ flex: 2, padding: "12px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 8, letterSpacing: 2, background: dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.12)" : "rgba(229,85,85,0.10)", color: dashConfirm.action === "Confirmed" ? "#4caf50" : "#e55", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}` }}
              >
                {dashConfirm.action === "Confirmed" ? "YES, ACCEPT" : "YES, REJECT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 20 }}>
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: "32px 28px", width: "100%", maxWidth: 380, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, fontSize: 20 }}>🔐</div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, marginBottom: 8 }}>Sign out?</h3>
            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>You will be returned to the main site.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button onClick={() => { setShowLogoutConfirm(false); onLogout(); toast("Signed out.", "info"); }} style={{ flex: 2, background: isDark ? "rgba(255,255,255,0.04)" : "#f5f0e8", color: C.textH, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2 }}>YES, SIGN OUT</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Room Confirm */}
      {confirmRemoveRoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 20 }}>
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: "1px solid rgba(229,85,85,0.22)", borderRadius: 12, padding: "28px 26px", width: "100%", maxWidth: 400, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
            {confirmRemoveRoom.img && <img src={confirmRemoveRoom.img} alt={confirmRemoveRoom.name} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 18 }} />}
            <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 20 }}>🛏</div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 8 }}>Remove this room?</h3>
            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}><strong style={{ color: C.textH }}>{confirmRemoveRoom.name}</strong> will be permanently removed from the system.</p>
            <p style={{ color: "rgba(229,85,85,0.75)", fontSize: 12, marginBottom: 22 }}>⚠ This action cannot be undone.</p>
            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmRemoveRoom(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button onClick={() => { deleteRoom(confirmRemoveRoom.id); setConfirmRemoveRoom(null); }} style={{ flex: 2, background: "rgba(229,85,85,0.10)", color: "#e55", border: "1px solid rgba(229,85,85,0.25)", padding: "11px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2 }}>YES, REMOVE</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Room Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16, overflowY: "auto" }}>
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${cBr}`, borderRadius: 12, padding: mob ? "24px 20px" : "36px", width: "100%", maxWidth: 480, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 400, marginBottom: 22 }}>{editRoom ? "Edit Room" : "Add New Room"}</h3>
            <div style={{ marginBottom: 18 }}>
              <label style={{ color: C.textXS, fontSize: 9, letterSpacing: 3, display: "block", marginBottom: 8 }}>ROOM IMAGE</label>
              {imgPrev && <img src={imgPrev} alt="preview" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8, marginBottom: 10, border: `1px solid ${cBr}` }} />}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} />
              <button onClick={() => fileRef.current?.click()} style={{ ...outBtn, width: "100%", padding: 11, fontSize: 11, borderRadius: 6 }}>📁 CHOOSE IMAGE</button>
            </div>
            {[["Room Name", "name", "text"], ["Bed Configuration", "beds", "text"], ["Max Capacity", "capacity", "number"], ["Price / Night (₱)", "price", "number"]].map(([l, k, t]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={{ color: C.textXS, fontSize: 9, letterSpacing: 3, display: "block", marginBottom: 6 }}>{(l as string).toUpperCase()}</label>
                <input type={t as string} value={rf[k as keyof typeof rf]} onChange={(e) => setRf((f) => ({ ...f, [k]: e.target.value }))} className="sw-input" style={inpS} />
              </div>
            ))}
            <div style={{ marginBottom: 22 }}>
              <label style={{ color: C.textXS, fontSize: 9, letterSpacing: 3, display: "block", marginBottom: 6 }}>DESCRIPTION</label>
              <textarea value={rf.desc} onChange={(e) => setRf((f) => ({ ...f, desc: e.target.value }))} rows={3} className="sw-input" style={{ ...inpS, resize: "vertical" }} />
            </div>
            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: 12, fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button onClick={saveRoom} style={{ ...goldBtn, flex: 2, borderRadius: 6 }}>SAVE ROOM</button>
            </div>
          </div>
        </div>
      )}

      <ThemeToggle />
    </div>
  );
}
