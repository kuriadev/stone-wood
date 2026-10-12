"use client";

// ── Who is signed in, for the admin screens
//
// Read once from GET /api/auth/me after sign-in. The admin shell uses it to
// show each role its own screens and to relabel what a role can only ask
// the owner for. The server checks every action regardless — this only
// keeps the screen from offering what would be refused.
//
// If the call fails (an older server, no connection) the screens fall back
// to the Owner's view, which is exactly what the admin looked like before
// staff accounts: nobody is locked out of their own panel by a hiccup, and
// the server still refuses anything the person really can't do.
//
// ── One sign-in per browser ──
//
// The session is a cookie, and a browser has one per site, shared by every
// tab. Signing in as someone else in another tab therefore changes who
// EVERY tab acts as — while a tab that loaded earlier still shows the old
// name. So the tab re-checks: when it becomes visible again, the moment a
// sign-in or sign-out happens in another tab (SIGN_IN_EVENT below), and
// every minute. If the person changed it says so and switches its screens;
// if the session is gone it returns to the sign-in page.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/contexts/ToastContext";
import { ROLE_LABEL } from "@/lib/permissions";
import { can as roleCan, canRequest as roleCanRequest, type Permission, type StaffRole } from "@/lib/permissions";

export interface Me {
  id: string | null;
  name: string;
  username: string;
  role: StaffRole;
  mustChangePassword: boolean;
}

interface StaffState {
  me: Me | null;
  /** False until the first answer (or failure) arrives. */
  ready: boolean;
  /** The staff migration is applied: Staff page and requests are live. */
  staffEnabled: boolean;
  can: (p: Permission) => boolean;
  /** Can't do it, but may send it to the owner. */
  canRequest: (p: Permission) => boolean;
  refresh: () => Promise<void>;
}

const OWNER_FALLBACK: Me = { id: null, name: "Admin", username: "admin", role: "Owner", mustChangePassword: false };

const Ctx = createContext<StaffState | null>(null);

/** localStorage key written on every sign-in and sign-out, so other open
 *  tabs re-check who they are at once. */
export const SIGN_IN_EVENT = "sw_signed_in";

/** Tell this browser's other tabs that the sign-in changed. */
export function announceSignIn(): void {
  try { localStorage.setItem(SIGN_IN_EVENT, String(Date.now())); } catch { /* private mode */ }
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const { adminAuth, setAdminAuth } = useApp();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [staffEnabled, setStaffEnabled] = useState(false);
  const meRef = useRef<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const before = meRef.current;
      if (json?.success && json.staff) {
        const now = json.staff as Me;
        // Someone else signed in on this browser (another tab): this tab now
        // acts as them, so say so plainly and show their screens.
        if (before && before !== OWNER_FALLBACK && (before.id !== now.id || before.role !== now.role)) {
          toast(`This browser is now signed in as ${now.name} (${ROLE_LABEL[now.role]}) — someone signed in on another tab. This tab now works as ${now.name}. To use two accounts at once, use a different browser or a private window.`, "warning");
        }
        meRef.current = now;
        setMe(now);
        setStaffEnabled(!!json.staffEnabled);
      } else if (res.status === 401) {
        // Signed out on another tab, deactivated, or expired: back to sign-in.
        if (before) {
          meRef.current = null;
          toast("You've been signed out on this browser. Please sign in again.", "info");
          setAdminAuth(false);
        }
      } else {
        setMe((m) => m ?? OWNER_FALLBACK);
      }
    } catch {
      setMe((m) => m ?? OWNER_FALLBACK);
    } finally {
      setReady(true);
    }
  }, [toast, setAdminAuth]);

  useEffect(() => {
    if (!adminAuth) { meRef.current = null; setMe(null); setReady(false); return; }
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onStorage = (e: StorageEvent) => { if (e.key === SIGN_IN_EVENT) void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, [adminAuth, refresh]);

  const value = useMemo<StaffState>(() => ({
    me,
    ready,
    staffEnabled,
    can: (p) => roleCan(me?.role ?? "Owner", p),
    canRequest: (p) => roleCanRequest(me?.role ?? "Owner", p),
    refresh,
  }), [me, ready, staffEnabled, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStaff(): StaffState {
  const ctx = useContext(Ctx);
  // Outside the admin (or in a test render) everything reads as the Owner,
  // which is what every admin component assumed before roles existed.
  if (!ctx) {
    return {
      me: OWNER_FALLBACK, ready: true, staffEnabled: false,
      can: () => true, canRequest: () => false, refresh: async () => {},
    };
  }
  return ctx;
}
