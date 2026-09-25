"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { Icon, type IconName } from "@/components/common/Icon";
import { Panel, StatCard, BarChart, ProgressRow } from "@/components/admin/charts";
import { fmt, fmtDate } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BookingsTab } from "@/components/admin/BookingsTab";
import { InventoryTab } from "@/components/admin/InventoryTab";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import { FacilitiesTab } from "@/components/admin/FacilitiesTab";
import { PackagesTab } from "@/components/admin/PackagesTab";
import { MaintenanceTab } from "@/components/admin/MaintenanceTab";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPackageTier, checkBookingAvailability, isRoomOpen, roomsTakenOn } from "@/lib/utils";
import { priceBooking, bookingLabel } from "@/lib/pricing";
import { SLOTS } from "@/lib/resort";
import { sanitizeName, sanitizeContact, isValidName, isValidPHNumber, isValidEmail, RESORT_MAX_CAPACITY, ROOM_BUNDLE_DISCOUNT_PCT, OVERTIME_MAX, OVERTIME_RATE } from "@/lib/validators";
import { getCurrentOccupancy } from "@/lib/occupancy";
import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";
import type { Room } from "@/types/room";
import type { AdminTab, CustomerMessage } from "@/types/admin";
import type { Facility } from "@/types/facility";
import type { InventoryItem } from "@/types/inventory";
import type { ResortPackage } from "@/types/package";


interface AdminProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  galleryImgs: string[];
  setGalleryImgs: React.Dispatch<React.SetStateAction<string[]>>;
  closedDates: string[];
  setClosedDates: React.Dispatch<React.SetStateAction<string[]>>;
  onLogout: () => void;
  customerMessages: CustomerMessage[];
  setCustomerMessages: React.Dispatch<React.SetStateAction<CustomerMessage[]>>;
  facilities: Facility[];
  setFacilities: React.Dispatch<React.SetStateAction<Facility[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  packages: ResortPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ResortPackage[]>>;
}

