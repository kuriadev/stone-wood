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
import { MenuTab } from "@/components/admin/MenuTab";
import { FacilitiesTab } from "@/components/admin/FacilitiesTab";
import { PackagesTab } from "@/components/admin/PackagesTab";
import { calcTourBase, calcExclusiveDiscount, calcComboDiscount, calcFoodTotal, genBookingId, getPackageTier, checkBookingAvailability, isMenuItemSellable, deductRecipeStock, isRoomOpen, calcPackageFoodDiscount } from "@/lib/utils";
import { sanitizeName, sanitizeContact, isValidName, isValidPHNumber, RESORT_MAX_CAPACITY, COMBO_DISCOUNT_PCT, ROOM_BUNDLE_DISCOUNT_PCT } from "@/lib/validators";
import type { Booking, BookingFoodItem, BookingResource, BookingTier } from "@/types/booking";
import type { MenuItem } from "@/types/menu";
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
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
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
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
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
  bookings, setBookings, rooms, menuItems, setMenuItems, inventory, setInventory,
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
    tourType: "Day Tour" as "Day Tour" | "Night Tour",
    rooms: [] as number[], date: todayStr(), time: "", notes: "", paymentCollected: true,
  });
  const [wfFoodQty, setWfFoodQty] = useState<Record<number, number>>({});
  const setWfField = (k: string, v: unknown) => setWf((f) => ({ ...f, [k]: v }));
  const setWfFoodItemQty = (id: number, qty: number) => setWfFoodQty((f) => ({ ...f, [id]: Math.max(0, qty) }));
  const wfFoodOrder: BookingFoodItem[] = Object.entries(wfFoodQty)
    .filter(([, qty]) => qty > 0)
    .map(([itemId, qty]) => {
      const item = menuItems.find((m) => m.id === Number(itemId));
      return { itemId: Number(itemId), name: item?.name ?? "Item", price: item?.price ?? 0, qty };
    });
  const wfFoodTotal = calcFoodTotal(wfFoodOrder);

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
  const wfShowRoomPicker = (!isWfPackage) || (isWfPackage && wfRequiresRoom);
  const toggleWfRoom = (id: number) => {
    if (isWfPackage && wfRequiresRoom) {
      setWfField("rooms", wf.rooms.includes(id) ? [] : [id]);
    } else {
      setWfField("rooms", wf.rooms.includes(id) ? wf.rooms.filter((r) => r !== id) : [...wf.rooms, id]);
    }
  };

  const wfPackageLabel = isWfPackage
    ? wfSelectedPackage!.title
    : `${wf.tourType}${wf.rooms.length > 0 ? " + Room" : ""}`;
  const wfGuests = isWfPackage ? wfSelectedPackage!.capacity : Number(wf.guests) || 0;
  // Same Shared-vs-Exclusive choice as the customer-facing Book Now flow:
  // staff can override the guest-count-derived default explicitly. A package
  // fixes its own tier — no override needed.
  const [wfTierChoice, setWfTierChoice] = useState<BookingTier | null>(null);
  const wfTier: BookingTier = isWfPackage ? wfSelectedPackage!.status : (wfTierChoice ?? getPackageTier(wfGuests));
  const wfResource: BookingResource = isWfPackage ? wfSelectedPackage!.resource : "Pool";
  // An Exclusive walk-in buyout is fixed to the resort's full capacity, same
  // as online — the guest count field locks to it instead of staying editable.
  useEffect(() => {
    if (!isWfPackage && wfTier === "Exclusive" && wfGuests !== RESORT_MAX_CAPACITY) {
      setWfField("guests", String(RESORT_MAX_CAPACITY));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfTier, isWfPackage]);
  const wfDateCapacity = wf.date ? checkBookingAvailability(wf.date, wfGuests, wfTier, wfResource, bookings, facilities) : { ok: true as const };
  const wfTourBase = isWfPackage ? wfSelectedPackage!.price : calcTourBase(wfGuests, wfTier);
  const wfExclusiveDiscount = isWfPackage ? 0 : calcExclusiveDiscount(wfTier, wfGuests);
  const wfOvertimeFee = isWfPackage ? 0 : (Number(wf.overtime) || 0) * 500;
  const wfSelectedRoomDetails = wf.rooms.map((rid) => rooms.find((r) => r.id === rid)).filter((r): r is Room => !!r);
  const wfRoomsFeeRaw = wfSelectedRoomDetails.reduce((sum, r) => sum + r.price, 0);
  const wfRoomBundleDiscount = isWfPackage && wfRequiresRoom ? Math.round(wfRoomsFeeRaw * ROOM_BUNDLE_DISCOUNT_PCT) : 0;
  const wfRoomsFee = wfRoomsFeeRaw - wfRoomBundleDiscount;
  const wfComboDiscount = calcComboDiscount(wfFoodOrder, menuItems);
  const wfPackageFoodDiscount = isWfPackage ? calcPackageFoodDiscount(wfFoodOrder, wfSelectedPackage?.foodDiscountPct) : 0;
  const wfTotal = wfTourBase - wfExclusiveDiscount + wfOvertimeFee + wfRoomsFee + wfFoodTotal - wfComboDiscount - wfPackageFoodDiscount;
  const wfDown = wf.paymentCollected ? wfTotal : Math.ceil(wfTotal / 2);
  const wfRoomRequirementMet = !wfRequiresRoom || wf.rooms.length > 0;
  const wfValid = isValidName(wf.name) && isValidPHNumber(wf.contact) && wfGuests > 0 && wfDateCapacity.ok && (!isWfPackage || (!!wfSelectedPackage && wfRoomRequirementMet));
  const openNewWalkIn = () => {
    setWf({ name: "", contact: "", email: "", guests: "10", overtime: "0", tourType: "Day Tour", rooms: [], date: todayStr(), time: "", notes: "", paymentCollected: true });
    setWfFoodQty({});
    setWfTierChoice(null);
    setWfMode("Custom");
    setWfPkgId(null);
    setShowNewWalkIn(true);
  };
  const saveWalkIn = () => {
    const id = genBookingId(bookings.length);
    setBookings((b) => [...b, {
      id,
      name: sanitizeName(wf.name),
      contact: sanitizeContact(wf.contact),
      email: wf.email || "—",
      date: wf.date || todayStr(),
      guests: wfGuests || 1,
      package: wfPackageLabel,
      rooms: wf.rooms,
      overtime: Number(wf.overtime) || 0,
      total: wfTotal,
      downpayment: wfDown,
      status: wf.paymentCollected ? "Confirmed" : "Paid",
      paymentProof: wf.paymentCollected,
      notes: wf.time ? `Arrival: ${wf.time}${wf.notes ? " — " + wf.notes : ""}` : wf.notes,
      source: "Walk-In",
      createdAt: Date.now(),
      foodOrder: wfFoodOrder.length ? wfFoodOrder : undefined,
      foodTotal: wfFoodTotal || undefined,
      resource: wfResource,
      tier: wfTier,
    }]);
    if (wfFoodOrder.length) {
      setInventory((inv) => deductRecipeStock(wfFoodOrder, menuItems, inv));
    }
    toast(`Walk-in reservation ${id} encoded for ${wf.name}.`, "success");
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
          <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>WALK-IN RESERVATIONS</p>
          <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Walk-In Management</h2>
          <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>Encode a guest here as soon as they arrive to reserve without booking online.</p>
        </div>
        <button onClick={openNewWalkIn} style={{ ...goldBtn, padding: "10px 20px", fontSize: 11, letterSpacing: 2, whiteSpace: "nowrap" }}>+ NEW WALK-IN</button>
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
            <div style={{ color: C.textXS, fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>{l.toUpperCase()}</div>
            <div style={{ color: c, fontSize: mob ? 24 : 30, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Policy notice */}
      <div style={{ background: isDark ? "rgba(74,159,212,0.05)" : "rgba(74,159,212,0.04)", border: "1px solid rgba(74,159,212,0.2)", borderRadius: 10, padding: "14px 18px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🏡</span>
        <div>
          <p style={{ color: "#4a9fd4", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>WALK-IN PAYMENT POLICY</p>
          <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.7, margin: 0 }}>
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
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textXS, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
          >✕</button>
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
                    {wiSearch ? `No results for "${wiSearch}".` : `No ${wiTab.toLowerCase()} reservations.`}
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
                        {b.status === "Paid" && (
                          <>
                            <button
                              onClick={() => setWiConfirmAction({ bookingId: b.id, action: "Confirmed", guestName: b.name })}
                              style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.25)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                            >✓ ACCEPT</button>
                            <button
                              onClick={() => setWiConfirmAction({ bookingId: b.id, action: "Cancelled", guestName: b.name })}
                              style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
                            >CANCEL</button>
                          </>
                        )}
                        {b.status === "Confirmed" && (
                          <button
                            onClick={() => setWiConfirmAction({ bookingId: b.id, action: "Completed", guestName: b.name })}
                            style={{ background: "rgba(74,159,212,0.1)", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.25)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
                          >✓ COMPLETE</button>
                        )}
                        {(b.status === "Completed" || b.status === "Cancelled") && (
                          <button
                            onClick={() => setWiConfirmArchive(b)}
                            style={{ background: "rgba(150,150,150,0.08)", color: C.textS, border: `1px solid ${cBr}`, padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}
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
      <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>HOW WALK-IN RESERVATIONS WORK</p>
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
        {([
          ["1. Guest Arrives", "A guest shows up without an online booking and wants to reserve on the spot.", "#4a9fd4"],
          ["2. Staff Encodes Here", "Press + NEW WALK-IN and fill in their details, tour type, and any rooms.", "#f5c518"],
          ["3. Mark Payment Collected", "Check the box once cash/GCash is received — the reservation saves as Confirmed.", "#4caf50"],
        ] as [string, string, string][]).map(([title, desc, c]) => (
          <div key={title} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: c }} />
            <h4 style={{ color: C.textH, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</h4>
            <p style={{ color: C.textS, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* ── New Walk-In Intake Modal ── */}
      {showNewWalkIn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20, overflowY: "auto" }} role="dialog" aria-modal="true" aria-labelledby="new-walkin-title">
          <div style={{ background: isDark ? "linear-gradient(160deg,#0e0c09,#0a0806)" : "#fff", border: `1px solid ${gold}55`, borderRadius: 12, padding: "28px 26px", width: "100%", maxWidth: 480, boxShadow: "0 40px 100px rgba(0,0,0,0.7)", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 id="new-walkin-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 18 }}>Encode Walk-In Reservation</h3>

            <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>GUEST NAME</label>
                <input value={wf.name} onChange={(e) => setWfField("name", sanitizeName(e.target.value))} placeholder="Juan Dela Cruz" className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>CONTACT NUMBER</label>
                <input value={wf.contact} onChange={(e) => setWfField("contact", sanitizeContact(e.target.value))} maxLength={11} placeholder="09XXXXXXXXX" className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>EMAIL (OPTIONAL)</label>
                <input value={wf.email} onChange={(e) => setWfField("email", e.target.value)} placeholder="example@email.com" className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>DATE</label>
                <input type="date" value={wf.date} onChange={(e) => setWfField("date", e.target.value)} className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>ARRIVAL TIME</label>
                <input type="time" value={wf.time} onChange={(e) => setWfField("time", e.target.value)} className="sw-input" style={{ ...C.inp, borderRadius: 6 }} />
              </div>

              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>BOOKING TYPE</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Custom", "Package"] as const).map((m) => (
                    <button key={m} onClick={() => { setWfMode(m); if (m === "Custom") setWfPkgId(null); }} style={{ flex: 1, padding: "9px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", letterSpacing: 1, background: wfMode === m ? `${gold}18` : "transparent", color: wfMode === m ? gold : C.textS, border: `1px solid ${wfMode === m ? gold + "55" : cBr}` }}>
                      {m === "Custom" ? "🛠 Custom Tour" : "🎁 Package"}
                    </button>
                  ))}
                </div>
              </div>

              {wfMode === "Package" && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>SELECT PACKAGE</label>
                  {packages.filter((p) => p.active).length === 0 ? (
                    <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>No active packages — add one in the Packages tab.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {packages.filter((p) => p.active).map((p) => {
                        const sel = wfPkgId === p.id;
                        return (
                          <div key={p.id} onClick={() => setWfPkgId(p.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: sel ? `${gold}14` : "transparent", border: `1px solid ${sel ? gold + "55" : cBr}` }}>
                            <div>
                              <div style={{ color: C.textH, fontSize: 12, fontWeight: 600 }}>{p.title}</div>
                              <div style={{ color: C.textS, fontSize: 10 }}>{p.status} · {p.resource} · up to {p.capacity} guests</div>
                            </div>
                            <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{fmt(p.price)}</span>
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
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>GUESTS</label>
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
                  <p style={{ color: gold, fontSize: 10, marginTop: 4 }}>🔒 Fixed at {RESORT_MAX_CAPACITY} for an Exclusive buyout.</p>
                )}
              </div>
              <div>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>SHARED OR EXCLUSIVE?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Shared", "Exclusive"] as const).map((opt) => (
                    <button key={opt} onClick={() => setWfTierChoice(opt)} style={{ flex: 1, padding: "9px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", letterSpacing: 1, background: wfTier === opt ? (opt === "Exclusive" ? `${gold}18` : "rgba(76,175,80,0.12)") : "transparent", color: wfTier === opt ? (opt === "Exclusive" ? gold : "#4caf50") : C.textS, border: `1px solid ${wfTier === opt ? (opt === "Exclusive" ? gold + "55" : "#4caf5055") : cBr}` }}>
                      {opt === "Exclusive" ? "🔒 Exclusive" : "🤝 Shared"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>TOUR TYPE</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Day Tour", "Night Tour"] as const).map((t) => (
                    <button key={t} onClick={() => setWfField("tourType", t)} style={{ flex: 1, padding: "9px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", letterSpacing: 1, background: wf.tourType === t ? `${gold}18` : "transparent", color: wf.tourType === t ? gold : C.textS, border: `1px solid ${wf.tourType === t ? gold + "55" : cBr}` }}>
                      {t === "Day Tour" ? "☀️ Day Tour" : "🌙 Night Tour"}
                    </button>
                  ))}
                </div>
              </div>
              </>
              )}

              {wfShowRoomPicker && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>
                  {wfRequiresRoom ? "CHOOSE ROOM (REQUIRED)" : "ROOM ADD-ON (OPTIONAL)"}
                </label>
                {wfRequiresRoom && (
                  <p style={{ color: C.textS, fontSize: 11, marginBottom: 8 }}>Pick the one room included with this package — {Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}% off its normal rate.</p>
                )}
                {wfBookableRooms.length === 0 && (
                  <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>No rooms currently available — check Facilities for maintenance flags.</p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {wfBookableRooms.map((r) => {
                    const sel = wf.rooms.includes(r.id);
                    return (
                      <button key={r.id} onClick={() => toggleWfRoom(r.id)} style={{ padding: "7px 12px", fontSize: 11, borderRadius: 6, cursor: "pointer", background: sel ? `${gold}18` : "transparent", color: sel ? gold : C.textS, border: `1px solid ${sel ? gold + "55" : cBr}` }}>
                        {sel ? "✓ " : ""}{r.name}
                      </button>
                    );
                  })}
                </div>
                {wfRequiresRoom && wf.rooms.length === 0 && (
                  <p style={{ color: "#e55", fontSize: 11, marginTop: 6 }}>⚠ Please pick a room to continue.</p>
                )}
              </div>
              )}

              <div style={{ gridColumn: "1/-1", background: isDark ? "rgba(201,168,76,0.06)" : "rgba(201,168,76,0.08)", border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.textS, fontSize: 11, letterSpacing: 1 }}>PACKAGE</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{wfPackageLabel}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: 20, color: wfTier === "Exclusive" ? gold : "#4caf50", background: wfTier === "Exclusive" ? "rgba(201,168,76,0.15)" : "rgba(76,175,80,0.12)" }}>
                    {wfTier === "Exclusive" ? "🔒 EXCLUSIVE" : "🤝 SHARED"}
                  </span>
                </span>
              </div>
              <div style={{ gridColumn: "1/-1", background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${cBr}`, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.textS, fontSize: 11 }}>
                    {isWfPackage ? `${wfPackageLabel} (package)` : wfTier === "Exclusive" ? "Exclusive buyout (flat rate)" : `Shared tour (${wfGuests} × ₱200)`}
                  </span>
                  <span style={{ color: C.textB, fontSize: 11 }}>{fmt(wfTourBase)}</span>
                </div>
                {wfExclusiveDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>Exclusive discount</span>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>-{fmt(wfExclusiveDiscount)}</span>
                  </div>
                )}
                {wfOvertimeFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.textS, fontSize: 11 }}>Overtime</span>
                    <span style={{ color: C.textB, fontSize: 11 }}>{fmt(wfOvertimeFee)}</span>
                  </div>
                )}
                {wfRoomsFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.textS, fontSize: 11 }}>Room(s){isWfPackage ? " (bundled)" : ""}</span>
                    <span style={{ color: C.textB, fontSize: 11 }}>{fmt(wfRoomsFee)}</span>
                  </div>
                )}
                {wfRoomBundleDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>Room bundle discount (-{Math.round(ROOM_BUNDLE_DISCOUNT_PCT * 100)}%)</span>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>-{fmt(wfRoomBundleDiscount)}</span>
                  </div>
                )}
                {wfFoodTotal > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.textS, fontSize: 11 }}>Food & Drinks</span>
                    <span style={{ color: C.textB, fontSize: 11 }}>{fmt(wfFoodTotal)}</span>
                  </div>
                )}
                {wfComboDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>Combo meal discount (-{Math.round(COMBO_DISCOUNT_PCT * 100)}%)</span>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>-{fmt(wfComboDiscount)}</span>
                  </div>
                )}
                {wfPackageFoodDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>Package food discount (-{Math.round((wfSelectedPackage?.foodDiscountPct ?? 0) * 100)}%)</span>
                    <span style={{ color: "#4caf50", fontSize: 11 }}>-{fmt(wfPackageFoodDiscount)}</span>
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 12 }}>Total</span>
                  <span style={{ color: gold, fontWeight: 700, fontSize: 12 }}>{fmt(wfTotal)}</span>
                </div>
              </div>
              {wf.date && !wfDateCapacity.ok && (
                <div style={{ gridColumn: "1/-1" }}>
                  <p style={{ color: "#e55", fontSize: 12, margin: 0 }}>⚠ {wfDateCapacity.reason}</p>
                </div>
              )}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>FOOD & DRINKS (OPTIONAL)</label>
                {menuItems.length === 0 && (
                  <p style={{ color: C.textS, fontSize: 12, margin: 0 }}>No menu items yet — add some in the Menu tab.</p>
                )}
                {/* Every item shows here, not just sellable ones, so staff can spot and
                    fix a stuck "sold out" item without leaving this form. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                  {menuItems.map((m) => {
                    const qty = wfFoodQty[m.id] || 0;
                    const sellable = isMenuItemSellable(m, inventory);
                    const outOfStock = m.available && !sellable;
                    return (
                      <div key={m.id} style={{ opacity: sellable ? 1 : 0.55, background: qty > 0 ? `${gold}14` : "transparent", border: `1px solid ${qty > 0 ? gold + "55" : cBr}`, borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.textH, fontSize: 12, fontWeight: 600 }}>{m.name}</div>
                          <div style={{ color: C.textS, fontSize: 10 }}>
                            {fmt(m.price)} · <span style={{ opacity: 0.75 }}>{m.category}</span>
                            {!m.available && <span style={{ color: "#e55", marginLeft: 6 }}>MARKED OUT</span>}
                            {outOfStock && <span style={{ color: "#f5c518", marginLeft: 6 }}>NO STOCK</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => setMenuItems((p) => p.map((x) => x.id === m.id ? { ...x, available: !x.available } : x))}
                            title={m.available ? "Mark this item out" : "Mark this item available"}
                            style={{ padding: "3px 8px", fontSize: 9, letterSpacing: 0.5, borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${cBr}`, color: C.textS }}
                          >
                            {m.available ? "MARK OUT" : "MARK IN"}
                          </button>
                          <button onClick={() => setWfFoodItemQty(m.id, qty - 1)} disabled={qty <= 0} aria-label={`Fewer ${m.name}`} style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", fontSize: 13 }}>−</button>
                          <span style={{ color: C.textH, fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{qty}</span>
                          <button onClick={() => setWfFoodItemQty(m.id, qty + 1)} disabled={!sellable} aria-label={`More ${m.name}`} style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: sellable ? "pointer" : "not-allowed", fontSize: 13 }}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {wfFoodTotal > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "8px 10px", background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${cBr}`, borderRadius: 6 }}>
                    <span style={{ color: C.textS, fontSize: 11 }}>Food & Drinks Subtotal</span>
                    <span style={{ color: gold, fontWeight: 700, fontSize: 12 }}>{fmt(wfFoodTotal)}</span>
                  </div>
                )}
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: gold, fontSize: 10, letterSpacing: 2, display: "block", marginBottom: 6 }}>NOTES (OPTIONAL)</label>
                <textarea value={wf.notes} onChange={(e) => setWfField("notes", e.target.value)} rows={2} placeholder="Special requests, etc." className="sw-input" style={{ ...C.inp, borderRadius: 6, resize: "none" }} />
              </div>
            </div>

            <div
              onClick={() => setWfField("paymentCollected", !wf.paymentCollected)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, background: wf.paymentCollected ? "rgba(76,175,80,0.06)" : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", border: `1.5px solid ${wf.paymentCollected ? "rgba(76,175,80,0.5)" : cBr}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16, cursor: "pointer", userSelect: "none" }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${wf.paymentCollected ? "#4caf50" : isDark ? "#444" : "#bbb"}`, background: wf.paymentCollected ? "#4caf50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {wf.paymentCollected && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>
                <strong style={{ color: C.textH }}>Payment collected</strong> — {wf.paymentCollected ? `full amount (${fmt(wfTotal)}) received now, save as Confirmed.` : `not yet collected, save as Paid (pending) until the guest pays.`}
              </span>
            </div>

            <div style={{ background: isDark ? "#0a0806" : "#f5f0e8", border: `1px solid ${cBr}`, borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textS, fontSize: 12 }}>{wfPackageLabel} Total{wfFoodTotal > 0 ? " + Food" : ""}</span>
                <span style={{ color: gold, fontWeight: 700, fontSize: 13 }}>{fmt(wfTotal)}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowNewWalkIn(false)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}>CANCEL</button>
              <button disabled={!wfValid} onClick={saveWalkIn} style={{ ...goldBtn, flex: 2, borderRadius: 6, opacity: wfValid ? 1 : 0.4 }}>SAVE RESERVATION</button>
            </div>
          </div>
        </div>
      )}

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
              {wiConfirmAction.action === "Confirmed" ? "✓" : wiConfirmAction.action === "Completed" ? "🏁" : "✕"}
            </div>

            <h3 id="onsite-confirm-title" style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              {wiConfirmAction.action === "Confirmed" ? "Accept this on-site reservation?"
                : wiConfirmAction.action === "Completed" ? "Mark visit as completed?"
                : "Cancel this reservation?"}
            </h3>

            <p style={{ color: C.textS, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
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
                <span style={{ flexShrink: 0 }}>💵</span>
                <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>
                  Only confirm if payment (50% down or full amount) has been <strong style={{ color: "#4caf50" }}>physically collected</strong> at the resort.
                </span>
              </div>
            )}

            {/* Warning for cancel */}
            {wiConfirmAction.action === "Cancelled" && (
              <div style={{ background: "rgba(229,85,85,0.04)", border: "1px solid rgba(229,85,85,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8 }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <span style={{ color: C.textS, fontSize: 12, lineHeight: 1.6 }}>The guest will be notified that their reservation has been cancelled.</span>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${cBr}`, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setWiConfirmAction(null)}
                style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "11px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, letterSpacing: 1 }}
              >GO BACK</button>
              <button
                onClick={executeWiAction}
                style={{
                  flex: 2, padding: "11px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 6, letterSpacing: 2,
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
            <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, fontWeight: 400, marginBottom: 10 }}>Archive reservation {wiConfirmArchive.id}?</h3>
            <p style={{ color: C.textS, fontSize: 13, marginBottom: 20 }}>
              It'll move out of Walk-In Management into the Bookings tab's Archived view, filed under <strong style={{ color: wiConfirmArchive.status === "Completed" ? "#4a9fd4" : "#e55" }}>{wiConfirmArchive.status}</strong>. You can restore it any time from there.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setWiConfirmArchive(null)} style={{ flex: 1, background: "transparent", color: C.textS, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6 }}>CANCEL</button>
              <button onClick={() => archiveWiBooking(wiConfirmArchive)} style={{ flex: 1, background: "rgba(150,150,150,0.1)", color: C.textH, border: `1px solid ${cBr}`, padding: "10px 16px", fontSize: 11, cursor: "pointer", borderRadius: 6, fontWeight: 700 }}>ARCHIVE</button>
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
  { label: "MANAGEMENT",   tabs: ["Rooms", "Packages", "Menu", "Facilities", "Gallery", "Inventory"] },
  { label: "INSIGHTS",     tabs: ["Analytics", "Reports"] },
  { label: "SUPPORT",      tabs: ["Customer Service"] },
];

// ── Admin Component ───────────────────────────────────────────────────────────
export function Admin({
  bookings, setBookings, rooms, setRooms,
  galleryImgs, setGalleryImgs, closedDates, setClosedDates,
  onLogout, customerMessages, setCustomerMessages,
  menuItems, setMenuItems, facilities, setFacilities,
  inventory, setInventory, packages, setPackages,
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
  const [calMonth, setCalMonth] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(true);
  const [archivedMessages, setArchivedMessages] = useState<CustomerMessage[]>([]);
  const [csView, setCsView] = useState<"inbox" | "archive">("inbox");
  const [confirmArchiveMsg, setConfirmArchiveMsg] = useState<CustomerMessage | null>(null);
  useEffect(() => {
  const loadMessages = async () => {
    try {
      const res = await fetch("/api/customer-service");

      const data = await res.json();

      setCustomerMessages(data);
    } catch (err) {
      console.error(err);
    }
    };  

      loadMessages();

      const interval = setInterval(loadMessages, 2000);

      return () => clearInterval(interval);

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

  const tabs: AdminTab[] = ["Dashboard", "Bookings", "Walk-In", "Occupancy", "Rooms", "Packages", "Menu", "Facilities", "Gallery", "Inventory", "Analytics", "Reports", "Customer Service"];
  const tabIcons: Record<AdminTab, string> = { Dashboard: "⊞", Bookings: "📋", "Walk-In": "🏡", Occupancy: "📅", Rooms: "🛏", Packages: "🎁", Menu: "🍽", Facilities: "🧰", Gallery: "🖼", Inventory: "📦", Analytics: "📈", Reports: "📊", "Customer Service": "💬" };

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
      if (data.success) toast(`✉️ Confirmation email sent to ${booking.email}`, "success");
      else toast(`⚠️ Booking confirmed but email failed: ${data.error}`, "warning");
    } catch { toast("⚠️ Booking confirmed but email could not be sent.", "warning"); }
  }
  if (status === "Cancelled") {
    try {
      const res = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking, type: "rejected", reason: reason || "" }) });
      const data = await res.json();
      if (data.success) toast(`✉️ Rejection email sent to ${booking.email}`, "warning");
      else toast(`⚠️ Booking rejected but email failed: ${data.error}`, "warning");
    } catch { toast("⚠️ Booking rejected but email could not be sent.", "warning"); }
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
                    fontSize: 9,
                    letterSpacing: 3.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase" as const,
                    fontFamily: "'Inter', sans-serif",
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
                      <span style={{
                        fontSize: 14,
                        opacity: tab === t ? 1 : 0.5,
                        transition: "opacity .15s",
                      }}>
                        {tabIcons[t as AdminTab]}
                      </span>
                      <span style={{ flex: 1 }}>{t.toUpperCase()}</span>

                      {/* Bookings badge */}
                      {t === "Bookings" && Paid > 0 && (
                        <span style={{
                          background: gold, color: "#000",
                          fontSize: 9, fontWeight: 800,
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
                          fontSize: 9, fontWeight: 800,
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
                          fontSize: 9, fontWeight: 800,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {facilities.filter(f => f.status === "Needs Cleaning").length}
                        </span>
                      )}

                      {/* Customer Service badge */}
                      {t === "Customer Service" && customerMessages.length > 0 && (
                        <span style={{
                          background: "#4a9fd4", color: "#fff",
                          fontSize: 9, fontWeight: 800,
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
                {[["Paid", Paid, "#f5c518", "Pending review"], ["Confirmed", confirmed, "#4caf50", "Approved"], ["Completed", completed, "#4a9fd4", "Past stays"], ["Rooms", rooms.length, gold, "Active listings"]].map(([l, v, c, sub]) => (
                  <div key={l as string} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: mob ? "14px 12px" : "22px 20px", position: "relative", overflow: "hidden", boxShadow: C.shadowCard }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${c}22,${c})` }} />
                    <div style={{ color: isDark ? "#4a4035" : "#9a8878", fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>{(l as string).toUpperCase()}</div>
                    <div style={{ color: c as string, fontSize: mob ? 26 : 34, fontWeight: 700, fontFamily: "'Cormorant Garamond',Georgia,serif", lineHeight: 1, marginBottom: 6 }}>{v as number}</div>
                    {!mob && <div style={{ color: isDark ? "#3a3025" : "#b0a090", fontSize: 11 }}>{sub as string}</div>}
                  </div>
                ))}
              </div>

              {/* Currently ongoing bookings — today's confirmed guests, live */}
              {(() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                const liveBookings = bookings.filter((b) => b.date === todayStr && b.status === "Confirmed");
                const totalInResort = liveBookings.reduce((sum, b) => sum + b.guests, 0);
                return (
                  <div style={{ marginBottom: 36 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                      <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3, margin: 0 }}>CURRENTLY ONGOING BOOKINGS — TODAY (LIVE)</p>
                      <span style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", fontSize: 10, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(76,175,80,0.2)", letterSpacing: 1 }}>
                        👥 Total people in resort: {totalInResort}
                      </span>
                    </div>
                    <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 520 : 0 }}>
                          <thead><tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["Guest", "Package", "Guests Included", "Rooms", "Source"].map((h) => <th key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 9, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {liveBookings.map((b, idx) => (
                              <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                                <td style={{ padding: "12px 14px", color: C.textH, fontSize: 12, fontWeight: 600 }}>{b.name}</td>
                                <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11 }}>{b.package}</td>
                                <td style={{ padding: "12px 14px", color: gold, fontSize: 12, fontWeight: 700 }}>👥 {b.guests}</td>
                                <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11 }}>{b.rooms.length > 0 ? b.rooms.map((rid) => rooms.find((r) => r.id === rid)?.name ?? `#${rid}`).join(", ") : "—"}</td>
                                <td style={{ padding: "12px 14px" }}><span style={{ background: b.source === "Walk-In" ? "rgba(74,159,212,0.08)" : "rgba(201,168,76,0.1)", color: b.source === "Walk-In" ? "#4a9fd4" : gold, fontSize: 9, padding: "3px 10px", borderRadius: 20, letterSpacing: 1 }}>{b.source ?? "Online"}</span></td>
                              </tr>
                            ))}
                            {liveBookings.length === 0 && <tr><td colSpan={5} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 13 }}>No confirmed guests checked in for today yet.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Pending approvals */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <p style={{ color: C.textXS, fontSize: 10, letterSpacing: 3 }}>PENDING APPROVALS</p>
                {Paid > 0 && <span style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 10, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.15)" }}>{Paid} awaiting</span>}
              </div>
              <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 560 : 0 }}>
                    <thead><tr style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["ID", "Guest", "Email", "Phone", "Date", "Total", "Status", "Actions"].map((h) => <th key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 9, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {bookings.filter((b) => b.status === "Paid").map((b, idx) => (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                          <td style={{ padding: "12px 14px", color: gold, fontSize: 11, whiteSpace: "nowrap", fontFamily: "monospace" }}>{b.id}</td>
                          <td style={{ padding: "12px 14px", color: C.textH, fontSize: 12 }}>{b.name}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11 }}>{b.email || "—"}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.contact || "—"}</td>
                          <td style={{ padding: "12px 14px", color: C.textS, fontSize: 11, whiteSpace: "nowrap" }}>{b.date}</td>
                          <td style={{ padding: "12px 14px", color: C.textH, fontSize: 12, whiteSpace: "nowrap", fontWeight: 600 }}>{fmt(b.total)}</td>
                          <td style={{ padding: "12px 14px" }}><span style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 9, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.2)", letterSpacing: 1 }}>Paid</span></td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Confirmed", guestName: b.name })} style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.2)", padding: "5px 12px", fontSize: 10, cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap", letterSpacing: 1 }}>ACCEPT</button>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Cancelled", guestName: b.name })} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>REJECT</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {Paid === 0 && <tr><td colSpan={8} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 13 }}>No pending bookings.</td></tr>}
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
                menuItems={menuItems}
                setMenuItems={setMenuItems}
                inventory={inventory}
                setInventory={setInventory}
                packages={packages}
                facilities={facilities}
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
                      fontSize: mob ? 11 : 13, 
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
                      {status && <div style={{ fontSize: 8, marginTop: 3, opacity: 0.8 }}>{status === "Closed" ? "CLOSED" : status === "Paid" ? "PAID" : status?.toUpperCase().slice(0, 4)}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[["Booked/Confirmed", "#4caf50"], ["Paid", "#f5c518"], ["Completed", "#4a9fd4"], ["Closed", "#e07070"], ["Click to close/open", gold]].map(([l, c]) => (
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

          {/* PACKAGES */}
          {tab === "Packages" && <PackagesTab packages={packages} setPackages={setPackages} mob={mob} />}

          {/* MENU */}
          {tab === "Menu" && <MenuTab menuItems={menuItems} setMenuItems={setMenuItems} inventory={inventory} mob={mob} />}

          {/* FACILITIES */}
          {tab === "Facilities" && <FacilitiesTab facilities={facilities} setFacilities={setFacilities} bookings={bookings} mob={mob} />}

          {/* INVENTORY */}
          {tab === "Inventory" && <InventoryTab inventory={inventory} setInventory={setInventory} />}

          {/* ANALYTICS */}
          {tab === "Analytics" && <AnalyticsTab bookings={bookings} />}

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
                  ["Active Bookings",bookings.filter(b=>["Paid","Confirmed"].includes(b.status)).length,"📋","#4a9fd4"],
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
                  {[["Paid","#f5c518"],["Confirmed","#4caf50"],["Completed","#4a9fd4"],["Cancelled","#e55"]].map(([s,c])=>{
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
                        const header=["Booking ID","Guest Name","Contact","Email","Date","Package","Guests","Overtime (hrs)","Rooms","Total (₱)","Downpayment (₱)","Status","Notes"];
                        const rows=mBookings.map(b=>[b.id,b.name,b.contact||"",b.email||"",b.date,b.package,b.guests,b.overtime||0,(b.rooms||[]).map(rid=>rooms.find(r=>r.id===rid)?.name||"").filter(Boolean).join(" | ")||"None",b.total,b.downpayment,b.status,b.notes||""]);
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
                        fontSize: 13,
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
                          fontSize: 11,
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
                      fontSize: 11,
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
                  <div
                    style={{
                      fontSize: 36,
                      marginBottom: 12,
                    }}
                  >
                    💬
                  </div>

                  <p
                    style={{
                      color: C.textS,
                      fontSize: 14,
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
                              fontSize: 14,
                              fontWeight: 600,
                            }}
                          >
                            {msg.name}
                          </div>

                          <div
                            style={{
                              color: C.textXS,
                              fontSize: 11,
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
                              fontSize: 9,
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
                              fontSize: 10,
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
                                fontSize: 10,
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
                          fontSize: 13,
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
                            "'Cormorant Garamond', Georgia, serif",
                        }}
                      >
                        Send Response
                      </h3>

                      <p
                        style={{
                          color: C.textS,
                          fontSize: 12,
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
                            fontSize: 11,
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
                          fontSize: 10,
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
                          fontSize: 13,
                          outline: "none",
                        }}
                      />
                    </div>

                    {/* MESSAGE */}
                    <div style={{ marginBottom: 20 }}>
                      <div
                        style={{
                          color: C.textXS,
                          fontSize: 10,
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
                          fontSize: 13,
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
                          fontSize: 11,
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
                  ? "The guest will receive a confirmation email and their booking status will be updated to 'Confirmed'."
                  : "The guest will receive a cancellation email and their booking status will be updated to 'Cancelled'."
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
