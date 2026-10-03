"use client";

// ── Sales ledger + facility records, for the admin panel
//
// Payments, expenses, closings and inspections are append-only records, so
// they do not use the diff-and-sync pattern of AppContext. Each change is an
// explicit action that calls its route, and the whole set is re-read after
// it succeeds. That keeps the server as the only source of truth for money:
// the browser never computes a payment into existence on its own.
//
// It also keeps the admin panel live. Every LIVE_MS while the tab is
// visible, and whenever the window regains focus, bookings, facilities and
// this ledger are re-read together, so a guest booking online or paying
// through PayMongo shows up without a reload. `live` says when that last
// worked, for the indicator on screen, and a new online booking raises a
// notice the moment it arrives.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/contexts/ToastContext";
import { fmtDate } from "@/lib/utils";
import type { OpsData, InspectionItem, PaymentType } from "@/types/finance";

type Result = { ok: true; data?: Record<string, unknown> } | { ok: false; error: string };

export interface CheckoutDamageInput {
  facilityName: string;
  rateId: number | null;
  itemName: string;
  quantity: number;
  unitRate: number;
  adjustment: number;
  adjustmentReason: string;
  description: string;
}

export interface PayInput {
  amount: number;
  method: "Cash" | "GCash" | "Bank Transfer";
  reference: string;
}

/** How often the admin panel re-reads everything while it is on screen. */
const LIVE_MS = 15_000;

export interface LiveSync {
  /** When bookings, facilities and the ledger were last all read. */
  syncedAt: number | null;
  /** The last attempt could not reach the server (offline, or signed out). */
  failed: boolean;
  syncing: boolean;
  /** Re-read everything now. */
  syncNow: () => Promise<void>;
}

interface OpsState extends OpsData {
  loading: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  live: LiveSync;
  /** Online bookings that arrived while the panel was open. */
  freshIds: ReadonlySet<string>;
  /** `receipt`: a photo of a refund transfer (data URL), refunds only. */
  recordPayment: (p: { bookingId: string; type: PaymentType } & PayInput & { notes?: string; receipt?: string }) => Promise<Result>;
  voidPayment: (id: number, reason: string) => Promise<Result>;
  addExpense: (e: { category: string; description: string; amount: number; method: string; spentOn: string }) => Promise<Result>;
  voidExpense: (id: number, reason: string) => Promise<Result>;
  closeDay: (c: { date: string; openingFloat: number; countedCash: number; notes: string }) => Promise<Result>;
  saveRate: (r: { id?: number; name?: string; category?: string; unit?: string; rate?: number; active?: boolean }) => Promise<Result>;
  savePreparation: (p: { bookingId: string; items: InspectionItem[]; notes: string }) => Promise<Result>;
  /** The group arrived (or, with undo, the tap was a mistake). */
  checkIn: (bookingId: string, undo?: boolean) => Promise<Result>;
  /** Inspect the facilities as the group leaves; records damage. */
  checkout: (c: {
    bookingId: string;
    items: InspectionItem[];
    damages: CheckoutDamageInput[];
    maintenanceFacilityIds: number[];
    notes: string;
  }) => Promise<Result>;
  /** Per-booking liquidation: final payment, then Completed. */
  settle: (s: { bookingId: string; payment: PayInput | null; closeUnpaid: boolean; note: string }) => Promise<Result>;
  /** The resort can't host it: the guest picks a new date or a refund.
   *  The result's data carries `guestLink` and the `sms` text. */
  resortCancel: (bookingId: string, reason: string) => Promise<Result>;
  /** Approve or decline a guest's date-change request. */
  decideDateChange: (id: number, approve: boolean, note: string) => Promise<Result>;
  /** The link that opens a guest's booking page, for a text message. */
  guestLink: (bookingId: string) => Promise<string | null>;
  /** Note in the activity log that the owner texted the guest. */
  noteTexted: (bookingId: string, about: string) => void;
}

const EMPTY: OpsData = { payments: [], expenses: [], closings: [], damageRates: [], inspections: [], damages: [], dateChanges: [] };

const Ctx = createContext<OpsState | null>(null);

async function call(url: string, method: string, body?: unknown): Promise<Result> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.success === false) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "Something went wrong. Try again." };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "No connection to the server. Check the internet and try again." };
  }
}