// ── WalkInTab sub-component ──────────────────────────────────────────────────
interface WalkInTabProps {
  walkInBookings: Booking[];
  wiPending: Booking[];
  wiConfirmed: Booking[];
  wiCompleted: Booking[];
  updateStatus: (id: string, status: string, reason?: string) => void;
  isDark: boolean;
  C: ReturnType<typeof T>;
  cBg: string;
  cBr: string;
  mob: boolean;
  toast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
  gold: string;
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  rooms: Room[];
  packages: ResortPackage[];
  facilities: Facility[];
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function WalkInTab({
  walkInBookings, wiPending, wiConfirmed, wiCompleted,
  updateStatus, isDark, C, cBg, cBr, mob, toast, gold,
  bookings, setBookings, rooms,
  packages, facilities,
}: WalkInTabProps) {
  const [wiSearch, setWiSearch] = useState("");
  const [wiTab, setWiTab] = useState<"Paid" | "Confirmed" | "Completed" | "Cancelled">("Paid");
  const [wiConfirmAction, setWiConfirmAction] = useState<{
    bookingId: string;
    action: "Confirmed" | "Cancelled" | "Completed";
    guestName: string;
  } | null>(null);

  // Archive a finished/cancelled walk-in reservation the same way BookingsTab
  // does for online ones — it moves out of this tab's lists (walkInBookings
  // excludes archived) and into the Bookings tab's segregated Archived view,
  // since that's the one place staff check for both sources' history.
  const [wiConfirmArchive, setWiConfirmArchive] = useState<Booking | null>(null);
  const archiveWiBooking = (b: Booking) => {
    setBookings((bs) => bs.map((x) => x.id === b.id ? { ...x, archived: true, archivedAt: new Date().toISOString() } : x));
    toast(`Reservation ${b.id} moved to archive.`, "info");
    setWiConfirmArchive(null);
  };

  // ── New walk-in intake form ──────────────────────────────────────
  const [showNewWalkIn, setShowNewWalkIn] = useState(false);
  const [wf, setWf] = useState({
    name: "", contact: "", email: "", guests: "10", overtime: "0",
    slot: "Day" as BookingSlot,
    rooms: [] as number[], date: todayStr(), time: "", notes: "", paymentCollected: true,
  });
  const setWfField = (k: string, v: unknown) => setWf((f) => ({ ...f, [k]: v }));
  // ── Package mode — the walk-in side is still the same booking flow, just
  // encoded by staff instead of the guest. Picking a package here fixes its
  // price/capacity/tier exactly like a Home page package deep-link does in
  // the online Book Now flow. ──────────────────────────────────────────────
  const [wfMode, setWfMode] = useState<"Custom" | "Package">("Custom");
  const [wfPkgId, setWfPkgId] = useState<number | null>(null);
  const wfSelectedPackage = wfMode === "Package" ? packages.find((p) => p.id === wfPkgId) ?? null : null;
  const isWfPackage = !!wfSelectedPackage;
  const wfRequiresRoom = !!wfSelectedPackage?.requiresRoom;
  const wfBookableRooms = rooms.filter((r) => isRoomOpen(r.id, facilities));
  // A room already rented to someone else that date can't be picked again.
  // Whole Day packages fix the slot; everything else uses the one picked.
  const wfSlot: BookingSlot = wfSelectedPackage?.slotMode === "WholeDay"
    ? "WholeDay"
    : isWfPackage && wf.slot === "WholeDay" ? "Day" : wf.slot;
  // Day overtime only: max OVERTIME_MAX hrs, and only while the Night slot
  // is free — checkBookingAvailability below treats it as holding the Night.
  const wfOvertime = wfSlot === "Day" ? Math.min(OVERTIME_MAX, Math.max(0, Number(wf.overtime) || 0)) : 0;
  const wfTakenRooms = roomsTakenOn(wf.date, wfSlot, bookings, wfOvertime);
  const wfShowRoomPicker = (!isWfPackage) || (isWfPackage && wfRequiresRoom);
  const toggleWfRoom = (id: number) => {
    if (isWfPackage && wfRequiresRoom) {
      setWfField("rooms", wf.rooms.includes(id) ? [] : [id]);
    } else {
      setWfField("rooms", wf.rooms.includes(id) ? wf.rooms.filter((r) => r !== id) : [...wf.rooms, id]);
    }
  };

  const wfPackageLabel = bookingLabel({
    packageTitle: wfSelectedPackage?.title,
    resource: isWfPackage ? wfSelectedPackage!.resource : "Pool",
    slot: wfSlot,
    hasRoom: wf.rooms.length > 0,
  });
  const wfGuests = isWfPackage ? wfSelectedPackage!.capacity : Number(wf.guests) || 0;
  // Same Shared-vs-Exclusive choice as the customer-facing Book Now flow:
  // staff can override the guest-count-derived default explicitly. A package
  // fixes its own tier — no override needed.
  const [wfTierChoice, setWfTierChoice] = useState<BookingTier | null>(null);
  const wfTier: BookingTier = isWfPackage
    ? wfSelectedPackage!.status
    : wfSlot === "WholeDay" ? "Exclusive" : (wfTierChoice ?? getPackageTier(wfGuests));
  const wfResource: BookingResource = isWfPackage ? wfSelectedPackage!.resource : "Pool";
  // An Exclusive walk-in buyout is fixed to the resort's full capacity, same
  // as online — the guest count field locks to it instead of staying editable.
  useEffect(() => {
    if (!isWfPackage && wfTier === "Exclusive" && wfGuests !== RESORT_MAX_CAPACITY) {
      setWfField("guests", String(RESORT_MAX_CAPACITY));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfTier, isWfPackage]);
  const wfDateCapacity = wf.date
    ? checkBookingAvailability(wf.date, wfSlot, wfGuests, wfTier, wfResource, bookings, facilities, wfOvertime)
    : { ok: true as const };
  const wfSelectedRoomDetails = wf.rooms.map((rid) => rooms.find((r) => r.id === rid)).filter((r): r is Room => !!r);
  // Same pricing code as Book Now and the server (lib/pricing.ts).
  const wfPrice = priceBooking({
    pkg: isWfPackage ? { price: wfSelectedPackage!.price, requiresRoom: wfRequiresRoom } : null,
    resource: wfResource,
    tier: wfTier,
    slot: wfSlot,
    guests: wfGuests,
    overtime: wfOvertime,
    roomPrices: wfSelectedRoomDetails.map((r) => r.price),
  });
  const wfTourBase = wfPrice.tourBase + wfPrice.exclusiveDiscount + wfPrice.bundleDiscount;
  const wfExclusiveDiscount = wfPrice.exclusiveDiscount + wfPrice.bundleDiscount;
  const wfOvertimeFee = wfPrice.overtimeFee;
  const wfRoomsFee = wfPrice.roomsFeeRaw;
  const wfRoomBundleDiscount = wfPrice.roomBundleDiscount;
  const wfTotal = wfPrice.total;
  const wfDown = wf.paymentCollected ? wfTotal : Math.ceil(wfTotal / 2);
  const wfRoomRequirementMet = !wfRequiresRoom || wf.rooms.length > 0;
  const wfRoomsFree = wf.rooms.every((r) => !wfTakenRooms.has(r));
  // Email is optional for a walk-in, but one that's typed must be real —
  // the server refuses a bad one, and the save would fail silently.
  const wfEmailOk = !wf.email.trim() || isValidEmail(wf.email);
  const wfValid = isValidName(wf.name) && isValidPHNumber(wf.contact) && wfEmailOk && wfGuests > 0 && wfDateCapacity.ok && wfRoomsFree && (!isWfPackage || (!!wfSelectedPackage && wfRoomRequirementMet));
  const openNewWalkIn = () => {
    setWf({ name: "", contact: "", email: "", guests: "10", overtime: "0", slot: "Day", rooms: [], date: todayStr(), time: "", notes: "", paymentCollected: true });
    setWfTierChoice(null);
    setWfMode("Custom");
    setWfPkgId(null);
    setShowNewWalkIn(true);
  };
  const saveWalkIn = () => {
    // Temporary until the server answers: the database assigns the real
    // SW- reference, and the bookings sync swaps it in.
    const id = `TMP-${Date.now()}`;
    setBookings((b) => [...b, {
      id,
      name: sanitizeName(wf.name),
      contact: sanitizeContact(wf.contact),
      // Blank, not "—": the server rejects a fake address, and a walk-in
      // without email is normal.
      email: wf.email.trim(),
      date: wf.date || todayStr(),
      guests: wfGuests || 1,
      package: wfPackageLabel,
      rooms: wf.rooms,
      overtime: wfOvertime,
      slot: wfSlot,
      total: wfTotal,
      downpayment: wfDown,
      status: wf.paymentCollected ? "Confirmed" : "Paid",
      paymentProof: wf.paymentCollected,
      notes: wf.time ? `Arrival: ${wf.time}${wf.notes ? " — " + wf.notes : ""}` : wf.notes,
      source: "Walk-In",
      createdAt: Date.now(),
      resource: wfResource,
      tier: wfTier,
    }]);
    toast(`Walk-in reservation encoded for ${wf.name}.`, "success");
    setShowNewWalkIn(false);
  };

  const wiCancelled = walkInBookings.filter(b => b.status === "Cancelled");

  const tabMap = {
    "Paid":   wiPending,
    "Confirmed": wiConfirmed,
    "Completed": wiCompleted,
    "Cancelled": wiCancelled,
  };
  const tabColors: Record<string, string> = {
    "Paid":   "#f5c518",
    "Confirmed": "#4caf50",
    "Completed": "#4a9fd4",
    "Cancelled": "#c0392b",
  };

  const q = wiSearch.toLowerCase().trim();
  const displayRows = tabMap[wiTab].filter(
    (b) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.contact.includes(q) || (b.date && b.date.includes(q))
  );

  const sc: Record<string, string[]> = {
    "Paid":   [isDark ? "#2a2500" : "#fef9e7", "#d4a800"],
    "Confirmed": [isDark ? "#1a3320" : "#edfbf0", "#2e9e4e"],
    "Completed": [isDark ? "#0f1a2a" : "#e8f4fb", "#1a6fa0"],
    "Cancelled": [isDark ? "#2a1010" : "#fdecea", "#c0392b"],
  };

  const executeWiAction = () => {
    if (!wiConfirmAction) return;
    updateStatus(wiConfirmAction.bookingId, wiConfirmAction.action);
    if (wiConfirmAction.action === "Confirmed") {
      toast(`On-site reservation confirmed for ${wiConfirmAction.guestName}. Payment received.`, "success");
    } else if (wiConfirmAction.action === "Cancelled") {
      toast(`On-site reservation cancelled for ${wiConfirmAction.guestName}.`, "warning");
    } else {
      toast(`Visit completed for ${wiConfirmAction.guestName}.`, "info");
    }
    setWiConfirmAction(null);
  };


  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
        <div>
          <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>WALK-IN RESERVATIONS</p>
          <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Walk-In Management</h2>
          <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>Encode a guest here as soon as they arrive to reserve without booking online.</p>
        </div>
        <button onClick={openNewWalkIn} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2, whiteSpace: "nowrap" }}>+ NEW WALK-IN</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(5,1fr)", gap: mob ? 10 : 14, marginBottom: 24 }}>
        {([
          ["Total",     walkInBookings.length,  gold],
          ["Paid",   wiPending.length,   "#f5c518"],
          ["Confirmed", wiConfirmed.length, "#4caf50"],
          ["Completed", wiCompleted.length, "#4a9fd4"],
          ["Cancelled", wiCancelled.length, "#c0392b"],
        ] as [string, number, string][]).map(([l, v, c]) => (
          <div key={l} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? "14px 12px" : "20px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${c}22,${c})` }} />
            <div style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 8 }}>{l.toUpperCase()}</div>
            <div style={{ color: c, fontSize: mob ? 24 : 30, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Policy notice */}
      <div style={{ background: isDark ? "rgba(74,159,212,0.05)" : "rgba(74,159,212,0.04)", border: "1px solid rgba(74,159,212,0.2)", borderRadius: 10, padding: "14px 18px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Lucide draws with currentColor, and these tinted notice panels set
            no colour of their own, so the icon fell back to the page's text
            colour — near-black, invisible against the dark admin. Tint it to
            the panel's own accent, which is also its border and heading colour. */}
        <Icon name="home" size={17} style={{ color: "#4a9fd4", flexShrink: 0 }} />
        <div>
          <p style={{ color: "#4a9fd4", fontSize: 12.5, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>WALK-IN PAYMENT POLICY</p>
          <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
            When you check <strong style={{ color: "#4caf50" }}>"payment collected"</strong> on the intake form, the reservation is saved as <strong style={{ color: C.textH }}>Confirmed</strong> right away. Leave it unchecked to save it as <strong style={{ color: C.textH }}>Paid</strong> (pending) and press <strong style={{ color: "#4caf50" }}>ACCEPT</strong> once payment is actually collected.
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
          value={wiSearch}
          onChange={(e) => setWiSearch(e.target.value)}
          placeholder="Search by name, ID, contact, or date…"
          className="sw-input"
          style={{ ...C.inp, paddingLeft: 36, borderRadius: 6 }}
        />
        {wiSearch && (
          <button
            onClick={() => setWiSearch("")}
            aria-label="Clear search"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textXS, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }}
          ><Icon name="x" size={14} /></button>
        )}
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["Paid", "Confirmed", "Completed", "Cancelled"] as const).map((t) => {
          const active = wiTab === t;
          const c = tabColors[t];
          const count = tabMap[t].length;
          return (
            <button
              key={t}
              onClick={() => setWiTab(t)}
              aria-pressed={active}
              style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 700, borderRadius: 20, cursor: "pointer", background: active ? `${c}18` : "transparent", color: active ? c : C.textS, border: `1px solid ${active ? c + "55" : cBr}`, letterSpacing: 1 }}
            >
              {t} <span style={{ opacity: 0.7, fontSize: 11.5 }}>({count})</span>
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
                  <th key={h} scope="col" style={{ padding: "11px 14px", color: C.textXS, fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 14.5 }}>
                    {wiSearch ? `No results for "${wiSearch}".` : `No ${wiTab.toLowerCase()} reservations.`}
                  </td>
                </tr>
              )}
              {displayRows.map((b, idx) => {
                const col = sc[b.status] || [isDark ? "#111" : "#eee", C.textS];
                return (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#090909" : "#080808") : (idx % 2 === 0 ? "#fff" : "#faf7f2") }}>
                    <td style={{ padding: "12px 14px", color: gold, fontSize: 12.5, fontFamily: "monospace", whiteSpace: "nowrap" }}>{b.id}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600 }}>{b.name}</div>
                      <div style={{ color: C.textXS, fontSize: 12.5 }}>{b.email !== "—" ? b.email : ""}</div>
                    </td>
                    <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.contact}</td>
                    <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {b.date !== "—" ? b.date : <span style={{ color: C.textXS }}>Walk-in</span>}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ background: col[0] + "33", color: col[1], fontSize: 10.5, padding: "3px 9px", borderRadius: 20, border: `1px solid ${col[1]}44`, letterSpacing: 1 }}>
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {b.status === "Paid" && (
                          <>
                            <button
                              onClick={() => setWiConfirmAction({ bookingId: b.id, action: "Confirmed", guestName: b.name })}
                              style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.25)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                            ><Icon name="check" size={13} style={{ marginRight: 5 }} />ACCEPT</button>
                            <button
                              onClick={() => setWiConfirmAction({ bookingId: b.id, action: "Cancelled", guestName: b.name })}
                              style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
                            >CANCEL</button>
                          </>
                        )}
                        {b.status === "Confirmed" && (
                          <button
                            onClick={() => setWiConfirmAction({ bookingId: b.id, action: "Completed", guestName: b.name })}
                            style={{ background: "rgba(74,159,212,0.1)", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.25)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                          ><Icon name="check" size={13} style={{ marginRight: 5 }} />COMPLETE</button>
                        )}
                        {(b.status === "Completed" || b.status === "Cancelled") && (
                          <button
                            onClick={() => setWiConfirmArchive(b)}
                            style={{ background: "rgba(150,150,150,0.08)", color: C.textS, border: `1px solid ${cBr}`, padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                          >ARCHIVE</button>
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
      <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 12 }}>HOW WALK-IN RESERVATIONS WORK</p>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
        {([
          ["1. Guest Arrives", "A guest shows up without an online booking and wants to reserve on the spot.", "#4a9fd4"],
          ["2. Staff Encodes Here", "Press + NEW WALK-IN and fill in their details, tour type, and any rooms.", "#f5c518"],
          ["3. Mark Payment Collected", "Check the box once cash/GCash is received — the reservation saves as Confirmed.", "#4caf50"],
        ] as [string, string, string][]).map(([title, desc, c]) => (
          <div key={title} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: c }} />
            <h4 style={{ color: C.textH, fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>{title}</h4>
            <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* ── New Walk-In Intake Modal ── */}
      {/* Walk-in intake. The hand-rolled fixed overlay this replaced had no
          focus trap, no ESC handling and no scroll lock — Radix provides all
          three. Laid out LANDSCAPE: staff encode these at a desk, so the form
          is wide (max-w-5xl) and runs three columns instead of a narrow
          480px column that forced constant scrolling. */}
      <Dialog open={showNewWalkIn} onOpenChange={setShowNewWalkIn}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, fontSize: 22 }}>
              Encode Walk-In Reservation
            </DialogTitle>
            <DialogDescription>
              Record a guest who arrived without booking online.
            </DialogDescription>
          </DialogHeader>

          <div>
            <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>GUEST NAME</label>
                <input value={wf.name} onChange={(e) => setWfField("name", sanitizeName(e.target.value))} placeholder="Juan Dela Cruz" className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>CONTACT NUMBER</label>
                <input value={wf.contact} onChange={(e) => setWfField("contact", sanitizeContact(e.target.value))} maxLength={11} placeholder="09XXXXXXXXX" className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>EMAIL (OPTIONAL)</label>
                <input value={wf.email} onChange={(e) => setWfField("email", e.target.value)} placeholder="example@email.com" className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>DATE</label>
                <input type="date" value={wf.date} onChange={(e) => setWfField("date", e.target.value)} className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>ARRIVAL TIME</label>
                <input type="time" value={wf.time} onChange={(e) => setWfField("time", e.target.value)} className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>

              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>BOOKING TYPE</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Custom", "Package"] as const).map((m) => (
                    <button key={m} onClick={() => { setWfMode(m); if (m === "Custom") setWfPkgId(null); }} style={{ flex: 1, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: "pointer", letterSpacing: 1, background: wfMode === m ? `${gold}18` : "transparent", color: wfMode === m ? gold : C.textS, border: `1px solid ${wfMode === m ? gold + "55" : cBr}` }}>
                      <><Icon name={m === "Custom" ? "toolbox" : "gift"} size={13} style={{ marginRight: 6 }} />{m === "Custom" ? "Custom Tour" : "Package"}</>
                    </button>
                  ))}
                </div>
              </div>

