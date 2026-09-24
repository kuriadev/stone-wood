"use client";

import { useEffect, useState } from "react";

/**
 * useState that mirrors itself to localStorage under `key`.
 *
 * Why this exists: AppContext used to keep everything except `bookings` in
 * plain in-memory React state. That meant an admin editing an item
 * "unavailable" (or closing a date, editing a room, etc.) only ever changed
 * that ONE browser tab's memory — reload the page, or open the customer
 * site in a second tab, and it starts over from the hardcoded defaults. A
 * staff member marking "Pork BBQ Skewers" out in /admin and a guest still
 * being able to order it in /book was exactly that: two separate tabs, two
 * separate copies of state, neither one told the other anything changed.
 *
 * This hook is the same read-once/write-on-change pattern `bookings`
 * already used, generalized so every admin-editable collection persists
 * the same way and stays in sync across reloads and tabs.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage can fail (quota, private mode) — the in-memory state still
      // works for the rest of this tab's session either way.
    }
  }, [key, state]);

  // Cross-tab sync: when another tab (e.g. /admin) changes this key, the
  // "storage" event fires here so an already-open /book tab picks
  // up the change without needing a manual refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        setState(JSON.parse(e.newValue) as T);
      } catch {
        // Ignore malformed writes from elsewhere.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [state, setState] as const;
}
