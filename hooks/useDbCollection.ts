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
  /** The array the server currently believes in, used as the diff base. */
  const baseRef = useRef<T[]>(state);
  /** Set while applying a server response so the sync effect skips that pass. */
  const applyingRef = useRef(false);
  /** Serialises writes: two quick edits must not race each other. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const active = enabled && (!adminOnly || enabled);

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

    (async () => {
      const rows = await load();
      if (cancelled || rows === null) return; // null = could not load; keep cache, stay read-only
      applyingRef.current = true;
      baseRef.current = rows;
      liveRef.current = true;
      setState(rows);
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

  return [state, setter] as const;
}
