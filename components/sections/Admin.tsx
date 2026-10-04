"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { useToast } from "@/contexts/ToastContext";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { Icon, type IconName } from "@/components/common/Icon";
import { Panel, StatCard, BarChart, ProgressRow } from "@/components/admin/charts";
import { fmt, fmtDate, holdsDate } from "@/lib/utils";
import { GALLERY_SPANS, galleryHourLabel } from "@/lib/gallery";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BookingsTab } from "@/components/admin/BookingsTab";
import { InventoryTab } from "@/components/admin/InventoryTab";
import { SalesTab } from "@/components/admin/SalesTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { ActivityTab } from "@/components/admin/ActivityTab";
import { FacilitiesTab } from "@/components/admin/FacilitiesTab";
import { OperationsTab } from "@/components/admin/OperationsTab";
import { PackagesTab } from "@/components/admin/PackagesTab";
import { PhotoSet } from "@/components/admin/PhotoSet";
import { MaintenanceTab } from "@/components/admin/MaintenanceTab";
import { AccountModal } from "@/components/admin/AccountModal";
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
import { sanitizeName, sanitizeContact, isValidName, isValidPHNumber, isValidEmail, RESORT_MAX_CAPACITY, ROOM_BUNDLE_DISCOUNT_PCT, OVERTIME_MAX, OVERTIME_RATE, GALLERY_MAX } from "@/lib/validators";
import type { Booking, BookingResource, BookingSlot, BookingTier } from "@/types/booking";
import type { Room } from "@/types/room";
import type { AdminTab, CustomerMessage } from "@/types/admin";
import type { RejectionMoney } from "@/lib/emailTemplate";
import type { Facility } from "@/types/facility";
import type { InventoryItem } from "@/types/inventory";
import type { ResortPackage } from "@/types/package";
import { Badge } from "@/components/ui/badge";


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
  { label: "TODAY",        tabs: ["Operations"] },
  { label: "RESERVATIONS", tabs: ["Bookings", "Occupancy"] },
  { label: "FACILITIES",   tabs: ["Facilities", "Inventory"] },
  { label: "FINANCE",      tabs: ["Sales", "Reports", "Activity"] },
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
  const w = useWidth();
  const mob = w < 768;


  const [tab, setTab] = useState<AdminTab>("Operations");
  const [sideOpen, setSideOpen] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [rf, setRf] = useState({ name: "", beds: "", capacity: "", price: "", desc: "", img: "" });
  /* The room's photos, cover first. `rf.img` stays the cover so every card,
     list and booking summary that reads it keeps working. */
  const [rPhotos, setRPhotos] = useState<string[]>([]);
  const [confirmRemoveRoom, setConfirmRemoveRoom] = useState<Room | null>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(true);
  /* Inbox and archive are two views of ONE list, split on archivedAt.
     They used to be two arrays, and archiving moved a message between them
     in local state only: the collection's sync never saw an archivedAt
     change, so nothing was persisted and the next poll put the message back
     in the inbox while the archive kept its copy — the same message in both
     lists, which is where the duplicate React key came from. */
  const inboxMessages = customerMessages.filter((m) => !m.archivedAt);
  const archivedMessages = customerMessages.filter((m) => m.archivedAt);
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


    // Moves messages a month old or more into the archive when auto-archive
    // is switched on. The two updates are made side by side: calling one
    // setter from inside the other's updater runs during React's render and
    // is an error ("Cannot update a component while rendering a different
    // component").
    useEffect(() => {
      if (!autoArchiveEnabled) return;

      const now = new Date();
      const isOld = (msg: CustomerMessage) => {
        const msgDate = new Date(msg.createdAt || msg.date);
        const diffMonths =
          now.getMonth() - msgDate.getMonth() +
          12 * (now.getFullYear() - msgDate.getFullYear());
        return diffMonths >= 1;
      };

      // Only what is still in the inbox: the collection now carries archived
      // messages too, and re-stamping them would keep rewriting archivedAt.
      const toArchive = customerMessages.filter((m) => !m.archivedAt && isOld(m));
      if (toArchive.length === 0) return;
      const ids = new Set(toArchive.map((m) => m.id));
      const at = new Date().toISOString();
      setCustomerMessages((prev) => prev.map((m) => (ids.has(m.id) ? { ...m, archivedAt: at } : m)));
      // Runs when auto-archive is switched on, as before, not on every poll.
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


  const tabs: AdminTab[] = ["Operations", "Bookings", "Occupancy", "Facilities", "Inventory", "Sales", "Reports", "Activity", "Rooms", "Packages", "Gallery", "Customer Service", "Maintenance"];
  // Icon per tab. Names resolve against the stroke set in ./Icon, so the
  // sidebar inherits the theme instead of rendering OS colour emoji.
  /* What the sidebar prints. The key stays "Occupancy" because that string
     is the tab id every switch in this file routes on; only the label the
     staff read changes. */
  const tabLabels: Record<string, string> = { Occupancy: "Calendar", Operations: "Daily Operations" };

  const tabIcons: Record<AdminTab, IconName> = {
    Operations: "clipboard-check", Bookings: "clipboard", Sales: "wallet",
    Occupancy: "calendar", Rooms: "bed", Packages: "gift",
    Facilities: "toolbox", Gallery: "image", Inventory: "package",
    Reports: "bar-chart", "Customer Service": "message", Activity: "history",
    Maintenance: "toolbox",
  };

  // Completing a stay goes through Daily Operations: Check out (inspect,
  // record damage) and then Settle (final payment), never a bare status.
  // `silent` skips the guest email, e.g. for a no-show. `money` says what
  // happened to a payment when the resort turned the booking down
  // (refunded or kept), so the rejection email can tell the guest.
  const updateStatus = async (id: string, status: string, reason?: string, opts?: { silent?: boolean; money?: RejectionMoney }) => {
  setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status: status as Booking["status"] } : b));
  const booking = bookings.find((b) => b.id === id);
  if (!booking?.email || opts?.silent) return;
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
      const res = await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking, type: "rejected", reason: reason || "", money: opts?.money }) });
      const data = await res.json();
      if (data.success) toast(`Rejection email sent to ${booking.email}`, "warning");
      else toast(`Booking rejected but email failed: ${data.error}`, "warning");
    } catch { toast("Booking rejected but email could not be sent.", "warning"); }
  }
};

  const pendingCount = bookings.filter((b) => b.status === "Pending" && !b.archived).length;

  // Calendar
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
  /* Which date the pointer (or keyboard focus) is on, for the detail card.
     Hover alone would strand touch and keyboard users, so the same
     information is listed under the calendar as well. */
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  /* One place for the status colours the legend promises. */
  const statusTone = (st: string | null | undefined) =>
    st === "Confirmed" ? "#4caf50"
      : st === "Pending" ? "#f5c518"
      : st === "Completed" ? "#4a9fd4"
      : st === "Closed" ? "#e07070"
      : C.textS;

  /* A date can carry more than one booking -- a shared pool takes several
     groups -- but the cell can only colour itself once, so it shows the
     first. The card and the lists below show every one of them. */
  const bookingsOn = (ds: string) =>
    bookings.filter((b) => b.date === ds && holdsDate(b));

  /* The detail card the Calendar shows on hover/focus.

     `colIdx` is the weekday column. The card is 230px wide and the content
     pane clips horizontally, so on the Sun/Mon and Fri/Sat columns it anchors
     to that edge rather than centring and being cut off.

     `above` flips it over the cell for the lower rows. Hanging below the last
     week pushed the card past the bottom of the month panel, which grew the
     scrolling pane and shifted the layout under the pointer. */
  const dayCard = (ds: string, list: Booking[], colIdx: number, above: boolean) => (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        ...(above ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
        ...(colIdx <= 1 ? { left: 0 } : colIdx >= 5 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }),
        zIndex: 60,
        width: 230,
        textAlign: "left",
        background: isDark ? "#14120e" : "#fffdf9",
        border: `1px solid ${cBr}`,
        borderRadius: 10,
        boxShadow: isDark ? "0 18px 44px rgba(0,0,0,0.65)" : "0 18px 44px rgba(90,70,25,0.18)",
        padding: "12px 14px",
        // Never swallow a click meant for the date underneath.
        pointerEvents: "none",
      }}
    >
      <div style={{ color: C.textXS, fontSize: 11, letterSpacing: 1.4, marginBottom: 9 }}>
        {fmtDate(ds).toUpperCase()}
      </div>
      {list.map((bk, bi) => (
        <div key={bk.id} style={{ marginTop: bi ? 10 : 0, paddingTop: bi ? 10 : 0, borderTop: bi ? `1px solid ${cBr}` : "none" }}>
          <div style={{ color: C.textH, fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{bk.name}</div>
          <div style={{ color: C.textS, fontSize: 12, marginBottom: 6 }}>
            {bk.guests} guests{typeof bk.package === "string" && bk.package ? ` · ${bk.package}` : ""}
          </div>
          <span style={{ color: statusTone(bk.status), fontSize: 11, fontWeight: 700, letterSpacing: 0.6 }}>
            {bk.status.toUpperCase()}
          </span>
          <span style={{ color: C.textS, fontSize: 11.5, marginLeft: 8 }}>{bk.id}</span>
        </div>
      ))}
    </div>
  );

  const getDateStatus = (d: number) => {
    const ds = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (closedDates.includes(ds)) return "Closed";
    return bookings.find((x) => x.date === ds)?.status || null;
  };
  const toggleClosed = (ds: string) => { setClosedDates((p) => p.includes(ds) ? p.filter((x) => x !== ds) : [...p, ds]); toast("Date availability updated.", "info"); };

  // Rooms
  const openAdd = () => { setEditRoom(null); setRf({ name: "", beds: "", capacity: "", price: "", desc: "", img: "" }); setRPhotos([]); setShowModal(true); };
  const openEdit = (r: Room) => { setEditRoom(r); setRf({ name: r.name, beds: r.beds, capacity: String(r.capacity), price: String(r.price), desc: r.desc, img: r.img });
    // A room saved before galleries existed has only `img`; show it as a
    // one-photo set rather than an empty picker.
    setRPhotos(r.gallery?.length ? r.gallery.slice(0, GALLERY_MAX) : r.img ? [r.img] : []); setShowModal(true); };
  const saveRoom = () => {
    const cover = rPhotos[0] || rf.img || "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=85";
    const data = { ...rf, capacity: Number(rf.capacity), price: Number(rf.price), img: cover, gallery: (rPhotos.length ? rPhotos : [cover]).slice(0, GALLERY_MAX) };
    if (editRoom) { setRooms((rs) => rs.map((r) => r.id === editRoom.id ? { ...r, ...data } : r)); toast("Room updated.", "success"); }
    else { setRooms((rs) => [...rs, { id: Date.now(), ...data }]); toast("Room added.", "success"); }
    setShowModal(false);
  };
  const deleteRoom = (id: number) => { setRooms((rs) => rs.filter((r) => r.id !== id)); toast("Room removed.", "warning"); };
  const deleteGalleryImg = (idx: number) => { setGalleryImgs((g) => g.filter((_, i) => i !== idx)); toast("Photo removed.", "warning"); };

  /* Replace the photo in ONE slot, leaving every other slot untouched.
   *
   * The gallery array is POSITIONAL: index 0 is the hero on /gallery and the
   * photo beside "Find us" on /about, and everything after it is a mosaic
   * tile whose position decides the time stamped on it. The tab draws the
   * real mosaic so the admin can point at the photo they recognise instead
   * of translating a row number into a place on a page. */
  const replaceGalleryAt = useRef<number | null>(null);
  const galleryReplaceRef = useRef<HTMLInputElement>(null);
  const handleGalleryReplace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = replaceGalleryAt.current;
    e.target.value = "";
    if (!file || idx === null) return;
    const rd = new FileReader();
    rd.onload = (ev) => {
      setGalleryImgs((g) => g.map((src, i) => (i === idx ? (ev.target?.result as string) : src)));
      toast("Photo replaced.", "success");
    };
    rd.readAsDataURL(file);
  };
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => { Array.from(e.target.files || []).forEach((f) => { const rd = new FileReader(); rd.onload = (ev) => { setGalleryImgs((g) => [...g, ev.target?.result as string]); toast("Photo added.", "success"); }; rd.readAsDataURL(f); }); };
  /* Stamping archivedAt is the whole operation: useDbCollection's sync
     spots the change and PATCHes /api/customer-service, and the two views
     re-derive themselves. */
  const archiveMessage = (msg: CustomerMessage) => {
    setCustomerMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, archivedAt: new Date().toISOString() } : m)),
    );
    setConfirmArchiveMsg(null);
    toast("Message archived.", "info");
  };

  const goTab = (t: AdminTab) => { setTab(t); if (mob) setSideOpen(false); };

  const adminBg = isDark ? "#080706" : "#f2ede6";
  const sideBg = isDark ? "#121212" : "#ffffff";
  const sideBorder = isDark ? "#141210" : "#ede8df";
  const cBg = isDark ? "#121212" : "#ffffff";
  const cBr = isDark ? "#2a2a2a" : "#e4ddd1";
  const inpS: React.CSSProperties = { ...C.inp, borderRadius: 6 };
  const sideS = (t: AdminTab): React.CSSProperties => ({
    padding: "11px 20px 11px 24px", cursor: "pointer", fontSize: 12.5, letterSpacing: 1.5,
    borderLeft: `2px solid ${tab === t ? gold : "transparent"}`,
    background: tab === t ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)") : "transparent",
    color: tab === t ? gold : (isDark ? "#8d8378" : "#7e6c5c"),
    display: "flex", alignItems: "center", gap: 10, transition: "all .15s",
  });

  // The inbox and the archive share one layout and differ only in which
  // list feeds them, so the markup lives here once and both tab panels
  // render it.
  const messagesPanel = (
    <>
                {(
                  csView === "inbox"
                    ? inboxMessages
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
                        ? inboxMessages
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
            <span style={{ color: isDark ? "#e0e0e0" : "#111", fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 16, letterSpacing: 2 }}>STONEWOOD</span>
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
                  <span style={{ color: isDark ? "#e0e0e0" : "#111", fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 17, letterSpacing: 2 }}>STONEWOOD</span>
                </div>
                <div style={{ color: isDark ? "#888888" : "#6c6c6c", fontSize: 10.5, letterSpacing: 3, marginLeft: 16 }}>ADMIN PANEL</div>
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
                    color: isDark ? "#a68154" : "#896630",
                    fontSize: 10.5,
                    letterSpacing: 3.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase" as const,
                    fontFamily: "'Satoshi',system-ui,sans-serif",
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
                      <span style={{ flex: 1 }}>{(tabLabels[t] ?? t).toUpperCase()}</span>

                      {/* Bookings badge */}
                      {t === "Operations" && pendingCount > 0 && (
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
              <button onClick={() => setShowLogoutConfirm(true)} style={{ width: "100%", background: "transparent", color: isDark ? "#888888" : "#6c6c6c", border: `1px solid ${isDark ? "#2a2a2a" : "#ddd"}`, padding: "9px 12px", fontSize: 11.5, cursor: "pointer", borderRadius: 4, letterSpacing: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                SIGN OUT
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        {/* paddingBottom leaves room for the theme toggle, which floats over
            the bottom-right corner. Without it the last row of any admin
            table sits under the button with no way to scroll it clear. */}
        <div style={{ flex: 1, padding: mob ? "20px 16px" : "40px", paddingBottom: mob ? 96 : 104, overflowY: "auto", minWidth: 0, background: adminBg }}>

          {/* The signed-in admin, top right. Its own row above the page, so
              it never competes with a tab's header actions for the corner. */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: mob ? 14 : 18 }}>
            <button
              type="button"
              className="sw-gold-hover"
              onClick={() => setShowAccount(true)}
              aria-label="Admin account settings"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                minHeight: 38, padding: "0 14px", borderRadius: 999,
                border: `1px solid ${cBr}`, background: "transparent",
                color: C.textB, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Icon name="user" size={14} strokeWidth={1.8} />
              Admin
            </button>
          </div>

          {/* DAILY OPERATIONS — the home screen */}
          {tab === "Operations" && (
            <OperationsTab bookings={bookings} setBookings={setBookings} rooms={rooms} packages={packages}
              facilities={facilities} updateStatus={updateStatus} mob={mob} />
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
                <h2 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Calendar</h2>
                <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>Click a date to toggle it as closed.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={{ background: "transparent", border: `1px solid ${cBr}`, color: C.textS, cursor: "pointer", borderRadius: 4, padding: "6px 14px", fontSize: 14.5 }}>‹</button>
                <span style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18 }}>{calMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
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
                  let dim = false;
                  if (isPast) { bg = isDark ? "#121212" : "#f8f6f3"; col = C.textB; dim = true; }
                  else if (status === "Closed") { bg = isDark ? "#1a0a0a" : "#fff0f0"; col = "#e07070"; border = "1px solid rgba(229,85,85,0.3)"; }
                  else if (status === "Pending") { bg = isDark ? "#241f08" : "#fdf6dd"; col = "#f5c518"; border = "1px solid rgba(245,197,24,0.35)"; }
                  else if (status === "Confirmed") { bg = isDark ? "#0f2018" : "#eafaf0"; col = "#4caf50"; border = "1px solid rgba(76,175,80,0.3)"; }
                  else if (status === "Completed") { bg = isDark ? "#0f1a2a" : "#e8f4fb"; col = "#4a9fd4"; border = "1px solid rgba(74,159,212,0.3)"; }
                  const dayBookings = bookingsOn(ds);
                  /* History the admin cannot act on: a date already gone by
                     whose bookings are all finished. The cell itself states
                     the outcome, so a card repeating it is noise — and it
                     covers the dates around it while being read.

                     A past date with something still unresolved (a Pending
                     booking nobody chased) keeps its card, because that is
                     exactly when the detail is still wanted. */
                  const settled = dayBookings.length > 0
                    && dayBookings.every((bk) => bk.status === "Completed" || bk.status === "Cancelled");
                  const showDayCard = dayBookings.length > 0 && !(isPast && settled);
                  /* Which weekday column and row this cell sits in: the column
                     decides whether the card centres or hugs an edge, the row
                     decides whether it opens downward or upward. */
                  const colIdx = (firstDay + d - 1) % 7;
                  const rowIdx = Math.floor((firstDay + d - 1) / 7);
                  const cardAbove = rowIdx >= Math.ceil((firstDay + daysInMonth) / 7) - 2;
                  return (
                    <div
                      key={d}
                      onClick={() => !isPast && !["Confirmed", "Pending", "Completed"].includes(status || "") && toggleClosed(ds)}
                      onMouseEnter={() => setHoverDay(ds)}
                      onMouseLeave={() => setHoverDay((cur) => (cur === ds ? null : cur))}
                      onFocus={() => setHoverDay(ds)}
                      onBlur={() => setHoverDay((cur) => (cur === ds ? null : cur))}
                      tabIndex={dayBookings.length ? 0 : -1}
                      aria-label={dayBookings.length
                        ? `${ds}: ${dayBookings.map((bk) => `${bk.name}, ${bk.status}`).join("; ")}`
                        : undefined}
                      style={{ 
                      textAlign: "center", 
                      padding: mob ? "12px 4px" : "16px 4px", 
                      borderRadius: 6, 
                      // Same rule as the guest calendars: a date nobody can
                      // act on recedes, rather than just having muted ink.
                      opacity: dim ? 0.38 : 1,
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
                      {status && <div style={{ fontSize: 11, marginTop: 3, opacity: 0.85, letterSpacing: 0.4, lineHeight: 1.2, overflowWrap: "anywhere" }}>{status.toUpperCase()}</div>}

                      {hoverDay === ds && showDayCard && dayCard(ds, dayBookings, colIdx, cardAbove)}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[["Booked/Confirmed", "#4caf50"], ["Pending", "#f5c518"], ["Completed", "#4a9fd4"], ["Closed", "#e07070"]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: c }} /><span style={{ color: C.textS, fontSize: 12.5 }}>{l}</span></div>
                ))}
              </div>

              {/* The same information the hover card gives, in a form that
                  survives a touchscreen. Scoped to the month on screen, so
                  paging the calendar pages these too. */}
              {(() => {
                const key = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
                const inMonth = bookings
                  .filter((b) => b.date.startsWith(key) && holdsDate(b))
                  .sort((a, b) => a.date.localeCompare(b.date));
                const groups: { label: string; match: string }[] = [
                  { label: "Booked/Confirmed", match: "Confirmed" },
                  { label: "Pending", match: "Pending" },
                  { label: "Completed", match: "Completed" },
                ];
                return (
                  <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 16 }}>
                    {groups.map((g) => {
                      const rows = inMonth.filter((b) => b.status === g.match);
                      const tone = statusTone(g.match);
                      return (
                        <div key={g.label} style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "16px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: tone, flexShrink: 0 }} />
                            <span style={{ color: C.textH, fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                            <span style={{ color: C.textS, fontSize: 12, marginLeft: "auto" }}>{rows.length}</span>
                          </div>
                          {rows.length === 0 ? (
                            <p style={{ color: C.textS, fontSize: 12.5, margin: 0 }}>None this month.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {rows.map((bk) => (
                                <div key={bk.id} style={{ borderTop: `1px solid ${cBr}`, paddingTop: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <span style={{ color: C.textH, fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{bk.name}</span>
                                    <span style={{ color: tone, fontSize: 11.5, whiteSpace: "nowrap" }}>{fmtDate(bk.date)}</span>
                                  </div>
                                  <div style={{ color: C.textS, fontSize: 12, marginTop: 3 }}>
                                    {bk.guests} guests · {bk.id}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ROOMS */}
          {tab === "Rooms" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
                <div><p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>ACCOMMODATIONS</p><h2 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Rooms</h2></div>
                <button className="sw-btn" onClick={openAdd} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD ROOM</button>
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
                      <h4 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 17, marginBottom: 4, fontWeight: 400 }}>{r.name}</h4>
                      <p style={{ color: gold, fontSize: 12.5, marginBottom: 8 }}><Icon name="bed" size={12} style={{ marginRight: 5 }} />{r.beds}</p>
                      <p style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>{r.desc}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="sw-btn-out" onClick={() => openEdit(r)} style={{ ...outBtn, flex: 1, padding: "8px 12px", fontSize: 11.5, letterSpacing: 1 }}>EDIT</button>
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
                <div>
                  <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>MEDIA</p>
                  <h2 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: "0 0 6px" }}>Gallery</h2>
                  <p style={{ color: C.textS, fontSize: 13.5, margin: 0, maxWidth: 560 }}>
                    Every photo fills one named place on the site. Replace a slot to change that
                    picture, or move it to change which slot it fills.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={galleryFileRef} type="file" accept="image/*" multiple onChange={handleGalleryUpload} style={{ display: "none" }} />
                  <input ref={galleryReplaceRef} type="file" accept="image/*" onChange={handleGalleryReplace} style={{ display: "none" }} />
                  <button className="sw-btn" onClick={() => galleryFileRef.current?.click()} style={{ ...goldBtn, padding: "10px 20px", fontSize: 12.5, letterSpacing: 2 }}>+ ADD PHOTOS</button>
                </div>
              </div>

              {galleryImgs.length === 0 ? (
                <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "40px 24px", textAlign: "center" }}>
                  <p style={{ color: C.textS, fontSize: 13.5, margin: 0 }}>
                    No photos yet. The first one you add becomes the gallery hero.
                  </p>
                </div>
              ) : (
                <>
                  {/* The gallery as the guest sees it. A list of "Tile 3 of 8"
                      made the admin translate a row into a position on a page
                      they were not looking at; this is the page, and you click
                      the photo you recognise.

                      The grid draws from GALLERY_SPANS and galleryHourLabel in
                      lib/gallery.ts -- the same source the real page uses, so
                      this preview cannot drift out of step with it. */}
                  <p style={{ color: C.textXS, fontSize: 11, letterSpacing: 2, margin: "0 0 10px" }}>
                    HERO &mdash; /GALLERY BANNER AND THE /ABOUT PHOTO
                  </p>
                  <div
                    style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: `1px solid ${gold}`, marginBottom: 26 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={galleryImgs[0]} alt="" style={{ display: "block", width: "100%", height: mob ? 150 : 230, objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.05))" }} />
                    <button className="sw-btn"
                      onClick={() => { replaceGalleryAt.current = 0; galleryReplaceRef.current?.click(); }}
                      aria-label="Replace the gallery hero photo"
                      style={{ ...goldBtn, position: "absolute", right: 12, bottom: 12, minHeight: 40, padding: "0 18px", fontSize: 11.5, letterSpacing: 1.4 }}
                    >
                      CHANGE PHOTO
                    </button>
                  </div>

                  <p style={{ color: C.textXS, fontSize: 11, letterSpacing: 2, margin: "0 0 10px" }}>
                    MOSAIC &mdash; CLICK A PHOTO TO CHANGE IT
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: mob ? "1fr 1fr" : "repeat(12, 1fr)",
                      gap: 10,
                      alignItems: "start",
                    }}
                  >
                    {galleryImgs.slice(1).map((src, i) => (
                      <div
                        key={`${src}-${i}`}
                        style={{
                          gridColumn: mob ? "auto" : `span ${GALLERY_SPANS[i % GALLERY_SPANS.length]}`,
                          position: "relative",
                          borderRadius: 10,
                          overflow: "hidden",
                          border: `1px solid ${cBr}`,
                          background: cBg,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" style={{ display: "block", width: "100%", height: "auto" }} />

                        {/* The same stamp the guest sees on that tile. */}
                        <span style={{ position: "absolute", left: 10, bottom: 10, background: "rgba(0,0,0,0.6)", color: "#f2ede4", fontSize: 11, padding: "4px 9px", borderRadius: 999 }}>
                          {galleryHourLabel(i, galleryImgs.length - 1)}
                        </span>

                        <div style={{ position: "absolute", right: 8, top: 8, display: "flex", gap: 6 }}>
                          <button className="sw-btn"
                            onClick={() => { replaceGalleryAt.current = i + 1; galleryReplaceRef.current?.click(); }}
                            aria-label={`Change the ${galleryHourLabel(i, galleryImgs.length - 1)} photo`}
                            title="Change this photo"
                            style={{ ...goldBtn, minHeight: 34, padding: "0 12px", fontSize: 11, letterSpacing: 1, borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
                          >
                            CHANGE
                          </button>
                          <button
                            onClick={() => deleteGalleryImg(i + 1)}
                            aria-label={`Remove the ${galleryHourLabel(i, galleryImgs.length - 1)} photo`}
                            title="Remove this photo"
                            style={{ background: "rgba(20,10,10,0.75)", border: "1px solid rgba(229,85,85,0.45)", color: "#e8a0a0", width: 34, height: 34, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p style={{ color: C.textS, fontSize: 12.5, margin: "18px 0 0" }}>
                    Times are the photo&rsquo;s place in the day, not when it was taken &mdash; they
                    spread across 07:00 to 23:00 and re-count when a photo is added or removed.
                  </p>
                </>
              )}
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

          {/* ACTIVITY — the audit trail */}
          {tab === "Activity" && <ActivityTab mob={mob} />}

          {/* CUSTOMER SERVICE */}
          {tab === "Customer Service" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 3, marginBottom: 8 }}>MESSAGES</p>
                <h2 style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: mob ? 22 : 26, fontWeight: 400, margin: 0 }}>Customer Service</h2>
              </div>

              {/* ARCHIVE CONFIRM MODAL */}
              <AlertDialog open={!!confirmArchiveMsg} onOpenChange={(open) => { if (!open) setConfirmArchiveMsg(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle
                      style={{
                        color: C.textH,
                        fontFamily: "'Satoshi',system-ui,sans-serif",
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
                      onClick={() => { if (confirmArchiveMsg) archiveMessage(confirmArchiveMsg); }}
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
                        ? `INBOX (${inboxMessages.length})`
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
                            fontFamily: "'Satoshi',system-ui,sans-serif",
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
                        <Button className="sw-btn"
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

      {/* Logout Confirm */}
      {showAccount && (
        <AccountModal
          onClose={() => setShowAccount(false)}
          onSignedOut={() => { setShowAccount(false); onLogout(); }}
        />
      )}

      <AlertDialog open={showLogoutConfirm} onOpenChange={(open) => { if (!open) setShowLogoutConfirm(false); }}>
        <AlertDialogContent>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#e55" }}><Icon name="lock" size={20} /></div>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 18, fontWeight: 400 }}>Sign out?</AlertDialogTitle>
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
                <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 20, fontWeight: 400 }}>Remove this room?</AlertDialogTitle>
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
            <DialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 22, fontWeight: 400 }}>
              {editRoom ? "Edit Room" : "Add New Room"}
            </DialogTitle>
            <DialogDescription>
              {editRoom ? "Update this room's photo, capacity and rate." : "Add a room guests can book alongside a tour."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* Image */}
            <div>
              <Label htmlFor="room-add-photo" style={{ display: "block", color: C.textXS, fontSize: 10.5, letterSpacing: 3, marginBottom: 8 }}>ROOM PHOTOS</Label>
              <PhotoSet photos={rPhotos} onChange={setRPhotos} noun="room" idPrefix="room" thumbHeight={78} />
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
            <Button className="sw-btn" onClick={saveRoom} style={{ ...goldBtn, borderRadius: 6, height: "auto" }}>SAVE ROOM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ThemeToggle />
    </div>
  );
}
