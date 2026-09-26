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
import { SalesTab } from "@/components/admin/SalesTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { useOps } from "@/contexts/OpsContext";
import { collectedBetween, manilaDate } from "@/lib/finance";
import { FacilitiesTab } from "@/components/admin/FacilitiesTab";
import { PackagesTab } from "@/components/admin/PackagesTab";
import { MaintenanceTab } from "@/components/admin/MaintenanceTab";
import {
  AlertDialog,
  AlertDialogAction,
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


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

const SIDEBAR_GROUPS = [
  { label: "OVERVIEW",     tabs: ["Dashboard"] },
  { label: "RESERVATIONS", tabs: ["Bookings", "Occupancy"] },
  { label: "OPERATIONS",   tabs: ["Facilities", "Inventory"] },
  { label: "FINANCE",      tabs: ["Sales", "Reports"] },
  { label: "MANAGEMENT",   tabs: ["Rooms", "Packages", "Gallery"] },
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
  const ops = useOps();
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

  const tabs: AdminTab[] = ["Dashboard", "Bookings", "Occupancy", "Facilities", "Inventory", "Sales", "Reports", "Rooms", "Packages", "Gallery", "Customer Service", "Maintenance"];
  // Icon per tab. Names resolve against the stroke set in ./Icon, so the
  // sidebar inherits the theme instead of rendering OS colour emoji.
  const tabIcons: Record<AdminTab, IconName> = {
    Dashboard: "grid", Bookings: "clipboard", Sales: "wallet",
    Occupancy: "calendar", Rooms: "bed", Packages: "gift",
    Facilities: "toolbox", Gallery: "image", Inventory: "package",
    Reports: "bar-chart", "Customer Service": "message",
    Maintenance: "toolbox",
  };

  // Completing a stay now goes through the check-out window (Facilities /
  // Bookings → Check out), which inspects the facilities, records damage and
  // payment, and flags what needs cleaning.
  const updateStatus = async (id: string, status: string, reason?: string) => {
  setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status: status as Booking["status"] } : b));
  const booking = bookings.find((b) => b.id === id);
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

  const pendingCount = bookings.filter((b) => b.status === "Pending" && !b.archived).length;
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

  // The inbox and the archive share one layout and differ only in which
  // list feeds them, so the markup lives here once and both tab panels
  // render it.
  const messagesPanel = (
    <>
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
    </>
  );
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
                      {t === "Bookings" && pendingCount > 0 && (
                        <Badge variant="outline" style={{
                          background: gold, color: "#000",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {pendingCount}
                        </Badge>
                      )}

                      {/* Facilities badge */}
                      {t === "Facilities" && facilities.filter(f => f.status === "Needs Cleaning").length > 0 && (
                        <Badge variant="outline" style={{
                          background: "#e0a020", color: "#000",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {facilities.filter(f => f.status === "Needs Cleaning").length}
                        </Badge>
                      )}

                      {/* Customer Service badge */}
                      {t === "Customer Service" && customerMessages.length > 0 && (
                        <Badge variant="outline" style={{
                          background: "#4a9fd4", color: "#fff",
                          fontSize: 10.5, fontWeight: 700,
                          borderRadius: 20, padding: "2px 7px", letterSpacing: 0,
                        }}>
                          {customerMessages.length}
                        </Badge>
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
                {[["Pending", pendingCount, "#f5c518", "Waiting for approval"], ["Confirmed", confirmed, "#4caf50", "Approved"], ["Completed", completed, "#4a9fd4", "Past stays"], ["Collected today", fmt(collectedBetween(ops.payments, manilaDate(now))), gold, "From the payment records"]].map(([l, v, c, sub]) => (
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
                const awaitingToday = liveToday.filter((b) => b.status === "Pending");
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
                    return `${awaitingToday.length} booking${awaitingToday.length === 1 ? " is" : "s are"} booked for today but still Pending — approve ${awaitingToday.length === 1 ? "it" : "them"} below and ${awaitingToday.length === 1 ? "it" : "they"} will appear here.`;
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
                        <Table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 520 : 0 }}>
                          <TableHeader><TableRow style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["Guest", "Package", "Guests Included", "Rooms", "Source"].map((h) => <TableHead key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</TableHead>)}</TableRow></TableHeader>
                          <TableBody>
                            {liveBookings.map((b, idx) => (
                              <TableRow key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                                <TableCell style={{ padding: "12px 14px", color: C.textH, fontSize: 13.5, fontWeight: 600 }}>{b.name}</TableCell>
                                <TableCell style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5 }}>{b.package}</TableCell>
                                <TableCell style={{ padding: "12px 14px", color: gold, fontSize: 13.5, fontWeight: 700 }}><Icon name="users" size={12} style={{ marginRight: 5 }} />{b.guests}</TableCell>
                                <TableCell style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5 }}>{b.rooms.length > 0 ? b.rooms.map((rid) => rooms.find((r) => r.id === rid)?.name ?? `#${rid}`).join(", ") : "—"}</TableCell>
                                <TableCell style={{ padding: "12px 14px" }}><Badge variant="outline" style={{ background: b.source === "Walk-In" ? "rgba(74,159,212,0.08)" : "rgba(201,168,76,0.1)", color: b.source === "Walk-In" ? "#4a9fd4" : gold, fontSize: 10.5, padding: "3px 10px", borderRadius: 20, letterSpacing: 1 }}>{b.source ?? "Online"}</Badge></TableCell>
                              </TableRow>
                            ))}
                            {liveBookings.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} style={{ padding: "30px 20px", textAlign: "center" }}>
                                  <div style={{ color: C.textS, fontSize: 14.5, marginBottom: 6 }}>
                                    No one is in the resort right now.
                                  </div>
                                  <div style={{ color: C.textXS, fontSize: 12.5, lineHeight: 1.6 }}>
                                    {emptyReason}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Pending approvals */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3 }}>PENDING APPROVALS</p>
                {pendingCount > 0 && <Badge variant="outline" style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 11.5, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.15)" }}>{pendingCount} awaiting</Badge>}
              </div>
              <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <Table style={{ width: "100%", borderCollapse: "collapse", minWidth: mob ? 560 : 0 }}>
                    <TableHeader><TableRow style={{ background: isDark ? "#070604" : "#f5f0e8", borderBottom: `1px solid ${cBr}` }}>{["ID", "Guest", "Email", "Phone", "Date", "Total", "Status", "Actions"].map((h) => <TableHead key={h} style={{ padding: "12px 14px", color: C.textXS, fontSize: 10.5, letterSpacing: 2, textAlign: "left", whiteSpace: "nowrap" }}>{h}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>
                      {bookings.filter((b) => b.status === "Pending" && !b.archived).map((b, idx) => (
                        <TableRow key={b.id} style={{ borderBottom: `1px solid ${cBr}`, background: isDark ? (idx % 2 === 0 ? "#0a0906" : "#080604") : (idx % 2 === 0 ? "#ffffff" : "#faf7f2") }}>
                          <TableCell style={{ padding: "12px 14px", color: gold, fontSize: 12.5, whiteSpace: "nowrap", fontFamily: "monospace" }}>{b.id}</TableCell>
                          <TableCell style={{ padding: "12px 14px", color: C.textH, fontSize: 13.5 }}>{b.name}</TableCell>
                          <TableCell style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5 }}>{b.email || "—"}</TableCell>
                          <TableCell style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.contact || "—"}</TableCell>
                          <TableCell style={{ padding: "12px 14px", color: C.textS, fontSize: 12.5, whiteSpace: "nowrap" }}>{b.date}</TableCell>
                          <TableCell style={{ padding: "12px 14px", color: C.textH, fontSize: 13.5, whiteSpace: "nowrap", fontWeight: 600 }}>{fmt(b.total)}</TableCell>
                          <TableCell style={{ padding: "12px 14px" }}><Badge variant="outline" style={{ background: "rgba(245,197,24,0.08)", color: "#f5c518", fontSize: 10.5, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,197,24,0.2)", letterSpacing: 1 }}>Pending</Badge></TableCell>
                          <TableCell style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Confirmed", guestName: b.name })} style={{ background: "rgba(76,175,80,0.08)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.2)", padding: "5px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap", letterSpacing: 1 }}>ACCEPT</button>
                              <button onClick={() => setDashConfirm({ bookingId: b.id, action: "Cancelled", guestName: b.name })} style={{ background: "rgba(229,85,85,0.06)", color: "#e55", border: "1px solid rgba(229,85,85,0.2)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>REJECT</button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {pendingCount === 0 && <TableRow><TableCell colSpan={8} style={{ padding: "32px 20px", textAlign: "center", color: C.textXS, fontSize: 14.5 }}>No pending bookings.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
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

          {/* BOOKINGS (online and walk-in) */}
          {tab === "Bookings" && (
            <BookingsTab bookings={bookings} setBookings={setBookings} updateStatus={updateStatus} mob={mob} rooms={rooms} packages={packages} facilities={facilities} />
          )}

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
                  else if (status === "Confirmed" || status === "Pending") { bg = isDark ? "#0f2018" : "#eafaf0"; col = "#4caf50"; border = "1px solid rgba(76,175,80,0.3)"; }
                  else if (status === "Completed") { bg = isDark ? "#0f1a2a" : "#e8f4fb"; col = "#4a9fd4"; border = "1px solid rgba(74,159,212,0.3)"; }
                  return (
                    <div key={d} onClick={() => !isPast && !["Confirmed", "Pending", "Completed"].includes(status || "") && toggleClosed(ds)
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
                          : ["Confirmed", "Pending", "Completed"].includes(status || "")
                          ? "default"
                          : "pointer",
                      userSelect: "none", 
                      transition: "all .15s", 
                      position: "relative" }}>
                      {d}
                      {status && <div style={{ fontSize: 9.5, marginTop: 3, opacity: 0.8 }}>{status === "Closed" ? "CLOSED" : status === "Pending" ? "PEND" : status?.toUpperCase().slice(0, 4)}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[["Booked/Confirmed", "#4caf50"], ["Pending", "#f5c518"], ["Completed", "#4a9fd4"], ["Closed", "#e07070"], ["Click to close/open", gold]].map(([l, c]) => (
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

          {/* SALES */}
          {tab === "Sales" && <SalesTab bookings={bookings} mob={mob} />}

          {/* REPORTS */}
          {tab === "Reports" && <ReportsTab bookings={bookings} rooms={rooms} mob={mob} />}

          {/* CUSTOMER SERVICE */}
          {tab === "Customer Service" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>MESSAGES</p>
                <h2 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Customer Service</h2>
              </div>

              {/* ARCHIVE CONFIRM MODAL */}
              <AlertDialog open={!!confirmArchiveMsg} onOpenChange={(open) => { if (!open) setConfirmArchiveMsg(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle
                      style={{
                        color: C.textH,
                        fontFamily: "'Cormorant Garamond',Georgia,serif",
                        fontSize: 18,
                        fontWeight: 400,
                      }}
                    >
                      Archive this message?
                    </AlertDialogTitle>
                    <AlertDialogDescription
                      style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}
                    >
                      From{" "}
                      <strong style={{ color: C.textH }}>
                        {confirmArchiveMsg?.name}
                      </strong>
                      : &quot;
                      {confirmArchiveMsg?.message.slice(0, 80)}
                      {(confirmArchiveMsg?.message.length ?? 0) > 80 ? "\u2026" : ""}
                      &quot;
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      style={{ color: C.textS, borderColor: cBr, padding: 11, height: "auto", fontSize: 12.5, borderRadius: 6 }}
                    >
                      CANCEL
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (!confirmArchiveMsg) return;
                        setArchivedMessages((prev) => [...prev, confirmArchiveMsg]);
                        setCustomerMessages((prev) =>
                          prev.filter((m) => m.id !== confirmArchiveMsg.id)
                        );
                        setConfirmArchiveMsg(null);
                        toast("Message archived.", "info");
                      }}
                      style={{ ...goldBtn, height: "auto" }}
                    >
                      ARCHIVE
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>


              {/* INBOX / ARCHIVE — a real Tabs. The panel below is one layout
                  fed by two lists, so it is rendered from a single variable
                  into both TabsContent rather than duplicated: the markup
                  stays in one place and each list still gets its own
                  announced tabpanel. */}
              <Tabs value={csView} onValueChange={(v) => setCsView(v as "inbox" | "archive")}>
                <TabsList className="mb-5 h-auto gap-2 bg-transparent p-0">
                  {(["inbox", "archive"] as const).map((v) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="rounded-full border data-[state=active]:shadow-none"
                      style={{
                        padding: "8px 18px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: csView === v ? `${gold}18` : "transparent",
                        color: csView === v ? gold : C.textS,
                        borderColor: csView === v ? `${gold}55` : cBr,
                      }}
                    >
                      {v === "inbox"
                        ? `INBOX (${customerMessages.length})`
                        : `ARCHIVE (${archivedMessages.length})`}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="inbox">{messagesPanel}</TabsContent>
                <TabsContent value="archive">{messagesPanel}</TabsContent>
              </Tabs>
              {/* REPLY MODAL */}
              <Dialog open={!!replyModal} onOpenChange={(open) => { if (!open) setReplyModal(null); }}>
                <DialogContent
                  className="max-h-[90vh] overflow-y-auto sm:max-w-[min(34rem,calc(100%-2rem))]"
                  style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 14, boxShadow: C.shadowCard }}
                >
                  {replyModal && (
                    <>
                      <DialogHeader>
                        <DialogTitle
                          style={{
                            margin: 0,
                            color: C.textH,
                            fontSize: 22,
                            fontWeight: 500,
                            fontFamily: "'Cormorant Garamond',Georgia,serif",
                          }}
                        >
                          Send Response
                        </DialogTitle>
                        <DialogDescription style={{ color: C.textS, fontSize: 13.5 }}>
                          Replying to {replyModal.name}
                        </DialogDescription>
                      </DialogHeader>

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
                        <Label
                          htmlFor="reply-email"
                          style={{
                            display: "block",
                            color: C.textXS,
                            fontSize: 11.5,
                            marginBottom: 6,
                            letterSpacing: 2,
                          }}
                        >
                          CUSTOMER EMAIL
                        </Label>

                        <Input
                          id="reply-email"
                          value={replyModal.email}
                          disabled
                          style={{
                            padding: "12px 14px",
                            height: "auto",
                            borderRadius: 8,
                            border: `1px solid ${cBr}`,
                            background: "transparent",
                            color: C.textS,
                            fontSize: 14.5,
                          }}
                        />
                      </div>

                      {/* MESSAGE */}
                      <div style={{ marginBottom: 20 }}>
                        <Label
                          htmlFor="reply-message"
                          style={{
                            display: "block",
                            color: C.textXS,
                            fontSize: 11.5,
                            marginBottom: 6,
                            letterSpacing: 2,
                          }}
                        >
                          MESSAGE
                        </Label>

                        <Textarea
                          id="reply-message"
                          value={replyMessage}
                          onChange={(e) =>
                            setReplyMessage(e.target.value)
                          }
                          rows={6}
                          style={{
                            resize: "none",
                            height: "auto",
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
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setReplyModal(null)}
                          style={{ borderColor: cBr, color: C.textS, padding: "10px 16px", height: "auto", borderRadius: 6, fontSize: 12.5 }}
                        >
                          CANCEL
                        </Button>
                        <Button
                          onClick={() => {
                            window.location.href = `mailto:${replyModal.email}?subject=Customer Service Response&body=${encodeURIComponent(
                              replyMessage
                            )}`;
                            setReplyModal(null);
                          }}
                          style={{ ...goldBtn, padding: "10px 18px", height: "auto" }}
                        >
                          SEND EMAIL
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      {/* ── Dashboard Accept / Reject Confirm Modal (#3) ── */}
      <AlertDialog open={!!dashConfirm} onOpenChange={(open) => { if (!open) setDashConfirm(null); }}>
        <AlertDialogContent className="sm:max-w-[min(30rem,calc(100%-2rem))]">
          {dashConfirm && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.1)" : "rgba(229,85,85,0.1)", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}`, color: dashConfirm.action === "Confirmed" ? "#4caf50" : "#e55" }}>
                <Icon name={dashConfirm.action === "Confirmed" ? "check" : "x"} size={20} />
              </div>

              <AlertDialogHeader>
                <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400 }}>
                  {dashConfirm.action === "Confirmed" ? "Accept this booking?" : "Reject this booking?"}
                </AlertDialogTitle>
                <AlertDialogDescription style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
                  {dashConfirm.action === "Confirmed"
                    ? <>You are about to <strong style={{ color: "#4caf50" }}>accept</strong> the booking for <strong style={{ color: C.textH }}>{dashConfirm.guestName}</strong>.</>
                    : <>You are about to <strong style={{ color: "#e55" }}>reject</strong> the booking for <strong style={{ color: C.textH }}>{dashConfirm.guestName}</strong>.</>
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* Warning callout */}
              <div style={{ background: dashConfirm.action === "Confirmed" ? (isDark ? "rgba(76,175,80,0.06)" : "rgba(76,175,80,0.05)") : (isDark ? "rgba(229,85,85,0.06)" : "rgba(229,85,85,0.05)"), border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.2)" : "rgba(229,85,85,0.2)"}`, borderRadius: 8, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", color: dashConfirm.action === "Confirmed" ? "#4caf50" : "#e55" }}>
                <Icon name={dashConfirm.action === "Confirmed" ? "check-circle" : "alert"} size={15} />
                <span style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>
                  {dashConfirm.action === "Confirmed"
                    ? "The guest will receive a confirmation email and their booking status will be updated to 'Confirmed'."
                    : "The guest will receive a cancellation email and their booking status will be updated to 'Cancelled'."
                  }
                </span>
              </div>

              <Separator />
              <AlertDialogFooter>
                <AlertDialogCancel style={{ color: C.textS, borderColor: cBr, padding: "12px 16px", height: "auto", fontSize: 12.5, borderRadius: 8 }}>
                  GO BACK
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    updateStatus(dashConfirm.bookingId, dashConfirm.action);
                    if (dashConfirm.action === "Confirmed") toast(`Booking accepted for ${dashConfirm.guestName}.`, "success");
                    else toast(`Booking rejected for ${dashConfirm.guestName}.`, "warning");
                    setDashConfirm(null);
                  }}
                  style={{ padding: "12px 16px", height: "auto", fontSize: 12.5, fontWeight: 700, borderRadius: 8, letterSpacing: 2, background: dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.12)" : "rgba(229,85,85,0.10)", color: dashConfirm.action === "Confirmed" ? "#4caf50" : "#e55", border: `1px solid ${dashConfirm.action === "Confirmed" ? "rgba(76,175,80,0.3)" : "rgba(229,85,85,0.3)"}` }}
                >
                  {dashConfirm.action === "Confirmed" ? "YES, ACCEPT" : "YES, REJECT"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout Confirm */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={(open) => { if (!open) setShowLogoutConfirm(false); }}>
        <AlertDialogContent>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#e55" }}><Icon name="lock" size={20} /></div>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 18, fontWeight: 400 }}>Sign out?</AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>You will be returned to the main site.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ color: C.textS, borderColor: cBr, padding: "11px 16px", height: "auto", fontSize: 12.5, borderRadius: 6, letterSpacing: 1 }}>CANCEL</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowLogoutConfirm(false); onLogout(); toast("Signed out.", "info"); }}
              style={{ background: isDark ? "rgba(255,255,255,0.04)" : "#f5f0e8", color: C.textH, border: `1px solid ${cBr}`, padding: "11px 16px", height: "auto", fontSize: 12.5, fontWeight: 700, borderRadius: 6, letterSpacing: 2 }}
            >
              YES, SIGN OUT
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Room Confirm */}
      <AlertDialog open={!!confirmRemoveRoom} onOpenChange={(open) => { if (!open) setConfirmRemoveRoom(null); }}>
        <AlertDialogContent>
          {confirmRemoveRoom && (
            <>
              {confirmRemoveRoom.img && <img loading="lazy" decoding="async" src={confirmRemoveRoom.img} alt={confirmRemoveRoom.name} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }} />}
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#e55" }}><Icon name="bed" size={22} /></div>
              <AlertDialogHeader>
                <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400 }}>Remove this room?</AlertDialogTitle>
                <AlertDialogDescription style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
                  <strong style={{ color: C.textH }}>{confirmRemoveRoom.name}</strong> will be permanently removed from the system.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p style={{ color: "rgba(229,85,85,0.75)", fontSize: 13.5, margin: 0 }}><Icon name="alert" size={12} style={{ marginRight: 5 }} />This action cannot be undone.</p>
              <Separator />
              <AlertDialogFooter>
                <AlertDialogCancel style={{ color: C.textS, borderColor: cBr, padding: "11px 16px", height: "auto", fontSize: 12.5, borderRadius: 6, letterSpacing: 1 }}>CANCEL</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { deleteRoom(confirmRemoveRoom.id); setConfirmRemoveRoom(null); }}
                  style={{ background: "rgba(229,85,85,0.10)", color: "#e55", border: "1px solid rgba(229,85,85,0.25)", padding: "11px 16px", height: "auto", fontSize: 12.5, fontWeight: 700, borderRadius: 6, letterSpacing: 2 }}
                >
                  YES, REMOVE
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Room — landscape: the image preview and its picker sit in
          their own column beside the fields, instead of pushing four inputs
          and a description below the fold of a 480px portrait card. */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) setShowModal(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[min(48rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 400 }}>
              {editRoom ? "Edit Room" : "Add New Room"}
            </DialogTitle>
            <DialogDescription>
              {editRoom ? "Update this room's photo, capacity and rate." : "Add a room guests can book alongside a tour."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* Image */}
            <div>
              <Label htmlFor="room-image-btn" style={{ display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 3, marginBottom: 8 }}>ROOM IMAGE</Label>
              {imgPrev && <img loading="lazy" decoding="async" src={imgPrev} alt="preview" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8, marginBottom: 10, border: `1px solid ${cBr}` }} />}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} />
              <Button id="room-image-btn" variant="outline" onClick={() => fileRef.current?.click()} style={{ ...outBtn, width: "100%", padding: 11, height: "auto", fontSize: 12.5, borderRadius: 6 }}>
                <Icon name="folder" size={13} style={{ marginRight: 6 }} />CHOOSE IMAGE
              </Button>
            </div>

            {/* Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              {[["Room Name", "name", "text"], ["Bed Configuration", "beds", "text"], ["Max Capacity", "capacity", "number"], ["Price per Slot (₱)", "price", "number"]].map(([l, k, t]) => (
                <div key={k}>
                  <Label htmlFor={`room-${k}`} style={{ display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 3, marginBottom: 6 }}>{(l as string).toUpperCase()}</Label>
                  <Input
                    id={`room-${k}`}
                    type={t as string}
                    value={rf[k as keyof typeof rf]}
                    onChange={(e) => setRf((f) => ({ ...f, [k]: e.target.value }))}
                    style={{ ...inpS, height: "auto" }}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="room-desc" style={{ display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 3, marginBottom: 6 }}>DESCRIPTION</Label>
                <Textarea
                  id="room-desc"
                  value={rf.desc}
                  onChange={(e) => setRf((f) => ({ ...f, desc: e.target.value }))}
                  rows={3}
                  style={{ ...inpS, resize: "vertical", height: "auto" }}
                />
              </div>
            </div>
          </div>

          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} style={{ color: C.textS, borderColor: cBr, padding: 12, height: "auto", fontSize: 12.5, borderRadius: 6, letterSpacing: 1 }}>CANCEL</Button>
            <Button onClick={saveRoom} style={{ ...goldBtn, borderRadius: 6, height: "auto" }}>SAVE ROOM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ThemeToggle />
    </div>
  );
}
