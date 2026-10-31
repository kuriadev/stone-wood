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

export function useHeroMedia(): { media: HeroMedia | null; ready: boolean; loaded: boolean; reload: () => Promise<void> } {
  const [media, setMedia] = useState<HeroMedia | null>(null);
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
    const cached = fromCache();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (cached) setMedia(cached);
    void reload();
  }, [reload]);

  return { media, ready, loaded, reload };
}