export function OpsProvider({ children }: { children: ReactNode }) {
  const { adminAuth, bookings, reloadBookings, reloadFacilities } = useApp();
  const { toast } = useToast();
  const [data, setData] = useState<OpsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);

  /** true: read. false: the server could not be reached. undefined: a read
   *  was already under way, so this one was skipped. */
  const refresh = useCallback(async (): Promise<boolean | undefined> => {
    if (!adminAuth) return false;
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      const res = await fetch("/api/ops");
      if (!res.ok) return false;
      const json = await res.json();
      if (!json?.success) return false;
      setData({
        payments: json.payments ?? [],
        expenses: json.expenses ?? [],
        closings: json.closings ?? [],
        damageRates: json.damageRates ?? [],
        inspections: json.inspections ?? [],
        damages: json.damages ?? [],
        dateChanges: json.dateChanges ?? [],
      });
      setLoaded(true);
      return true;
    } catch {
      // Keep what is on screen; the next sync tries again.
      return false;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [adminAuth]);

  // ── Live sync ────────────────────────────────────────────────────────
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const syncNow = useCallback(async () => {
    if (!adminAuth || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const results = await Promise.all([refresh(), reloadBookings(), reloadFacilities()]);
      const ok = results.every((r) => r !== false);
      setFailed(!ok);
      if (ok) setSyncedAt(Date.now());
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [adminAuth, refresh, reloadBookings, reloadFacilities]);

  useEffect(() => {
    if (!adminAuth) return;
    void syncNow();
    const tick = () => { if (document.visibilityState === "visible") void syncNow(); };
    const t = setInterval(tick, LIVE_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [adminAuth, syncNow]);

  // ── New online bookings ──────────────────────────────────────────────
  // The first successful sync records what is already there; anything that
  // appears after that came in while the panel was open. Walk-ins are left
  // out: the admin just typed those in.
  const seenRef = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!adminAuth || syncedAt === null) return;
    const real = bookings.filter((b) => !b.id.startsWith("TMP-"));
    if (!seenRef.current) {
      seenRef.current = new Set(real.map((b) => b.id));
      return;
    }
    const seen = seenRef.current;
    const arrived = real.filter((b) => !seen.has(b.id));
    if (arrived.length === 0) return;
    arrived.forEach((b) => seen.add(b.id));
    const online = arrived.filter((b) => (b.source ?? "Online") !== "Walk-In");
    if (online.length === 0) return;
    setFreshIds((s) => new Set([...s, ...online.map((b) => b.id)]));
    toast(online.length === 1
      ? `New booking: ${online[0].name}, ${fmtDate(online[0].date)}. It's waiting in Daily Operations.`
      : `${online.length} new bookings came in. They're waiting in Daily Operations.`, "info");
  }, [adminAuth, bookings, syncedAt, toast]);

  /** Run an action, then re-read whatever it may have changed. */
  const act = useCallback(
    async (p: Promise<Result>, also: { bookings?: boolean; facilities?: boolean } = {}) => {
      const r = await p;
      if (r.ok) {
        await Promise.all([
          refresh(),
          also.bookings ? reloadBookings() : Promise.resolve(),
          also.facilities ? reloadFacilities() : Promise.resolve(),
        ]);
      }
      return r;
    },
    [refresh, reloadBookings, reloadFacilities],
  );

  const value: OpsState = {
    ...data,
    loading,
    loaded,
    refresh: async () => { await refresh(); },
    live: { syncedAt, failed, syncing, syncNow },
    freshIds,
    recordPayment: (p) => act(call("/api/payments", "POST", p), { bookings: true }),
    voidPayment: (id, reason) => act(call(`/api/payments?id=${id}`, "PATCH", { reason })),
    addExpense: (e) => act(call("/api/expenses", "POST", e)),
    voidExpense: (id, reason) => act(call(`/api/expenses?id=${id}`, "PATCH", { reason })),
    closeDay: (c) => act(call("/api/closings", "POST", c)),
    saveRate: ({ id, ...rest }) =>
      act(id === undefined ? call("/api/damage-rates", "POST", rest) : call(`/api/damage-rates?id=${id}`, "PATCH", rest)),
    savePreparation: (p) => act(call("/api/inspections", "POST", p), { facilities: true }),
    checkIn: (bookingId, undo = false) => act(call("/api/checkin", "POST", { bookingId, undo }), { bookings: true, facilities: true }),
    checkout: (c) => act(call("/api/checkout", "POST", c), { bookings: true, facilities: true }),
    settle: (st) => act(call("/api/settle", "POST", st), { bookings: true }),
    resortCancel: (bookingId, reason) =>
      act(call(`/api/bookings/${encodeURIComponent(bookingId)}/resort-cancel`, "POST", { reason }), { bookings: true }),
    decideDateChange: (id, approve, note) =>
      act(call(`/api/date-changes?id=${id}`, "PATCH", { action: approve ? "approve" : "decline", note }), { bookings: true }),
    guestLink: async (bookingId) => {
      const r = await call(`/api/guest-link?id=${encodeURIComponent(bookingId)}`, "GET");
      return r.ok && typeof r.data?.link === "string" ? r.data.link : null;
    },
    noteTexted: (bookingId, about) => { void call("/api/activity", "POST", { action: "guest.texted", bookingId, about }); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOps(): OpsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOps must be used inside OpsProvider");
  return ctx;
}
