"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Collection } from "@/lib/collections";

/**
 * usePersistedState, but backed by Supabase through the API routes.
 *
 * Drop-in for the old hook: it still returns [state, setState] with the same
 * semantics, so none of the 35 call sites that do setX(p => ...) had to
 * change. What is added is:
 *
 *   1. localStorage stays as a first-paint cache. The very first render uses
 *      the cached array so the page does not flash empty, exactly as before.
 *   2. After mount, the real list is fetched and replaces that cache.
 *   3. Any later change is diffed against the previous array and pushed to
 *      the server by the collection's own sync function.
 *
 * Three guards, each protecting against a specific way this could destroy
 * data rather than save it:
 *
 *   - Writes are blocked until a load has SUCCEEDED. Without this, a failed
 *     fetch would leave state holding the hardcoded INIT_* constants, and the
 *     first edit would diff against those and delete every real row that is
 *     not in them.
 *   - Applying the server's list does not itself trigger a write, or hydration
 *     would immediately echo the data back and every reload would rewrite the
 *     whole table.
 *   - A load that fails leaves the cache in place and simply stays read-only,
 *     so the app keeps working offline instead of showing an empty resort.
 */
export function useDbCollection<T>(
  collection: Collection<T>,
  initial: T[],
  /** Admin-only collections stay untouched until someone is signed in. */
  enabled = true,
) {
  const { key, load, sync, adminOnly } = collection;

  // The first render must use `initial` on BOTH server and client. Reading
  // localStorage here (as this used to) made the browser's first render
  // differ from the server HTML whenever the cache held anything other than
  // the INIT_* constants — a hydration error on every page that reads the
  // collection. The cache is applied in an effect right after mount instead.
  const [state, setState] = useState<T[]>(initial);

  /** True once the server's version has been applied at least once. Until
   *  then this hook will not write anything back. */
  const liveRef = useRef(false);

  /**
   * Whether the first fetch for this collection is still in flight.
   *
   * Exposed so a skeleton can mean something. Before this, every page
   * rendered the hardcoded INIT_* constants the instant it mounted and
   * swapped them for real rows a moment later — a visitor was shown invented
   * data presented as fact, and the route-level skeletons only ever covered
   * the navigation, which for these client pages is near zero.
   *
   * Goes false when the request SETTLES, success or failure. A collection
   * that cannot reach the API falls back to its cache and stops loading,
   * rather than showing a skeleton for ever.
   */
  /** The array the server currently believes in, used as the diff base. */
  const baseRef = useRef<T[]>(state);
  /** Set while applying a server response so the sync effect skips that pass. */
  const applyingRef = useRef(false);
  /** Serialises writes: two quick edits must not race each other. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const active = enabled && (!adminOnly || enabled);
  const [loading, setLoading] = useState(active);

  /**
   * True once `state` holds something real — the localStorage cache or the
   * server's rows — rather than the hardcoded `initial` seed.
   *
   * A skeleton keyed on `loading` alone would show on every single visit,
   * including the common one where the cache is warm and the page can paint
   * real content immediately. Keyed on `loading && !hydrated` it appears
   * only when there is genuinely nothing honest to show yet — one frame with
   * a warm cache, the full fetch when there is none.
   */
  const [hydrated, setHydrated] = useState(false);

  /** False until the localStorage cache has been read. Until then the
   *  mirror effect below must not write, or its very first pass would
   *  overwrite the cache with `initial` before it is ever read. */
  const cacheReadRef = useRef(false);

  // ── Apply the localStorage cache (first paint after hydration) ────
  // Declared before the load and mirror effects so it runs first.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as T[];
        // Not a user edit: the sync effect must skip this render. The cache
        // is also not proof of what the server holds, so liveRef stays false.
        applyingRef.current = true;
        baseRef.current = parsed;
        setState(parsed);
        setHydrated(true);
      }
    } catch {
      // Unreadable cache: keep `initial`.
    }
    cacheReadRef.current = true;
  }, [key]);

  // ── Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    setLoading(true);
    (async () => {
      const rows = await load();
      if (cancelled) return;
      if (rows === null) {
        // Could not load: keep the cache and stay read-only, but stop
        // claiming to be loading or the skeleton would never clear.
        setLoading(false);
        return;
      }
      applyingRef.current = true;
      baseRef.current = rows;
      liveRef.current = true;
      setState(rows);
      setHydrated(true);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [active, load]);

  // ── Mirror to localStorage, and push changes up ───────────────────
  const firstMirrorRef = useRef(true);
  useEffect(() => {
    // The mount pass still holds `initial`, not the cache — skip it so the
    // cache survives to be applied by the effect above.
    if (firstMirrorRef.current) { firstMirrorRef.current = false; return; }
    if (!cacheReadRef.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Quota or private mode. In-memory state still works for this session.
    }

    if (applyingRef.current) {
      // This render came from the server, not from a user edit.
      applyingRef.current = false;
      return;
    }
    if (!liveRef.current) return; // never write against an unverified base

    const prev = baseRef.current;
    const next = state;
    if (prev === next) return;

    queueRef.current = queueRef.current.then(async () => {
      const reconciled = await sync(prev, next);
      baseRef.current = reconciled;
      // sync returns the list with any server-assigned ids filled in. Only
      // re-render when that actually differs, or this loops forever.
      if (JSON.stringify(reconciled) !== JSON.stringify(next)) {
        applyingRef.current = true;
        setState(reconciled);
      }
    });
  }, [state, key, sync]);

  // Cross-tab sync, carried over from usePersistedState: an admin editing in
  // one tab updates an open customer tab without a refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        applyingRef.current = true;
        const parsed = JSON.parse(e.newValue) as T[];
        baseRef.current = parsed;
        setState(parsed);
      } catch {
        // Ignore malformed writes from elsewhere.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const setter = useCallback<React.Dispatch<React.SetStateAction<T[]>>>((v) => setState(v), []);

  // A third element rather than a new shape, so every existing
  // `const [x, setX] = useDbCollection(...)` call site keeps working.
  // ── Refresh from the server ───────────────────────────────────────
  // Used two ways: on demand, after a server route changed rows directly
  // (a check-out completes a booking without going through this hook), and
  // on a timer for collections that declare pollMs, so a booking made
  // online appears in the admin panel without a page reload.
  //
  // It never overwrites a local edit that has not reached the server yet:
  // it waits for queued writes, and skips the refresh if the state still
  // differs from the last list the server confirmed.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const reload = useCallback(async () => {
    if (!active || !liveRef.current) return;
    await queueRef.current;
    const rows = await load();
    if (rows === null) return;
    if (JSON.stringify(stateRef.current) !== JSON.stringify(baseRef.current)) return;
    if (JSON.stringify(rows) === JSON.stringify(baseRef.current)) return;
    applyingRef.current = true;
    baseRef.current = rows;
    setState(rows);
  }, [active, load]);

  const pollMs = collection.pollMs;
  useEffect(() => {
    if (!active || !pollMs) return;
    const tick = () => { if (document.visibilityState === "visible") void reload(); };
    const t = setInterval(tick, pollMs);
    window.addEventListener("focus", tick);
    return () => { clearInterval(t); window.removeEventListener("focus", tick); };
  }, [active, pollMs, reload]);

  return [state, setter, { loading: active ? loading : false, hydrated, reload }] as const;
}
