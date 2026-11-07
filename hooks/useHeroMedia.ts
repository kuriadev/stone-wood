"use client";

// The hero background staff set (lib/heroMedia.ts), or null for the built-in
// photo. The last answer is kept in localStorage so a returning visitor's
// hero paints the right background straight away.

import { useCallback, useEffect, useState } from "react";
import { validateHeroMedia, type HeroMedia } from "@/lib/heroMedia";

const KEY = "sw_hero_media";

function fromCache(): HeroMedia | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = validateHeroMedia(JSON.parse(raw));
    return v.ok ? v.media : null;
  } catch {
    return null;
  }
}

/** `initial`: what the server already read (the home page passes it), so the
 *  first paint is the right hero and no second photo is fetched. Undefined
 *  when the server couldn't say; the cache and a fetch decide then. */
export function useHeroMedia(initial?: HeroMedia | null): { media: HeroMedia | null; ready: boolean; loaded: boolean; reload: () => Promise<void> } {
  const known = initial !== undefined;
  const [media, setMedia] = useState<HeroMedia | null>(known ? initial : null);
  const [ready, setReady] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/site-content/hero", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { media?: unknown; ready?: boolean };
      const v = j.media ? validateHeroMedia(j.media) : null;
      const next = v && v.ok ? v.media : null;
      setMedia(next);
      setReady(j.ready !== false);
      try {
        if (next) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
      } catch { /* private mode */ }
    } catch {
      /* offline: keep what is showing */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // The server's answer is current (saving a new hero refreshes the page),
    // so there is nothing to look up.
    if (known) return;
    const cached = fromCache();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (cached) setMedia(cached);
    void reload();
  }, [reload, known]);

  return { media, ready, loaded, reload };
}
