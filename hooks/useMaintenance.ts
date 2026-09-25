"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAINTENANCE_DEFAULT, type MaintenanceState } from "@/types/maintenance";

const POLL_MS = 60_000;

/**
 * Whether the public site is currently closed, and why.
 *
 * Polled rather than fetched once: the whole point of the switch is that an
 * admin can flip it and have visitors who are *already* on the site see it
 * without being told to refresh. A minute is frequent enough for that and
 * cheap enough for a single row.
 *
 * It also refetches when the tab regains focus, which covers the common
 * case of a laptop waking up after the resort has reopened.
 *
 * Fails OPEN. A request that errors leaves the previous state alone and, on
 * first load, leaves the site running normally. Blacking out the resort
 * because a fetch failed would turn a blip into an outage.
 */
export function useMaintenance() {
  const [state, setState] = useState<MaintenanceState>(MAINTENANCE_DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      // `cache: no-store` matters: without it the browser can serve a cached
      // "site is open" for the whole poll interval and the switch appears
      // not to work.
      const res = await fetch("/api/maintenance", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { maintenance?: MaintenanceState };
      if (!alive.current || !json.maintenance) return;
      setState(json.maintenance);
    } catch {
      // Keep whatever we last knew.
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();

    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      alive.current = false;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  /** Applied straight after an admin save so the tab reflects the change
   *  immediately instead of waiting out the poll. */
  const apply = useCallback((next: MaintenanceState) => setState(next), []);

  return { maintenance: state, maintenanceLoaded: loaded, refreshMaintenance: refresh, applyMaintenance: apply };
}
