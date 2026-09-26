"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cancelBookingLookup, type CancelBookingLookup } from "@/lib/schemas";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { fmtDate } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import { Icon, type IconName } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";

interface ManageBookingProps {
  onGoHome?: () => void;
}

const CANCEL_REASONS = [
  { icon: "siren", label: "Emergencies" },
  { icon: "info", label: "Panic Booking" },
  { icon: "calendar", label: "Change of Plans" },
  { icon: "circle", label: "Other" },
];

export function ManageBooking(_props: ManageBookingProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;

  // The lookup is the only real form on this page — everything below it
  // (reason, confirm modal) is flow state, not fields. The schema requires
  // both values and normalises them; the component no longer trims or
  // lower-cases by hand at two separate call sites.
  const {
    register: reg,
    handleSubmit: submitLookup,
    watch: watchLookup,
    setValue: setLookupValue,
    formState: { errors: lookupErrors },
  } = useForm<CancelBookingLookup>({
    resolver: zodResolver(cancelBookingLookup),
    mode: "onSubmit",
    defaultValues: { reference: "", email: "" },
  });

  const refInput = watchLookup("reference");
  const emailInput = watchLookup("email");
  const [found, setFound] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelDone, setCancelDone] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [searched, setSearched] = useState(false);

  // Why the last search or cancel failed, when it wasn't simply "not found"
  // (rate limit, network), so the guest isn't told a real booking is missing.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // The "Manage booking" link in the confirmation email carries
  // ?booking=…&email=… — fill both in so the guest only has to press Find.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get("booking");
    const mail = q.get("email");
    if (ref) setLookupValue("reference", ref.slice(0, 32));
    if (mail) setLookupValue("email", mail.slice(0, 254));
  }, [setLookupValue]);

  // Looks the booking up on the server. This used to search a list held in
  // the browser, which for a guest never contained real bookings — so every
  // search came back "not found".
  const handleFind = submitLookup(async ({ reference: ref, email: mail }) => {
    if (looking) return;
    setSearched(true);
    setCancelDone(false);
    setErrorMsg(null);
    setLooking(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(ref)}?email=${encodeURIComponent(mail)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.booking) {
        setFound(json.booking as Booking);
        setNotFound(false);
      } else {
        setFound(null);
        setNotFound(true);
        if (res.status !== 404) setErrorMsg(json?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFound(null);
      setNotFound(true);
      setErrorMsg("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  });

  const handleProceedCancel = () => {
    setShowCancelConfirm(true);
  };

  // Cancels on the server. Previously this only changed the browser's copy,
  // so the admin never saw the cancellation and the date stayed blocked.
  const confirmCancel = async () => {
    if (!found || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(found.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (emailInput ?? "").trim().toLowerCase(), reason: cancelReason ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.booking) throw new Error(json?.error ?? "Could not cancel the booking.");
      setFound(json.booking as Booking);
      setCancelDone(true);
      setShowCancelConfirm(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not cancel the booking.");
    } finally {
      setCancelling(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "Confirmed") return "#4caf50";
    if (s === "Pending") return "#f5c518";
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
            <p style={{ color: gold, letterSpacing: 4, fontSize: 11.5, margin: 0 }}>CANCEL BOOKING</p>
            <div style={{ height: 1, width: 40, background: `linear-gradient(to left, transparent, ${gold}88)` }} />
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond',Georgia,serif",
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
          <p style={{ color: C.textS, fontSize: 15, lineHeight: 1.8, maxWidth: 480, margin: "0 auto" }}>
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
          <p style={{ color: gold, fontSize: 11.5, letterSpacing: 3, marginBottom: 20 }}>FIND YOUR BOOKING</p>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr auto", gap: 14, alignItems: "flex-end" }}>
            <div>
              <Label htmlFor="cb-reference" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">
                BOOKING REFERENCE / ID
              </Label>
              <div style={{ position: "relative" }}>
                <Input
                  id="cb-reference"
                  type="text"
                  placeholder="Enter booking reference"
                  {...reg("reference")}
                  maxLength={32}
                  onKeyDown={(e) => e.key === "Enter" && void handleFind()}
                  className="pr-9"
                />
                <Icon name="bookmark" size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
              </div>
            </div>
            <div>
              <Label htmlFor="cb-email" className="mb-1.5 block text-[11.5px] tracking-[2px] text-primary">
                EMAIL ADDRESS
              </Label>
              <div style={{ position: "relative" }}>
                <Input
                  id="cb-email"
                  type="email"
                  placeholder="Enter email address"
                  {...reg("email")}
                  maxLength={254}
                  autoComplete="email"
                  onKeyDown={(e) => e.key === "Enter" && void handleFind()}
                  className="pr-9"
                />
                <Icon name="mail" size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void handleFind()}
              disabled={looking}
              style={{
                ...goldBtn,
                padding: "12px 20px",
                height: "auto",
                borderRadius: 6,
                whiteSpace: "nowrap",
                letterSpacing: 1.5,
                fontSize: 12.5,
                width: mob ? "100%" : "auto",
              }}
            >
              {looking ? "SEARCHING…" : "FIND BOOKING →"}
            </Button>
            {/* Pressing Find with an empty box used to do nothing at all —
                the handler returned early and said nothing, which reads as a
                broken button. The schema already knows why it refused. */}
            {(lookupErrors.reference || lookupErrors.email) && (
              <p style={{ color: "#e55", fontSize: 12.5, marginTop: 8, width: "100%" }}>
                {lookupErrors.reference?.message ?? lookupErrors.email?.message}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
            <Icon name="lock" size={12} style={{ opacity: 0.5 }} />
            <span style={{ color: C.textXS, fontSize: 12.5 }}>Your information is secure and encrypted</span>
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
            <div style={{ marginBottom: 12, color: C.textXS, lineHeight: 0 }}><Icon name="search" size={30} strokeWidth={1.5} /></div>
            <h3 style={{ color: "#e55", fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400, marginBottom: 8 }}>
              {errorMsg ? "Something Went Wrong" : "Booking Not Found"}
            </h3>
            <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
              {errorMsg ?? "We couldn't find a booking matching those details. Please double-check your reference ID and email address."}
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
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(76,175,80,0.15)", border: "1.5px solid #4caf50", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5 }}>✓</div>
              <span style={{ color: "#4caf50", fontSize: 11.5, fontWeight: 700, letterSpacing: 2 }}>BOOKING FOUND</span>
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
                  loading="lazy" decoding="async"
                  src="https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400&q=80"
                  alt="Resort"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 22, fontWeight: 500, marginBottom: 14 }}>
                  {found.package.includes("Room") ? "Deluxe Pool Villa" : `${found.package} Package`}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12 }}>
                  {[
                    { icon: "📅", label: "CHECK-IN", value: fmtDate(found.date), sub: "" },
                    { icon: "📅", label: "CHECK-OUT", value: fmtDate(found.date), sub: "" },
                    { icon: "👤", label: "GUESTS", value: `${found.guests} Adults`, sub: "" },
                    { icon: "🔖", label: "BOOKING REFERENCE", value: found.id, sub: "", isRef: true },
                  ].map(({ label, value, sub, isRef }) => (
                    <div key={label}>
                      <div style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: isRef ? gold : C.textH, fontSize: isRef ? 13.5 : 14.5, fontWeight: isRef ? 700 : 500, fontFamily: isRef ? "monospace" : "inherit" }}>
                        {value}
                      </div>
                      {sub && <div style={{ color: C.textS, fontSize: 12.5, marginTop: 2 }}>{sub}</div>}
                      {isRef && (
                        <Badge variant="outline" style={{ display: "inline-block", marginTop: 4, background: "rgba(76,175,80,0.12)", color: "#4caf50", fontSize: 10.5, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(76,175,80,0.3)", letterSpacing: 1 }}>
                          {found.status.toUpperCase()}
                        </Badge>
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
                <div style={{ color: C.textXS, fontSize: 10.5, letterSpacing: 2, marginBottom: 4 }}>TOTAL AMOUNT</div>
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
            <p style={{ color: gold, fontSize: 11.5, letterSpacing: 3, marginBottom: 16 }}>CANCEL YOUR BOOKING</p>

            <div style={{ marginBottom: 20 }}>
              <p style={{ color: C.textH, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Help us improve (optional)</p>
              <p style={{ color: C.textS, fontSize: 13.5, marginBottom: 16 }}>Let us know why you're canceling your booking.</p>
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
                      <Icon name={icon as IconName} size={16} style={{ color: sel ? "#4caf50" : C.textS, flexShrink: 0 }} />
                      <span style={{ color: sel ? "#4caf50" : C.textS, fontSize: 13.5, flex: 1 }}>{label}</span>
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
                        {sel && <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 700, lineHeight: 1 }}>✓</span>}
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
              <span style={{ fontSize: 15, flexShrink: 0 }}>ℹ️</span>
              <span style={{ color: gold, fontSize: 13.5, lineHeight: 1.6 }}>
                Free cancellation available up to 24 hours before check-in.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                onClick={handleProceedCancel}
                style={{
                  ...goldBtn,
                  padding: "13px 28px",
                  height: "auto",
                  borderRadius: 6,
                  letterSpacing: 2,
                  fontSize: 12.5,
                }}
              >
                PROCEED TO CANCEL →
              </Button>
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
            <p style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
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
            <p style={{ color: C.textS, fontSize: 14.5 }}>
              This booking is already{" "}
              <strong style={{ color: statusColor(found.status) }}>{found.status}</strong> and cannot be modified.
            </p>
          </div>
        )}
      </div>

      {/* Confirm Cancel — an AlertDialog, not a Dialog: cancelling a booking
          is destructive and cannot be undone, so it deliberately has no close
          button and no click-outside dismissal. The guest has to choose. */}
      <AlertDialog open={showCancelConfirm} onOpenChange={(open) => { if (!open) setShowCancelConfirm(false); }}>
        <AlertDialogContent>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(229,85,85,0.1)", border: "1px solid rgba(229,85,85,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
            ⚠️
          </div>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.textH, fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, fontWeight: 400 }}>
              Confirm Cancellation
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: C.textS, fontSize: 14.5, lineHeight: 1.7 }}>
              Are you sure you want to cancel booking <strong style={{ color: gold }}>{found?.id}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelError && (
            <p style={{ color: "#e55", fontSize: 13.5, lineHeight: 1.6 }}>⚠ {cancelError}</p>
          )}
          <Separator />
          <AlertDialogFooter>
            <AlertDialogCancel style={{ ...outBtn, padding: "12px 16px", height: "auto", fontSize: 12.5, borderRadius: 8 }}>
              GO BACK
            </AlertDialogCancel>
            {/* Not an AlertDialogAction: that closes the dialog on click, which
                would tear down the panel before confirmCancel() has answered
                and leave `cancelError` with nowhere to show. */}
            <Button
              onClick={() => void confirmCancel()}
              disabled={cancelling}
              style={{
                background: "rgba(229,85,85,0.12)",
                color: "#e55",
                border: "1px solid rgba(229,85,85,0.3)",
                padding: "12px 16px",
                height: "auto",
                fontSize: 12.5,
                fontWeight: 700,
                borderRadius: 8,
                letterSpacing: 2,
              }}
            >
              {cancelling ? "CANCELLING…" : "YES, CANCEL BOOKING"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
