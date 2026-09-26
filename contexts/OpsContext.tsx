"use client";

// ── Sales ledger + facility records, for the admin panel
//
// Payments, expenses, closings and inspections are append-only records, so
// they do not use the diff-and-sync pattern of AppContext. Each change is an
// explicit action that calls its route, and the whole set is re-read after
// it succeeds. That keeps the server as the only source of truth for money:
// the browser never computes a payment into existence on its own.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
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

interface OpsState extends OpsData {
  loading: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  recordPayment: (p: { bookingId: string; type: PaymentType } & PayInput & { notes?: string }) => Promise<Result>;
  voidPayment: (id: number, reason: string) => Promise<Result>;
  addExpense: (e: { category: string; description: string; amount: number; method: string; spentOn: string }) => Promise<Result>;
  voidExpense: (id: number, reason: string) => Promise<Result>;
  closeDay: (c: { date: string; openingFloat: number; countedCash: number; notes: string }) => Promise<Result>;
  saveRate: (r: { id?: number; name?: string; category?: string; unit?: string; rate?: number; active?: boolean }) => Promise<Result>;
  savePreparation: (p: { bookingId: string; items: InspectionItem[]; notes: string }) => Promise<Result>;
  checkout: (c: {
    bookingId: string;
    items: InspectionItem[];
    damages: CheckoutDamageInput[];
    balancePayment: PayInput | null;
    penaltyPayment: PayInput | null;
    leaveUnpaid: boolean;
    maintenanceFacilityIds: number[];
    notes: string;
  }) => Promise<Result>;
}

const EMPTY: OpsData = { payments: [], expenses: [], closings: [], damageRates: [], inspections: [], damages: [] };

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
  const { adminAuth, reloadBookings, reloadFacilities } = useApp();
  const [data, setData] = useState<OpsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!adminAuth || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/ops");
      if (!res.ok) return;
      const json = await res.json();
      if (!json?.success) return;
      setData({
        payments: json.payments ?? [],
        expenses: json.expenses ?? [],
        closings: json.closings ?? [],
        damageRates: json.damageRates ?? [],
        inspections: json.inspections ?? [],
        damages: json.damages ?? [],
      });
      setLoaded(true);
    } catch {
      // Keep what is on screen; the next poll tries again.
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [adminAuth]);

  useEffect(() => {
    if (!adminAuth) return;
    void refresh();
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const t = setInterval(tick, 20_000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(t); window.removeEventListener("focus", tick); };
  }, [adminAuth, refresh]);

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
    refresh,
    recordPayment: (p) => act(call("/api/payments", "POST", p), { bookings: true }),
    voidPayment: (id, reason) => act(call(`/api/payments?id=${id}`, "PATCH", { reason })),
    addExpense: (e) => act(call("/api/expenses", "POST", e)),
    voidExpense: (id, reason) => act(call(`/api/expenses?id=${id}`, "PATCH", { reason })),
    closeDay: (c) => act(call("/api/closings", "POST", c)),
    saveRate: ({ id, ...rest }) =>
      act(id === undefined ? call("/api/damage-rates", "POST", rest) : call(`/api/damage-rates?id=${id}`, "PATCH", rest)),
    savePreparation: (p) => act(call("/api/inspections", "POST", p), { facilities: true }),
    checkout: (c) => act(call("/api/checkout", "POST", c), { bookings: true, facilities: true }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOps(): OpsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOps must be used inside OpsProvider");
  return ctx;
}