              {wfMode === "Package" && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>SELECT PACKAGE</label>
                  {packages.filter((p) => p.active).length === 0 ? (
                    <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>No active packages — add one in the Packages tab.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {packages.filter((p) => p.active).map((p) => {
                        const sel = wfPkgId === p.id;
                        return (
                          <div key={p.id} onClick={() => setWfPkgId(p.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: sel ? `${gold}14` : "transparent", border: `1px solid ${sel ? gold + "55" : cBr}` }}>
                            <div>
                              <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600 }}>{p.title}</div>
                              <div style={{ color: C.textS, fontSize: 11.5 }}>{p.status} · {p.resource} · up to {p.capacity} guests</div>
                            </div>
                            <span style={{ color: gold, fontWeight: 700, fontSize: 14.5 }}>{fmt(p.price)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {wfMode === "Custom" && (
              <>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>GUESTS</label>
                <input
                  type="number"
                  min={1}
                  max={RESORT_MAX_CAPACITY}
                  value={wf.guests}
                  disabled={wfTier === "Exclusive"}
                  onChange={(e) => setWfField("guests", e.target.value)}
                  className="sw-input"
                  style={{ ...C.inp, borderRadius: 6, opacity: wfTier === "Exclusive" ? 0.6 : 1 }}
                />
                {wfTier === "Exclusive" && (
                  <p style={{ color: gold, fontSize: 11.5, marginTop: 4 }}><Icon name="lock" size={11} style={{ marginRight: 5 }} />Fixed at {RESORT_MAX_CAPACITY} for an Exclusive buyout.</p>
                )}
              </div>
              <div>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>SHARED OR EXCLUSIVE?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Shared", "Exclusive"] as const).map((opt) => (
                    <button key={opt} onClick={() => setWfTierChoice(opt)} style={{ flex: 1, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: "pointer", letterSpacing: 1, background: wfTier === opt ? (opt === "Exclusive" ? `${gold}18` : "rgba(76,175,80,0.12)") : "transparent", color: wfTier === opt ? (opt === "Exclusive" ? gold : "#4caf50") : C.textS, border: `1px solid ${wfTier === opt ? (opt === "Exclusive" ? gold + "55" : "#4caf5055") : cBr}` }}>
                      <><Icon name={opt === "Exclusive" ? "lock" : "users"} size={13} style={{ marginRight: 6 }} />{opt === "Exclusive" ? "Exclusive" : "Shared"}</>
                    </button>
                  ))}
                </div>
              </div>
              </>
              )}

              {/* WHEN — Day, Night or Whole Day. A Whole Day package fixes it;
                  a single-slot package still needs Day or Night. */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>WHEN</label>
                {wfSelectedPackage?.slotMode === "WholeDay" ? (
                  <p style={{ color: C.textH, fontSize: 13.5, margin: 0 }}><Icon name="clock" size={13} style={{ marginRight: 6 }} />Whole Day · {SLOTS.WholeDay.hours}</p>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    {((isWfPackage ? ["Day", "Night"] : ["Day", "Night", "WholeDay"]) as BookingSlot[]).map((t) => (
                      <button key={t} onClick={() => { setWfField("slot", t); if (t !== "Day") setWfField("overtime", "0"); }} style={{ flex: 1, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: "pointer", letterSpacing: 1, background: wfSlot === t ? `${gold}18` : "transparent", color: wfSlot === t ? gold : C.textS, border: `1px solid ${wfSlot === t ? gold + "55" : cBr}` }}>
                        <><Icon name={t === "Day" ? "sun" : t === "Night" ? "moon" : "clock"} size={13} style={{ marginRight: 6 }} />{SLOTS[t].label}</>
                        <div style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.75, marginTop: 2 }}>{SLOTS[t].hours}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* OVERTIME — Day only, up to OVERTIME_MAX hrs after 5 PM, and
                  only while the Night slot is free (5–7 PM is otherwise the
                  cleaning window). The availability check below enforces it. */}
              {wfSlot === "Day" && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>OVERTIME (DAY ONLY)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {Array.from({ length: OVERTIME_MAX + 1 }, (_, h) => h).map((h) => (
                      <button key={h} onClick={() => setWfField("overtime", String(h))} style={{ flex: 1, padding: "8px 10px", fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: "pointer", background: wfOvertime === h ? `${gold}18` : "transparent", color: wfOvertime === h ? gold : C.textS, border: `1px solid ${wfOvertime === h ? gold + "55" : cBr}` }}>
                        {h === 0 ? "None" : `+${h} hr${h > 1 ? "s" : ""} (until ${5 + h}:00 PM)`}
                      </button>
                    ))}
                  </div>
                  <p style={{ color: C.textS, fontSize: 11.5, marginTop: 6 }}>
                    {fmt(OVERTIME_RATE)}/hr. Only possible when no Night group is booked — adding it closes the Night slot for this date.
                  </p>
                </div>
              )}

              {wfShowRoomPicker && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                  {wfRequiresRoom ? "CHOOSE ROOM (REQUIRED)" : "ROOM ADD-ON (OPTIONAL)"}
                </label>
                {wfRequiresRoom && (
                  <p style={{ color: C.textS, fontSize: 12.5, marginBottom: 8 }}>Pick the one room included with this package — {Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}% off its normal rate.</p>
                )}
                {wfBookableRooms.length === 0 && (
                  <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>No rooms currently available — check Facilities for maintenance flags.</p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {wfBookableRooms.map((r) => {
                    const sel = wf.rooms.includes(r.id);
                    const taken = wfTakenRooms.has(r.id) && !sel;
                    return (
                      <button key={r.id} disabled={taken} title={taken ? "Already booked on this date" : undefined} onClick={() => toggleWfRoom(r.id)} style={{ padding: "7px 12px", fontSize: 12.5, borderRadius: 6, cursor: taken ? "not-allowed" : "pointer", opacity: taken ? 0.4 : 1, background: sel ? `${gold}18` : "transparent", color: sel ? gold : C.textS, border: `1px solid ${sel ? gold + "55" : cBr}` }}>
                        {sel ? <Icon name="check" size={12} style={{ marginRight: 5 }} /> : null}{r.name}{taken ? " · booked" : ""}
                      </button>
                    );
                  })}
                </div>
                {wfRequiresRoom && wf.rooms.length === 0 && (
                  <p style={{ color: "#e55", fontSize: 12.5, marginTop: 6 }}><Icon name="alert" size={12} style={{ marginRight: 5 }} />Please pick a room to continue.</p>
                )}
              </div>
              )}

              <div style={{ gridColumn: "1/-1", background: isDark ? "rgba(201,168,76,0.06)" : "rgba(201,168,76,0.08)", border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.textS, fontSize: 12.5, letterSpacing: 1 }}>PACKAGE</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 14.5 }}>{wfPackageLabel}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: 20, color: wfTier === "Exclusive" ? gold : "#4caf50", background: wfTier === "Exclusive" ? "rgba(201,168,76,0.15)" : "rgba(76,175,80,0.12)" }}>
                    <><Icon name={wfTier === "Exclusive" ? "lock" : "users"} size={12} style={{ marginRight: 6 }} />{wfTier === "Exclusive" ? "EXCLUSIVE" : "SHARED"}</>
                  </span>
                </span>
              </div>
              <div style={{ gridColumn: "1/-1", background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${cBr}`, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.textS, fontSize: 12.5 }}>
                    {isWfPackage ? `${wfPackageLabel} (package)` : wfTier === "Exclusive" ? `Exclusive pool${wfPrice.slots === 2 ? " × 2 slots" : ""}` : `Shared pool (${wfGuests} × ₱200)`}
                  </span>
                  <span style={{ color: C.textB, fontSize: 12.5 }}>{fmt(wfTourBase)}</span>
                </div>
                {wfExclusiveDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#4caf50", fontSize: 12.5 }}>{wfPrice.bundleDiscount > 0 ? "Bundle discount (-10%)" : "Exclusive discount (-5%)"}</span>
                    <span style={{ color: "#4caf50", fontSize: 12.5 }}>-{fmt(wfExclusiveDiscount)}</span>
                  </div>
                )}
                {wfOvertimeFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.textS, fontSize: 12.5 }}>Overtime ({wfOvertime} hr × {fmt(OVERTIME_RATE)})</span>
                    <span style={{ color: C.textB, fontSize: 12.5 }}>{fmt(wfOvertimeFee)}</span>
                  </div>
                )}
                {wfRoomsFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.textS, fontSize: 12.5 }}>Room(s){wfPrice.slots === 2 ? " × 2 slots" : ""}{isWfPackage ? " (bundled)" : ""}</span>
                    <span style={{ color: C.textB, fontSize: 12.5 }}>{fmt(wfRoomsFee)}</span>
                  </div>
                )}
                {wfRoomBundleDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#4caf50", fontSize: 12.5 }}>Room bundle discount (-{Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}%)</span>
                    <span style={{ color: "#4caf50", fontSize: 12.5 }}>-{fmt(wfRoomBundleDiscount)}</span>
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 13.5 }}>Total</span>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 13.5 }}>{fmt(wfTotal)}</span>
                </div>
              </div>
              {wf.date && !wfDateCapacity.ok && (
                <div style={{ gridColumn: "1/-1" }}>
                  <p style={{ color: "#e55", fontSize: 13.5, margin: 0 }}><Icon name="alert" size={13} style={{ marginRight: 5 }} />{wfDateCapacity.reason}</p>
                </div>
              )}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 11.5, letterSpacing: 2, display: "block", marginBottom: 6 }}>NOTES (OPTIONAL)</label>
                <textarea value={wf.notes} onChange={(e) => setWfField("notes", e.target.value)} rows={2} placeholder="Special requests, etc." className="sw-input" style={{ ...C.inp, borderRadius: 6, resize: "none" }} />
              </div>
            </div>

            <div
              onClick={() => setWfField("paymentCollected", !wf.paymentCollected)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, background: wf.paymentCollected ? "rgba(76,175,80,0.06)" : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1.5px solid ${wf.paymentCollected ? "rgba(76,175,80,0.5)" : cBr}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16, cursor: "pointer", userSelect: "none" }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${wf.paymentCollected ? "#4caf50" : isDark ? "#444" : "#bbb"}`, background: wf.paymentCollected ? "#4caf50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {wf.paymentCollected && <Icon name="check" size={12} style={{ color: "#fff" }} strokeWidth={3} />}
              </div>
              <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                <strong style={{ color: C.textH }}>Payment collected</strong> — {wf.paymentCollected ? `full amount (${fmt(wfTotal)}) received now, save as Confirmed.` : `not yet collected, save as Paid (pending) until the guest pays.`}
              </span>
            </div>

            <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${cBr}`, borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textS, fontSize: 13.5 }}>{wfPackageLabel} Total</span>
                <span style={{ color: gold, fontWeight: 700, fontSize: 14.5 }}>{fmt(wfTotal)}</span>
              </div>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewWalkIn(false)}>
              Cancel
            </Button>
            <Button disabled={!wfValid} onClick={saveWalkIn}>
              Save reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── On-Site Confirm Modal ── */}
      {wiConfirmAction && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }}
          role="dialog" aria-modal="true" aria-labelledby="onsite-confirm-title"
        >
          <div style={{
            background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff",
            border: `1px solid ${
              wiConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)"
              : wiConfirmAction.action === "Completed" ? "rgba(74,159,212,0.3)"
              : "rgba(229,85,85,0.3)"
            }`,
            borderRadius: 12, padding: "32px 28px", width: "100%", maxWidth: 400, boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
          }}>
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: "50%", marginBottom: 18, fontSize: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: wiConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.1)"
                : wiConfirmAction.action === "Completed" ? "rgba(74,159,212,0.1)"
                : "rgba(229,85,85,0.1)",
              border: `1px solid ${
                wiConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)"
                : wiConfirmAction.action === "Completed" ? "rgba(74,159,212,0.3)"
                : "rgba(229,85,85,0.3)"
              }`,
            }}>
              <Icon name={wiConfirmAction.action === "Confirmed" ? "check" : wiConfirmAction.action === "Completed" ? "flag" : "x"} size={20} />
            </div>

            <h3 id="onsite-confirm-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              {wiConfirmAction.action === "Confirmed" ? "Accept this on-site reservation?"
                : wiConfirmAction.action === "Completed" ? "Mark visit as completed?"
                : "Cancel this reservation?"}
            </h3>

            <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7, marginBottom: 16 }}>
              {wiConfirmAction.action === "Confirmed" && (
                <>Confirm that <strong style={{ color: C.textH }}>{wiConfirmAction.guestName}</strong> has arrived and payment has been collected at the resort.</>
              )}
              {wiConfirmAction.action === "Completed" && (
                <>Mark <strong style={{ color: C.textH }}>{wiConfirmAction.guestName}</strong>'s visit as completed. This records their stay in the system.</>
              )}
              {wiConfirmAction.action === "Cancelled" && (
                <>Cancel the on-site reservation for <strong style={{ color: C.textH }}>{wiConfirmAction.guestName}</strong>. This action cannot be undone.</>
              )}
            </p>

            {/* Warning for accept */}
            {wiConfirmAction.action === "Confirmed" && (
              <div style={{ background: isDark ? "rgba(76,175,80,0.05)" : "rgba(76,175,80,0.04)", border: "1px solid rgba(76,175,80,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8 }}>
                <Icon name="cash" size={15} style={{ color: "#4caf50", flexShrink: 0 }} />
                <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                  Only confirm if payment (50% down or full amount) has been <strong style={{ color: "#4caf50" }}>physically collected</strong> at the resort.
                </span>
              </div>
            )}

            {/* Warning for cancel */}
            {wiConfirmAction.action === "Cancelled" && (
              <div style={{ background: "rgba(229,85,85,0.04)", border: "1px solid rgba(229,85,85,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8 }}>
                <Icon name="alert" size={15} style={{ color: "#e55", flexShrink: 0 }} />
                <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>The guest will be notified that their reservation has been cancelled.</span>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setWiConfirmAction(null)}
                style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}
              >GO BACK</button>
              <button
                onClick={executeWiAction}
                style={{
                  flex: 2, padding: "11px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2,
                  background: wiConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.12)"
                    : wiConfirmAction.action === "Completed" ? "rgba(74,159,212,0.1)"
                    : "rgba(229,85,85,0.10)",
                  color: wiConfirmAction.action === "Confirmed" ? "#4caf50"
                    : wiConfirmAction.action === "Completed" ? "#4a9fd4"
                    : "#e55",
                  border: `1px solid ${
                    wiConfirmAction.action === "Confirmed" ? "rgba(76,175,80,0.3)"
                    : wiConfirmAction.action === "Completed" ? "rgba(74,159,212,0.3)"
                    : "rgba(229,85,85,0.3)"
                  }`,
                }}
              >
                {wiConfirmAction.action === "Confirmed" ? "YES, ACCEPT & CONFIRM"
                  : wiConfirmAction.action === "Completed" ? "YES, MARK COMPLETE"
                  : "YES, CANCEL"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Confirm Modal ── */}
      {wiConfirmArchive && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} role="dialog" aria-modal="true">
          <div style={{ background: isDark ? "#0d0d0d" : "#fff", border: `1px solid ${cBr}`, borderRadius: 8, padding: "28px 26px", width: "100%", maxWidth: 400 }}>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, marginBottom: 10 }}>Archive reservation {wiConfirmArchive.id}?</h3>
            <p style={{ color: C.textS, fontSize: 14.5, marginBottom: 20 }}>
              It'll move out of Walk-In Management into the Bookings tab's Archived view, filed under <strong style={{ color: wiConfirmArchive.status === "Completed" ? "#4a9fd4" : "#e55" }}>{wiConfirmArchive.status}</strong>. You can restore it any time from there.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setWiConfirmArchive(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6 }}>CANCEL</button>
              <button onClick={() => archiveWiBooking(wiConfirmArchive)} style={{ flex: 1, background: "rgba(150,150,150,0.1)", color: C.textH, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6, fontWeight: 700 }}>ARCHIVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SIDEBAR_GROUPS = [
  { label: "OVERVIEW",     tabs: ["Dashboard"] },
  { label: "RESERVATIONS", tabs: ["Bookings", "Walk-In", "Occupancy"] },
  { label: "MANAGEMENT",   tabs: ["Rooms", "Packages", "Facilities", "Gallery", "Inventory"] },
  { label: "INSIGHTS",     tabs: ["Analytics", "Reports"] },
  { label: "SUPPORT",      tabs: ["Customer Service"] },
  { label: "SITE",         tabs: ["Maintenance"] },
];

// ── Admin Component ───────────────────────────────────────────────────────────
export function Admin({
  bookings, setBookings, rooms, setRooms,
  galleryImgs, setGalleryImgs, closedDates, setClosedDates,
  onLogout, customerMessages, setCustomerMessages,
  facilities, setFacilities,
  inventory, setInventory, packages, setPackages,
}: AdminProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const w = useWidth();
  const mob = w < 768;


  const [tab, setTab] = useState<AdminTab>("Dashboard");
  const [sideOpen, setSideOpen] = useState(false);

  // ── Wall clock, kept genuinely live ─────────────────────────────────
  // The dashboard's "TODAY (LIVE)" panel used new Date() evaluated during
  // render, so it only changed if something else happened to re-render.
  // Left open, it never noticed a tour ending or the day rolling over.
  //
  // Deliberately named `now`, not `todayStr` — a module-level todayStr()
  // helper already exists above for WalkInTab, and shadowing it inside this
  // component with a different type would be a trap for the next reader.
  //
  // 30s is fine: occupancy changes on hour boundaries, so the count is
  // correct within half a minute of a tour starting or ending.
  //
  // Admin returns null until adminAuth, so this never renders on the server
  // and cannot produce a hydration mismatch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [showModal, setShowModal] = useState(false);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [rf, setRf] = useState({ name: "", beds: "", capacity: "", price: "", desc: "", img: "" });
  const [imgPrev, setImgPrev] = useState("");
  const [confirmRemoveRoom, setConfirmRemoveRoom] = useState<Room | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(true);
  const [archivedMessages, setArchivedMessages] = useState<CustomerMessage[]>([]);
  const [csView, setCsView] = useState<"inbox" | "archive">("inbox");
  const [confirmArchiveMsg, setConfirmArchiveMsg] = useState<CustomerMessage | null>(null);
  // Live refresh for the Customer Service inbox.
  //
  // Three things were wrong here. It polled every 2 seconds (1,800 requests
  // an hour per open tab); it fetched immediately on mount even though
  // AppContext already loads this collection, so every admin visit fired two
  // identical requests; and it fed res.json() straight into state without
  // checking the response. That last one was the dangerous one: once the
  // 8-hour session expires the route answers 401 with {success:false,...},
  // and storing that object where an array belongs crashed the panel on the
  // next render, which maps over it.
  useEffect(() => {
    let stopped = false;

    const loadMessages = async () => {
      // Nothing to refresh while the tab is in the background.
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/customer-service");
        if (!res.ok) return; // 401 after session expiry, or a server error
        const data = await res.json();
        // Only an array may reach state. Anything else is an error payload.
        if (!stopped && Array.isArray(data)) setCustomerMessages(data);
      } catch {
        // Offline or a dropped request: keep what is already on screen.
      }
    };

    // No immediate call — AppContext has already loaded this collection on
    // mount. This only keeps it fresh from here on.
    const interval = setInterval(loadMessages, 15000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [setCustomerMessages]);


    useEffect(() => {
      if (!autoArchiveEnabled) return;

      const now = new Date();

      setCustomerMessages((prev) => {
        const remaining: CustomerMessage[] = [];
        const toArchive: CustomerMessage[] = [];

        prev.forEach((msg) => {
          const msgDate = new Date(msg.createdAt || msg.date);

          const diffMonths =
            now.getMonth() - msgDate.getMonth() +
            12 * (now.getFullYear() - msgDate.getFullYear());

          if (diffMonths >= 1) {
            toArchive.push(msg);
          } else {
            remaining.push(msg);
          }
        });

        if (toArchive.length > 0) {
          setArchivedMessages((old) => [
            ...toArchive,
            ...old,
          ]);
        }

        return remaining;
      });
    }, [autoArchiveEnabled]);

    const [replyModal, setReplyModal] = useState<any | null>(null);

    const [replyMode, setReplyMode] = useState<
      "manual" | "automated"
    >("manual");

    const [replyMessage, setReplyMessage] = useState("");

    const automatedReplies = {
      Feedback:
        "Thank you for your feedback. We appreciate your thoughts and suggestions.",
      Complaint:
        "We sincerely apologize for the inconvenience. Our team will review your concern immediately.",
      Question:
        "Thank you for your question. Our team will respond as soon as possible.",
      "Booking Issue":
        "We received your booking concern and will investigate the issue shortly.",
      Other:
        "Thank you for contacting us. We will get back to you soon.",
    };

  const [dashConfirm, setDashConfirm] = useState<{
    bookingId: string; action: "Confirmed" | "Cancelled"; guestName: string;
  } | null>(null);

  const tabs: AdminTab[] = ["Dashboard", "Bookings", "Walk-In", "Occupancy", "Rooms", "Packages", "Facilities", "Gallery", "Inventory", "Analytics", "Reports", "Customer Service", "Maintenance"];
  // Icon per tab. Names resolve against the stroke set in ./Icon, so the
  // sidebar inherits the theme instead of rendering OS colour emoji.
  const tabIcons: Record<AdminTab, IconName> = {
    Dashboard: "grid", Bookings: "clipboard", "Walk-In": "home",
    Occupancy: "calendar", Rooms: "bed", Packages: "gift",
    Facilities: "toolbox", Gallery: "image", Inventory: "package",
    Analytics: "trending-up", Reports: "bar-chart", "Customer Service": "message",
    Maintenance: "toolbox",
  };

  // Flags every facility a completed booking used (whole-resort amenities,
  // plus any specific rooms it rented) as "Needs Cleaning" so the caretaker
  // has a running checklist of what to inspect before the next guest.
  const markFacilitiesUsed = (booking: Booking) => {
    setFacilities((fs) => fs.map((f) => {
      const usedAmenity = f.category === "Amenity" && /Tour/i.test(booking.package);
      const usedRoom = f.category === "Room" && f.roomId !== undefined && booking.rooms.includes(f.roomId);
      if (!usedAmenity && !usedRoom) return f;
      return {
        ...f,
        status: "Needs Cleaning",
        lastUsedBookingId: booking.id,
        lastUsedGuestName: booking.name,
        lastCheckedAt: null,
      };
    }));
  };

  const updateStatus = async (id: string, status: string, reason?: string) => {
  setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status: status as Booking["status"] } : b));
  const booking = bookings.find((b) => b.id === id);
  if (status === "Completed" && booking) markFacilitiesUsed(booking);
  if (!booking?.email) return;
  if (status === "Confirmed") {
    try {
      const res = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking, type: "confirmed" }) });
      const data = await res.json();
      if (data.success) toast(`Confirmation email sent to ${booking.email}`, "success");
      else toast(`Booking confirmed but email failed: ${data.error}`, "warning");
    } catch { toast("Booking confirmed but email could not be sent.", "warning"); }
  }
  if (status === "Cancelled") {
    try {
      const res = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking, type: "rejected", reason: reason || "" }) });
      const data = await res.json();
      if (data.success) toast(`Rejection email sent to ${booking.email}`, "warning");
      else toast(`Booking rejected but email failed: ${data.error}`, "warning");
    } catch { toast("Booking rejected but email could not be sent.", "warning"); }
  }
};

  const Paid = bookings.filter((b) => b.status === "Paid").length;
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
  const archiveMessage = async (msg: CustomerMessage) => {
  try {
    // remove from inbox
    setCustomerMessages((prev) =>
      prev.filter((m) => m.id !== msg.id)
    );

    // add to archive
    setArchivedMessages((prev) => [
      {
        ...msg,
        archivedAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    toast("Message archived.", "info");

    setConfirmArchiveMsg(null);
  } catch (err) {
    console.error(err);

    toast("Failed to archive message.", "error");
  }
};

  const goTab = (t: AdminTab) => { setTab(t); if (mob) setSideOpen(false); };

  const adminBg = isDark ? "#080706" : "#f2ede6";
  const sideBg = isDark ? "#0a0906" : "#ffffff";
  const sideBorder = isDark ? "#141210" : "#ede8df";
  const cBg = isDark ? "#0c0b09" : "#ffffff";
  const cBr = isDark ? "#1a1714" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const sideS = (t: AdminTab): React.CSSProperties => ({
    padding: "11px 20px 11px 24px", cursor: "pointer", fontSize: 12.5, letterSpacing: 1.5,
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
            <span style={{ color: isDark ? "#e0e0e0" : "#111", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 16, letterSpacing: 2 }}>STONEWOOD</span>
          </div>
          <button onClick={() => setSideOpen((o) => !o)} style={{ background: "none", border: `1px solid ${cBr}`, color: isDark ? "#888" : "#666", cursor: "pointer", padding: "6px 10px", borderRadius: 3, fontSize: 14.5 }}>{<Icon name={sideOpen ? "x" : "menu"} size={16} />}</button>
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
                  <span style={{ color: isDark ? "#e0e0e0" : "#111", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, letterSpacing: 2 }}>STONEWOOD</span>
                </div>
                <div style={{ color: isDark ? "#333" : "#bbb", fontSize: 10.5, letterSpacing: 3, marginLeft: 16 }}>ADMIN PANEL</div>
              </div>
            )}
            <div style={{ padding: "8px 0", flex: 1, overflowY: "auto" }}>
              {SIDEBAR_GROUPS.map((group, gi) => (
                <div key={group.label}>

                  {/* Section label + horizontal rule */}
                  <div style={{
                    padding: gi === 0 ? "16px 24px 6px" : "20px 24px 6px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}>
                  <span style={{
                    color: isDark ? "#8f6a3d" : "#b08d57",
                    fontSize: 10.5,
                    letterSpacing: 3.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase" as const,
                    fontFamily: "'Jost',system-ui,sans-serif",
                  }}>
                    {group.label}
                  </span>

                  <div style={{
                    flex: 1,
                    height: 1,
                    background: isDark
                      ? "rgba(176,141,87,0.18)"
                      : "rgba(176,141,87,0.25)",
                  }} />
                  </div>

                  {/* Nav items for this group */}
                  {group.tabs.map((t) => (
                    <div
                      key={t}
                      onClick={() => goTab(t as AdminTab)}
                      className="sw-sidebar-item"
                      style={sideS(t as AdminTab)}
                    >
                      <Icon
                        name={tabIcons[t as AdminTab]}
                        size={16}
                        style={{ opacity: tab === t ? 1 : 0.55, transition: "opacity .15s" }}
                      />
                      <span style={{ flex: 1 }}>{t.toUpperCase()}</span>

                      {/* Bookings badge */}
                      {t === "Bookings" && Paid > 0 && (
                        <span style={{
                          background: gold, color: "#000",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {Paid}
                        </span>
                      )}

                      {/* Walk-In badge */}
                      {t === "Walk-In" && bookings.filter(
                        b => b.source === "Walk-In" && b.status === "Paid"
                      ).length > 0 && (
                        <span style={{
                          background: "#4a9fd4", color: "#fff",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {bookings.filter(
                            b => b.source === "Walk-In" && b.status === "Paid"
                          ).length}
                        </span>
                      )}

                      {/* Facilities badge */}
                      {t === "Facilities" && facilities.filter(f => f.status === "Needs Cleaning").length > 0 && (
                        <span style={{
                          background: "#e0a020", color: "#000",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {facilities.filter(f => f.status === "Needs Cleaning").length}
                        </span>
                      )}

                      {/* Customer Service badge */}
                      {t === "Customer Service" && customerMessages.length > 0 && (
                        <span style={{
                          background: "#4a9fd4", color: "#fff",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {customerMessages.length}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${sideBorder}` }}>
              <button onClick={() => setShowLogoutConfirm(true)} style={{ width: "100%", background: "transparent", color: isDark ? "#444" : "#aaa", border: `1px solid ${isDark ? "#1a1a1a" : "#ddd"}`, padding: "9px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>OVERVIEW</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Dashboard</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: mob ? 10 : 14, marginBottom: 36 }}>
                {[["Paid", Paid, "#f5c518", "Pending review"], ["Confirmed", confirmed, "#4caf50", "Approved"], ["Completed", completed, "#4a9fd4", "Past stays"], ["Rooms", rooms.length, gold, "Active listings"]].map(([l, v, c, sub]) => (
                  <div key={l as string} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? "14px 12px" : "22px 20px", position: "relative", overflow: "hidden", boxShadow: C.shadowCard }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${c}22,${c})` }} />
                    <div style={{ color: isDark ? "#4a4035" : "#9a8878", fontSize: 10.5, letterSpacing: 2, marginBottom: 10 }}>{(l as string).toUpperCase()}</div>
                    <div style={{ color: c as string, fontSize: mob ? 26 : 34, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif", lineHeight: 1, marginBottom: 6 }}>{v as number}</div>
                    {!mob && <div style={{ color: isDark ? "#3a3025" : "#b0a090", fontSize: 12.5 }}>{sub as string}</div>}
                  </div>
                ))}
              </div>

              {/* Currently ongoing bookings — today's confirmed guests, live */}
              {(() => {
                // Occupancy is by TIME WINDOW, not just date: a booking counts
                // only while the clock sits inside its tour hours, so guests
                // drop off on their own when a tour ends instead of lingering
                // until midnight. See lib/occupancy.ts for the hours.
                //
                // This replaced a date-only filter that also used
                // toISOString() — UTC, which in Manila (UTC+8) reported the
                // PREVIOUS day from midnight until 8am.
                const { present: liveBookings, total: totalInResort } =
                  getCurrentOccupancy(bookings, now);
                const anyoneIn = totalInResort > 0;

                // Why is it empty?
                //
                // "No confirmed guests checked in for today yet" was the only
                // thing this said, for every possible reason — no bookings at
                // all, a tour that had already finished, a Night group not due
                // for hours, or bookings still waiting on approval. A correct
                // zero was indistinguishable from a broken panel, which is
                // exactly how it got read.
                const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                const liveToday = bookings.filter((b) => b.date === todayISO && b.status !== "Cancelled");
                const confirmedToday = liveToday.filter((b) => b.status === "Confirmed");
                const awaitingToday = liveToday.filter((b) => b.status === "Paid");
                const nextUp = bookings
                  .filter((b) => b.date > todayISO && b.status !== "Cancelled" && b.status !== "Completed")
                  .sort((a, b) => a.date.localeCompare(b.date))[0];

                const emptyReason = (() => {
                  if (confirmedToday.length > 0) {
                    // There ARE confirmed bookings today; the clock is simply
                    // outside their hours. Name the hours so it is obvious.
                    const windows = confirmedToday
                      .map((b) => SLOTS[b.slot ?? "Day"])
                      .map((sl) => `${sl.label} (${sl.hours})`);
                    const unique = Array.from(new Set(windows));
                    return `${confirmedToday.length} confirmed booking${confirmedToday.length === 1 ? "" : "s"} today — ${unique.join(", ")}. Nobody is on site at this hour.`;
                  }
                  if (awaitingToday.length > 0) {
                    return `${awaitingToday.length} booking${awaitingToday.length === 1 ? " is" : "s are"} booked for today but still Paid — approve ${awaitingToday.length === 1 ? "it" : "them"} below and ${awaitingToday.length === 1 ? "it" : "they"} will appear here.`;
                  }
                  if (nextUp) {
                    return `No bookings for today. The next one is ${fmtDate(nextUp.date)}.`;
                  }
                  return "No bookings for today, and none upcoming.";
                })();
                return (
                  <div style={{ marginBottom: 36 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                      <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, margin: 0 }}>CURRENTLY ONGOING BOOKINGS — TODAY (LIVE)</p>
                      {/* Green while anyone is on site, red when the resort is
                          empty. The dot inherits currentColor, so the state
                          change needs only the one colour swap here. */}
                      <span
                        title={anyoneIn
                          ? `${liveBookings.length} booking${liveBookings.length === 1 ? "" : "s"} currently on site`
                          : "No tour is running right now"}
                        style={{ background: anyoneIn ? "rgba(76,175,80,0.08)" : "rgba(229,85,85,0.07)", color: anyoneIn ? "#4caf50" : "#d9534f", fontSize: 11.5, padding: "4px 12px", borderRadius: 20, border: `1px solid ${anyoneIn ? "rgba(76,175,80,0.2)" : "rgba(229,85,85,0.2)"}`, letterSpacing: 1, display: "inline-flex", alignItems: "center", gap: 7, transition: "background .3s ease, border-color .3s ease, color .3s ease" }}
                      >
                        {/* Pulsing dot — the conventional "this is live" signal.
                            The ring animates outward while the core stays solid,
                            so it reads as a heartbeat rather than a flash. */}
                        <span className="sw-live-dot" aria-hidden="true" />
                        <Icon name="users" size={13} />Total people in resort: {totalInResort}
                      </span>
                    </div>
                    <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 520 : 0 }}>
                          <thead><tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["Guest", "Package", "Guests Included", "Rooms", "Source"].map((h) => <th key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {liveBookings.map((b, idx) => (
                              <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                                <td style={{ padding: "12px 14px", color: C.textH, fontSize: 13.5, fontWeight: 600 }}>{b.name}</td>
                                <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5 }}>{b.package}</td>
                                <td style={{ padding: "12px 14px", color: gold, fontSize: 13.5, fontWeight: 700 }}><Icon name="users" size={12} style={{ marginRight: 5 }} />{b.guests}</td>
                                <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5 }}>{b.rooms.length > 0 ? b.rooms.map((rid) => rooms.find((r) => r.id === rid)?.name ?? `#${rid}`).join(", ") : "—"}</td>
                                <td style={{ padding: "12px 14px" }}><span style={{ background: b.source === "Walk-In" ? "rgba(74,159,212,0.08)" : "rgba(201,168,76,0.1)", color: b.source === "Walk-In" ? "#4a9fd4" : gold, fontSize: 10.5, padding: "3px 10px", borderRadius: 20, letterSpacing: 1 }}>{b.source ?? "Online"}</span></td>
                              </tr>
                            ))}
                            {liveBookings.length === 0 && (
                              <tr>
                                <td colSpan={5} style={{ padding: "30px 20px", textAlign: "center" }}>
                                  <div style={{ color: C.textS, fontSize: 14.5, marginBottom: 6 }}>
                                    No one is in the resort right now.
                                  </div>
                                  <div style={{ color: C.textXS, fontSize: 12.5, lineHeight: 1.6 }}>
                                    {emptyReason}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Pending approvals */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3 }}>PENDING APPROVALS</p>
                {Paid > 0 && <span style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 11.5, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.15)" }}>{Paid} awaiting</span>}
              </div>
              <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 560 : 0 }}>
                    <thead><tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["ID", "Guest", "Email", "Phone", "Date", "Total", "Status", "Actions"].map((h) => <th key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {bookings.filter((b) => b.status === "Paid").map((b, idx) => (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                          <td style={{ padding: "12px 14px", color: gold, fontSize: 12.5, whiteSpace: "nowrap", fontFamily: "monospace" }}>{b.id}</td>
                          <td style={{ padding: "12px 14px", color: C.textH, fontSize: 13.5 }}>{b.name}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5 }}>{b.email || "—"}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.contact || "—"}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.date}</td>
                          <td style={{ padding: "12px 14px", color: C.textH, fontSize: 13.5, whiteSpace: "nowrap", fontWeight: 600 }}>{fmt(b.total)}</td>
                          <td style={{ padding: "12px 14px" }}><span style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 10.5, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.2)", letterSpacing: 1 }}>Paid</span></td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Confirmed", guestName: b.name })} style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.2)", padding: "5px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap", letterSpacing: 1 }}>ACCEPT</button>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Cancelled", guestName: b.name })} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>REJECT</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {Paid === 0 && <tr><td colSpan={8} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 14.5 }}>No pending bookings.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Availability Calendar */}
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, margin: 0 }}>AVAILABILITY OVERVIEW</p>
                  <div style={{ display: "flex", gap: 14 }}>
                    {[["Booked", "#4caf50"], ["Closed", "#e07070"], ["Available", isDark ? "#2a2620" : "#e8e0d4"]].map(([l, c]) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: c }} /><span style={{ color: C.textXS, fontSize: 11.5 }}>{l}</span></div>
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
                            <p style={{ color: gold, fontSize: 12.5, fontFamily: "'Cormorant Garamond',Georgia,serif", letterSpacing: 2, marginBottom: 14, textAlign: "center" }}>{label}</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
                              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10.5, color: C.textXS, padding: "2px 0" }}>{d}</div>)}
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
                                  <div key={d} title={booking ? `${booking.name} · ${booking.guests} guests` : isClosed ? "Closed" : ""} style={{ textAlign: "center", padding: "5px 2px", borderRadius: 3, background: bg, color: col, fontSize: 12.5, cursor: booking || isClosed ? "pointer" : "default", userSelect: "none", position: "relative", transition: "background .1s" }}>
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
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>MANAGEMENT</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>All Bookings</h2>
              </div>
              <BookingsTab bookings={bookings.filter(b => b.source !== "Walk-In" || b.status === "Confirmed" || b.status === "Completed" || b.archived)} setBookings={setBookings} updateStatus={updateStatus} mob={mob} rooms={rooms} />
            </div>
          )}

          {/* WALK-IN TAB */}
          {tab === "Walk-In" && (() => {
            const walkInBookings = bookings.filter(b => b.source === "Walk-In" && !b.archived);
            const wiPending   = walkInBookings.filter(b => b.status === "Paid");
            const wiConfirmed = walkInBookings.filter(b => b.status === "Confirmed");
            const wiCompleted = walkInBookings.filter(b => b.status === "Completed");

            return (
              <WalkInTab
                walkInBookings={walkInBookings}
                wiPending={wiPending}
                wiConfirmed={wiConfirmed}
                wiCompleted={wiCompleted}
                updateStatus={updateStatus}
                isDark={isDark}
                C={C}
                cBg={cBg}
                cBr={cBr}
                mob={mob}
                toast={toast}
                gold={gold}
                bookings={bookings}
                setBookings={setBookings}
                rooms={rooms}
                packages={packages}
                facilities={facilities}
              />
            );
          })()}

          {/* OCCUPANCY */}
          {tab === "Occupancy" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>CALENDAR VIEW</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Occupancy</h2>
                <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>Click a date to toggle it as closed.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={{ background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", borderRadius: 4, padding: "6px 14px", fontSize: 14.5 }}>‹</button>
                <span style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18 }}>{calMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
                <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} style={{ background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", borderRadius: 4, padding: "6px 14px", fontSize: 14.5 }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center", color: C.textXS, fontSize: 11.5, padding: "6px 0", letterSpacing: 1 }}>{d}</div>)}
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
                  else if (status === "Confirmed" || status === "Paid") { bg = isDark ? "#0f2018" : "#eafaf0"; col = "#4caf50"; border = "1px solid rgba(76,175,80,0.3)"; }
                  else if (status === "Completed") { bg = isDark ? "#0f1a2a" : "#e8f4fb"; col = "#4a9fd4"; border = "1px solid rgba(74,159,212,0.3)"; }
                  return (
                    <div key={d} onClick={() => !isPast && !["Confirmed", "Paid", "Completed"].includes(status || "") && toggleClosed(ds)
                    } style={{ 
                      textAlign: "center", 
                      padding: mob ? "12px 4px" : "16px 4px", 
                      borderRadius: 6, 
                      background: bg, border, 
                      color: col, 
                      fontSize: mob ? 12.5 : 14.5, 
                      cursor:
                        isPast
                          ? "default"
                          : ["Confirmed", "Paid", "Completed"].includes(status || "")
                          ? "default"
                          : "pointer",
                      userSelect: "none", 
                      transition: "all .15s", 
                      position: "relative" }}>
                      {d}
                      {status && <div style={{ fontSize: 9.5, marginTop: 3, opacity: 0.8 }}>{status === "Closed" ? "CLOSED" : status === "Paid" ? "PAID" : status?.toUpperCase().slice(0, 4)}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[["Booked/Confirmed", "#4caf50"], ["Paid", "#f5c518"], ["Completed", "#4a9fd4"], ["Closed", "#e07070"], ["Click to close/open", gold]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: c }} /><span style={{ color: C.textS, fontSize: 12.5 }}>{l}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* ROOMS */}
          {tab === "Rooms" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
                <div><p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>ACCOMMODATIONS</p><h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Rooms</h2></div>
                <button onClick={openAdd} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD ROOM</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
                {rooms.map((r) => (
                  <div key={r.id} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden", boxShadow: C.shadowCard }}>
                    <div style={{ position: "relative", overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" decoding="async" src={r.img} alt={r.name} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.5),transparent 60%)" }} />
                      <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5, background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: "2px 8px" }}><Icon name="users" size={11} style={{ marginRight: 4 }} />Up to {r.capacity}</span>
                        <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{fmt(r.price)}<span style={{ fontSize: 10.5, opacity: 0.8 }}>/slot</span></span>
                      </div>
                    </div>
                    <div style={{ padding: "16px 18px" }}>
                      <h4 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, marginBottom: 4, fontWeight: 400 }}>{r.name}</h4>
                      <p style={{ color: gold, fontSize: 12.5, marginBottom: 8 }}><Icon name="bed" size={12} style={{ marginRight: 5 }} />{r.beds}</p>
                      <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>{r.desc}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(r)} style={{ ...outBtn, flex: 1, padding: "8px 12px", fontSize: 11.5, letterSpacing: 1 }}>EDIT</button>
                        <button onClick={() => setConfirmRemoveRoom(r)} style={{ flex: 1, background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "8px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>REMOVE</button>
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
                <div><p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>MEDIA</p><h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Gallery</h2></div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={galleryFileRef} type="file" accept="image/*" multiple onChange={handleGalleryUpload} style={{ display: "none" }} />
                  <button onClick={() => galleryFileRef.current?.click()} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD PHOTOS</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3,1fr)", gap: 12 }}>
                {galleryImgs.map((src, i) => (
                  <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${cBr}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" decoding="async" src={src} alt="" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                    <button onClick={() => deleteGalleryImg(i)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(229,85,85,0.9)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PACKAGES */}
          {tab === "Packages" && <PackagesTab packages={packages} setPackages={setPackages} mob={mob} />}

          {/* FACILITIES */}
          {tab === "Facilities" && <FacilitiesTab facilities={facilities} setFacilities={setFacilities} bookings={bookings} mob={mob} />}

          {/* MAINTENANCE — the switch that closes the public site */}
          {tab === "Maintenance" && <MaintenanceTab mob={mob} />}

          {/* INVENTORY */}
          {tab === "Inventory" && <InventoryTab inventory={inventory} setInventory={setInventory} />}

          {/* ANALYTICS */}
          {tab === "Analytics" && <AnalyticsTab bookings={bookings} />}

          {/* REPORTS */}
          {tab==="Reports"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,flexWrap:"wrap",gap:12}}>
                <div><p style={{color:C.textXS,fontSize:11.5,letterSpacing:2.5,marginBottom:8}}>INSIGHTS</p><h2 style={{color:C.textH,fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:mob?24:30,fontWeight:400,margin:0}}>Reports</h2></div>
                <button onClick={()=>{
                  // Build CSV content for Excel
                  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  const now=new Date();
                  const selMonthIdx=now.getMonth();
                  const selYear=now.getFullYear();
                  const monthStr=String(selMonthIdx+1).padStart(2,"0");
                  const monthBookings=bookings.filter(b=>b.date&&b.date.startsWith(`${selYear}-${monthStr}`));
                  const header=["Booking ID","Guest Name","Contact","Email","Date","Package","Guests","Overtime (hrs)","Rooms","Total (₱)","Downpayment (₱)","Status","Notes"];
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
                    ["Paid",monthBookings.filter(b=>b.status==="Paid").length],
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
                }} style={{...goldBtn,padding:"10px 20px",fontSize:11.5,letterSpacing:2,display:"flex",alignItems:"center",gap:8}}>
                  <Icon name="download" size={13} />
                  EXPORT THIS MONTH
                </button>
              </div>

              {/* KPI Cards — each carries a 12-month sparkline derived from
                  the same bookings the figure itself counts, so the number
                  arrives with its trend rather than standing alone. */}
              {(()=>{
                const mo=(i:number)=>String(i+1).padStart(2,"0");
                const per=(fn:(b:typeof bookings[number])=>number,filter:(b:typeof bookings[number])=>boolean)=>
                  Array.from({length:12},(_,i)=>bookings.filter(b=>b.date&&b.date.startsWith(`2026-${mo(i)}`)&&filter(b)).reduce((s,b)=>s+fn(b),0));
                const notCancelled=(b:typeof bookings[number])=>b.status!=="Cancelled";
                return(
                  <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:mob?10:14,marginBottom:18}}>
                    <StatCard icon="cash" label="Total Revenue" color="#4caf50" mob={mob}
                      value={fmt(bookings.filter(notCancelled).reduce((s,b)=>s+b.total,0))}
                      series={per(b=>b.total,notCancelled)} />
                    <StatCard icon="download" label="Down Collected" color={gold} mob={mob}
                      value={fmt(bookings.filter(notCancelled).reduce((s,b)=>s+b.downpayment,0))}
                      series={per(b=>b.downpayment,notCancelled)} />
                    <StatCard icon="clipboard" label="Active Bookings" color="#4a9fd4" mob={mob}
                      value={bookings.filter(b=>["Paid","Confirmed"].includes(b.status)).length}
                      series={per(()=>1,b=>["Paid","Confirmed"].includes(b.status))} />
                    <StatCard icon="check-circle" label="Completed" color="#4caf50" mob={mob}
                      value={bookings.filter(b=>b.status==="Completed").length}
                      series={per(()=>1,b=>b.status==="Completed")} />
                  </div>
                );
              })()}

              {/* Monthly Revenue Breakdown */}
              {(()=>{
                const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const monthlyData=months.map((_,mi)=>{
                  const m=String(mi+1).padStart(2,"0");
                  const mBookings=bookings.filter(b=>b.date&&b.date.startsWith(`2026-${m}`)&&b.status!=="Cancelled");
                  return{label:months[mi],revenue:mBookings.reduce((s,b)=>s+b.total,0),count:mBookings.length,guests:mBookings.reduce((s,b)=>s+b.guests,0)};
                });
                const maxRev=Math.max(...monthlyData.map(m=>m.revenue),1);
                void maxRev; // scale is now derived inside BarChart
                // Green, matching the Total Revenue card above it. Gold is this
                // tab's colour for down payments (Down Collected), so a gold
                // revenue bar made the same colour mean two different amounts
                // on one screen.
                return(
                  <Panel title="MONTHLY REVENUE (2026)" style={{marginBottom:18}}>
                    <BarChart
                      data={monthlyData.map(m=>({label:m.label,value:m.revenue}))}
                      color="#4caf50"
                      height={210}
                      mob={mob}
                      formatValue={(v)=>v>=1000?`₱${(v/1000).toFixed(0)}k`:`₱${v}`}
                    />
                  </Panel>
                );
              })()}

              {/* Booking Status Breakdown + Cancellation Rate */}
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:mob?14:18,marginBottom:18}}>
                <Panel title="STATUS BREAKDOWN">
                  {[["Paid","#f5c518"],["Confirmed","#4caf50"],["Completed","#4a9fd4"],["Cancelled","#e55"]].map(([s,c])=>{
                    const n=bookings.filter(b=>b.status===s).length;
                    const pct=bookings.length?Math.round((n/bookings.length)*100):0;
                    return <ProgressRow key={s} label={s} value={n} pct={pct} color={c} />;
                  })}
                </Panel>
                <Panel title="FINANCIAL SUMMARY">
                  {(()=>{
                    const active=bookings.filter(b=>b.status!=="Cancelled");
                    const totalRev=active.reduce((s,b)=>s+b.total,0);
                    const collected=active.reduce((s,b)=>s+b.downpayment,0);
                    const balance=totalRev-collected;
                    const cancelled=bookings.filter(b=>b.status==="Cancelled").length;
                    const cancelRate=bookings.length?Math.round((cancelled/bookings.length)*100):0;
                    const avgBookingVal=active.length?Math.round(totalRev/active.length):0;
                    return(
                      <div style={{display:"flex",flexDirection:"column"}}>
                        {[["Gross Revenue",fmt(totalRev),"#4caf50"],["Downpayments In",fmt(collected),gold],["Balance Remaining",fmt(balance),"#4a9fd4"],["Avg Booking Value",fmt(avgBookingVal),C.textH],["Cancellation Rate",`${cancelRate}%`,"#e55"]].map(([l,v,c],i,arr)=>(
                          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i===arr.length-1?"none":`1px solid ${cBr}`}}>
                            <span style={{color:C.textS,fontSize:14}}>{l}</span>
                            <span style={{color:c,fontWeight:700,fontSize:15,fontVariantNumeric:"tabular-nums"}}>{v}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </Panel>
              </div>


              {/* Export by Month */}
              <Panel title="EXPORT MONTHLY REPORTS">
                <p style={{color:C.textXS,fontSize:13,marginTop:-8,marginBottom:16,lineHeight:1.6}}>Download a full booking report for any month as a CSV file (opens in Excel/Sheets).</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((mon,mi)=>{
                    const m=String(mi+1).padStart(2,"0");
                    const mBookings=bookings.filter(b=>b.date&&b.date.startsWith(`2026-${m}`));
                    const hasData=mBookings.length>0;
                    return(
                      <button key={mon} disabled={!hasData} onClick={()=>{
                        const header=["Booking ID","Guest Name","Contact","Email","Date","Package","Guests","Overtime (hrs)","Rooms","Total (₱)","Downpayment (₱)","Status","Notes"];
                        const rows=mBookings.map(b=>[b.id,b.name,b.contact||"",b.email||"",b.date,b.package,b.guests,b.overtime||0,(b.rooms||[]).map(rid=>rooms.find(r=>r.id===rid)?.name||"").filter(Boolean).join(" | ")||"None",b.total,b.downpayment,b.status,b.notes||""]);
                        const totalRev=mBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.total,0);
                        const summary=[[],["SUMMARY",""],["Month",`${mon} 2026`],["Bookings",mBookings.length],["Revenue (non-cancelled)",totalRev],["Guests",mBookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+b.guests,0)]];
                        const csv=[header,...rows,...summary].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                        const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
                        const url=URL.createObjectURL(blob);
                        const a=document.createElement("a");a.href=url;a.download=`StoneWood_${mon}2026.csv`;a.click();URL.revokeObjectURL(url);
                        toast(`Exported ${mon} 2026 report.`,"success");
                      }} style={{padding:"8px 14px",fontSize:12,fontWeight:600,borderRadius:8,cursor:hasData?"pointer":"not-allowed",letterSpacing:0.6,background:hasData?(isDark?"rgba(201,168,76,0.08)":"rgba(201,168,76,0.1)"):(isDark?"#0e0c09":"#f5f0e8"),color:hasData?gold:C.textXS,border:`1px solid ${hasData?gold+"55":cBr}`,opacity:hasData?1:0.5,display:"flex",alignItems:"center",gap:5}}>
                        <Icon name="download" size={11} />
                        {mon}
                        {hasData&&<span style={{background:`${gold}22`,borderRadius:10,padding:"1px 6px",fontSize:10.5}}>{mBookings.length}</span>}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            </div>
          )}

          {/* CUSTOMER SERVICE */}
          {tab === "Customer Service" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>MESSAGES</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Customer Service</h2>
              </div>

              {/* ARCHIVE CONFIRM MODAL */}
              {confirmArchiveMsg && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 500,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      background: isDark ? "#0e0c09" : "#fff",
                      border: `1px solid ${cBr}`,
                      borderRadius: 12,
                      padding: "28px 26px",
                      width: "100%",
                      maxWidth: 400,
                    }}
                  >
                    <h3
                      style={{
                        color: C.textH,
                        fontFamily:
                          "'Cormorant Garamond',Georgia,serif",
                        fontSize: 18,
                        marginBottom: 12,
                        fontWeight: 400,
                      }}
                    >
                      Archive this message?
                    </h3>

                    <p
                      style={{
                        color: C.textS,
                        fontSize: 14.5,
                        marginBottom: 22,
                        lineHeight: 1.7,
                      }}
                    >
                      From{" "}
                      <strong style={{ color: C.textH }}>
                        {confirmArchiveMsg.name}
                      </strong>
                      : "
                      {confirmArchiveMsg.message.slice(0, 80)}
                      {confirmArchiveMsg.message.length > 80
                        ? "…"
                        : ""}
                      "
                    </p>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                      }}
                    >
                      <button
                        onClick={() =>
                          setConfirmArchiveMsg(null)
                        }
                        style={{
                          flex: 1,
                          background: "transparent",
                          color: C.textS,
                          border: `1px solid ${cBr}`,
                          padding: 11,
                          fontSize: 12.5,
                          cursor: "pointer",
                          borderRadius: 6,
                        }}
                      >
                        CANCEL
                      </button>

                      <button
                        onClick={() => {
                          setArchivedMessages((prev) => [
                            ...prev,
                            confirmArchiveMsg,
                          ]);

                          setCustomerMessages((prev) =>
                            prev.filter(
                              (m) => m.id !== confirmArchiveMsg.id
                            )
                          );

                          setConfirmArchiveMsg(null);

                          toast(
                            "Message archived.",
                            "info"
                          );
                        }}
                        style={{
                          ...goldBtn,
                          flex: 2,
                        }}
                      >
                        ARCHIVE
                      </button>
                    </div>
                  </div>
                </div>
              )}


              {/* INBOX / ARCHIVE TABS */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                {(["inbox", "archive"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCsView(v)}
                    style={{
                      padding: "8px 18px",
                      fontSize: 12.5,
                      fontWeight: 700,
                      borderRadius: 20,
                      cursor: "pointer",
                      background:
                        csView === v
                          ? `${gold}18`
                          : "transparent",
                      color:
                        csView === v
                          ? gold
                          : C.textS,
                      border: `1px solid ${
                        csView === v
                          ? `${gold}55`
                          : cBr
                      }`,
                      letterSpacing: 1,
                    }}
                  >
                    {v.toUpperCase()}{" "}

                    {v === "inbox" &&
                      customerMessages.length > 0 &&
                      `(${customerMessages.length})`}

                    {v === "archive" &&
                      archivedMessages.length > 0 &&
                      `(${archivedMessages.length})`}
                  </button>
                ))}
              </div>

              {/* EMPTY STATE */}
              {(
                csView === "inbox"
                  ? customerMessages
                  : archivedMessages
              ).length === 0 ? (
                <div
                  style={{
                    background: cBg,
                    border: `1px solid ${cBr}`,
                    borderRadius: 10,
                    padding: "52px 20px",
                    textAlign: "center",
                    boxShadow: C.shadowCard,
                  }}
                >
                  {/* Sized and coloured against the theme rather than left at
                      the default text colour, so the empty state reads as one
                      muted unit instead of a hard black mark above grey text. */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: 14,
                      color: C.textXS,
                      opacity: 0.6,
                    }}
                  >
                    <Icon name="message" size={30} strokeWidth={1.25} />
                  </div>

                  <p
                    style={{
                      color: C.textS,
                      fontSize: 15,
                    }}
                  >
                    {csView === "inbox"
                      ? "No new messages."
                      : "No archived messages."}
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {(
                    csView === "inbox"
                      ? customerMessages
                      : archivedMessages
                  ).map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        background: cBg,
                        border: `1px solid ${cBr}`,
                        borderRadius: 10,
                        padding: "20px 22px",
                        boxShadow: C.shadowCard,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: C.textH,
                              fontSize: 15,
                              fontWeight: 600,
                            }}
                          >
                            {msg.name}
                          </div>

                          <div
                            style={{
                              color: C.textXS,
                              fontSize: 12.5,
                            }}
                          >
                            {msg.email} · {msg.date}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {/* TYPE BADGE */}
                          <span
                            style={{
                              background: `${gold}18`,
                              color: gold,
                              fontSize: 10.5,
                              padding: "3px 8px",
                              borderRadius: 20,
                              border: `1px solid ${gold}44`,
                              letterSpacing: 1,
                            }}
                          >
                            {msg.type.toUpperCase()}
                          </span>
                          {/* REPLY BUTTON */}
                          <button
                            onClick={() => {
                              setReplyModal(msg);

                              setReplyMode("automated");

                              setReplyMessage(
                                automatedReplies[
                                  msg.type as keyof typeof automatedReplies
                                ] || ""
                              );
                            }}
                            style={{
                              background: `${gold}18`,
                              border: `1px solid ${gold}44`,
                              color: gold,
                              padding: "4px 10px",
                              fontSize: 11.5,
                              cursor: "pointer",
                              borderRadius: 4,
                            }}
                          >
                            REPLY
                          </button>

                          {/* ARCHIVE BUTTON */}
                          {csView === "inbox" && (
                            <button
                              onClick={() =>
                                setConfirmArchiveMsg(msg)
                              }
                              style={{
                                background: "transparent",
                                border: `1px solid ${cBr}`,
                                color: C.textXS,
                                padding: "4px 10px",
                                fontSize: 11.5,
                                cursor: "pointer",
                                borderRadius: 4,
                              }}
                            >
                              ARCHIVE
                            </button>
                          )}
                        </div>
                      </div>

                      <p
                        style={{
                          color: C.textB,
                          fontSize: 14.5,
                          lineHeight: 1.7,
                          margin: 0,
                        }}
                      >
                        {msg.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {/* REPLY MODAL */}
              {replyModal && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.75)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 600,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 520,
                      background: cBg,
                      border: `1px solid ${cBr}`,
                      borderRadius: 14,
                      padding: "24px",
                      boxShadow: C.shadowCard,
                    }}
                  >
                    <div style={{ marginBottom: 18 }}>
                      <h3
                        style={{
                          margin: 0,
                          color: C.textH,
                          fontSize: 22,
                          fontWeight: 500,
                          fontFamily:
                            "'Cormorant Garamond',Georgia,serif",
                        }}
                      >
                        Send Response
                      </h3>

                      <p
                        style={{
                          color: C.textS,
                          fontSize: 13.5,
                          marginTop: 6,
                          marginBottom: 0,
                        }}
                      >
                        Replying to {replyModal.name}
                      </p>
                    </div>

                    {/* MODE SELECT */}
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginBottom: 16,
                      }}
                    >
                      {(["automated", "manual"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setReplyMode(type);

                            if (type === "automated") {
                              setReplyMessage(
                                automatedReplies[
                                  replyModal.type as keyof typeof automatedReplies
                                ] || ""
                              );
                            } else {
                              setReplyMessage("");
                            }
                          }}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 20,
                            cursor: "pointer",
                            fontSize: 12.5,
                            fontWeight: 700,
                            letterSpacing: 1,
                            background:
                              replyMode === type
                                ? `${gold}18`
                                : "transparent",
                            color:
                              replyMode === type
                                ? gold
                                : C.textS,
                            border: `1px solid ${
                              replyMode === type
                                ? `${gold}55`
                                : cBr
                            }`,
                          }}
                        >
                          {type.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {/* EMAIL */}
                    <div style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          color: C.textXS,
                          fontSize: 11.5,
                          marginBottom: 6,
                          letterSpacing: 2,
                        }}
                      >
                        CUSTOMER EMAIL
                      </div>

                      <input
                        value={replyModal.email}
                        disabled
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          borderRadius: 8,
                          border: `1px solid ${cBr}`,
                          background: "transparent",
                          color: C.textS,
                          fontSize: 14.5,
                          outline: "none",
                        }}
                      />
                    </div>

                    {/* MESSAGE */}
                    <div style={{ marginBottom: 20 }}>
                      <div
                        style={{
                          color: C.textXS,
                          fontSize: 11.5,
                          marginBottom: 6,
                          letterSpacing: 2,
                        }}
                      >
                        MESSAGE
                      </div>

                      <textarea
                        value={replyMessage}
                        onChange={(e) =>
                          setReplyMessage(e.target.value)
                        }
                        rows={6}
                        style={{
                          width: "100%",
                          resize: "none",
                          padding: "14px",
                          borderRadius: 8,
                          border: `1px solid ${cBr}`,
                          background: "transparent",
                          color: C.textB,
                          fontSize: 14.5,
                          outline: "none",
                          lineHeight: 1.7,
                        }}
                      />
                    </div>

                    {/* ACTIONS */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 10,
                      }}
                    >
                      <button
                        onClick={() => setReplyModal(null)}
                        style={{
                          background: "transparent",
                          border: `1px solid ${cBr}`,
                          color: C.textS,
                          padding: "10px 16px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12.5,
                        }}
                      >
                        CANCEL
                      </button>

                      <button
                        onClick={() => {
                          window.location.href = `mailto:${replyModal.email}?subject=Customer Service Response&body=${encodeURIComponent(
                            replyMessage
                          )}`;

                          setReplyModal(null);
                        }}
                        style={{
                          ...goldBtn,
                          padding: "10px 18px",
                        }}
                      >
                        SEND EMAIL
                      </button>
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
            <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, color: dashConfirm.action === "Confirmed" ? "#4caf50" : "#e55", background: dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.1)" : "rgba(229,85,85,0.1)", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}` }}>
              <Icon name={dashConfirm.action === "Confirmed" ? "check" : "x"} size={20} />
            </div>

            <h3 id="dash-confirm-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              {dashConfirm.action === "Confirmed" ? "Accept this booking?" : "Reject this booking?"}
            </h3>
            <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7, marginBottom: 18 }}>
              {dashConfirm.action === "Confirmed"
                ? <>You are about to <strong style={{ color: "#4caf50" }}>accept</strong> the booking for <strong style={{ color: C.textH }}>{dashConfirm.guestName}</strong>. This will confirm their reservation.</>
                : <>You are about to <strong style={{ color: "#e55" }}>reject</strong> the booking for <strong style={{ color: C.textH }}>{dashConfirm.guestName}</strong>. This cannot be undone.</>
              }
            </p>

            {/* Warning callout */}
            <div style={{ background: dashConfirm.action === "Confirmed" ? (isDark ? "rgba(76,175,80,0.06)" : "rgba(76,175,80,0.05)") : (isDark ? "rgba(229,85,85,0.06)" : "rgba(229,85,85,0.04)"), border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.2)" : "rgba(229,85,85,0.15)"}`, borderRadius: 8, padding: "11px 14px", marginBottom: 22, display: "flex", gap: 8 }}>
              <Icon name={dashConfirm.action === "Confirmed" ? "check-circle" : "alert"} size={15} />
              <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                {dashConfirm.action === "Confirmed"
                  ? "The guest will receive a confirmation email and their booking status will be updated to 'Confirmed'."
                  : "The guest will receive a cancellation email and their booking status will be updated to 'Cancelled'."
                }
              </span>
            </div>

            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDashConfirm(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "12px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 8, letterSpacing: 1 }}>
                GO BACK
              </button>
              <button
                onClick={() => {
                  updateStatus(dashConfirm.bookingId, dashConfirm.action);
                  if (dashConfirm.action === "Confirmed") toast(`Booking accepted for ${dashConfirm.guestName}.`, "success");
                  else toast(`Booking rejected for ${dashConfirm.guestName}.`, "warning");
                  setDashConfirm(null);
                }}
                style={{ flex: 2, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 8, letterSpacing: 2, background: dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.12)" : "rgba(229,85,85,0.10)", color: dashConfirm.action === "Confirmed" ? "#4caf50" : "#e55", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}` }}
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
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, color: "#e55" }}><Icon name="lock" size={20} /></div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400, marginBottom: 8 }}>Sign out?</h3>
            <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7, marginBottom: 24 }}>You will be returned to the main site.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button onClick={() => { setShowLogoutConfirm(false); onLogout(); toast("Signed out.", "info"); }} style={{ flex: 2, background: isDark ? "rgba(255,255,255,0.04)" : "#f5f0e8", color: C.textH, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2 }}>YES, SIGN OUT</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Room Confirm */}
      {confirmRemoveRoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 20 }}>
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: "1px solid rgba(229,85,85,0.22)", borderRadius: 12, padding: "28px 26px", width: "100%", maxWidth: 400, boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
            {confirmRemoveRoom.img && <img loading="lazy" decoding="async" src={confirmRemoveRoom.img} alt={confirmRemoveRoom.name} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 18 }} />}
            <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "#e55" }}><Icon name="bed" size={22} /></div>
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 8 }}>Remove this room?</h3>
            <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7, marginBottom: 6 }}><strong style={{ color: C.textH }}>{confirmRemoveRoom.name}</strong> will be permanently removed from the system.</p>
            <p style={{ color: "rgba(229,85,85,0.75)", fontSize: 13.5, marginBottom: 22 }}><Icon name="alert" size={12} style={{ marginRight: 5 }} />This action cannot be undone.</p>
            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmRemoveRoom(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 12.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button onClick={() => { deleteRoom(confirmRemoveRoom.id); setConfirmRemoveRoom(null); }} style={{ flex: 2, background: "rgba(229,85,85,0.10)", color: "#e55", border: "1px solid rgba(229,85,85,0.25)", padding: "11px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2 }}>YES, REMOVE</button>
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
              <label style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 8 }}>ROOM IMAGE</label>
              {imgPrev && <img loading="lazy" decoding="async" src={imgPrev} alt="preview" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8, marginBottom: 10, border: `1px solid ${cBr}` }} />}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} />
              <button onClick={() => fileRef.current?.click()} style={{ ...outBtn, width: "100%", padding: 11, fontSize: 12.5, borderRadius: 6 }}><Icon name="folder" size={13} style={{ marginRight: 6 }} />CHOOSE IMAGE</button>
            </div>
            {[["Room Name", "name", "text"], ["Bed Configuration", "beds", "text"], ["Max Capacity", "capacity", "number"], ["Price per Slot (₱)", "price", "number"]].map(([l, k, t]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 6 }}>{(l as string).toUpperCase()}</label>
                <input type={t as string} value={rf[k as keyof typeof rf]} onChange={(e) => setRf((f) => ({ ...f, [k]: e.target.value }))} className="sw-input" style={inpS} />
              </div>
            ))}
            <div style={{ marginBottom: 22 }}>
              <label style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 3, display: "block", marginBottom: 6 }}>DESCRIPTION</label>
              <textarea value={rf.desc} onChange={(e) => setRf((f) => ({ ...f, desc: e.target.value }))} rows={3} className="sw-input" style={{ ...inpS, resize: "vertical" }} />
            </div>
            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: 12, fontSize: 12.5, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button onClick={saveRoom} style={{ ...goldBtn, flex: 2, borderRadius: 6 }}>SAVE ROOM</button>
            </div>
          </div>
        </div>
      )}

      <ThemeToggle />
    </div>
  );
}
