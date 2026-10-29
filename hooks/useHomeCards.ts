"use client";

// The Home price cards staff saved, or null for the automatic ones.
//
// The last answer is kept in localStorage so a returning visitor's page
// paints the saved cards straight away; the network answer then replaces it.
// The section sits well below the fold, so a first visit has loaded long
// before anyone scrolls to it.

import { useCallback, useEffect, useState } from "react";
import { validateHomeCards, type HomeCard } from "@/lib/homeCards";

const KEY = "sw_home_cards";

export interface HomeCardsState {
  /** Saved cards, or null when Home should show the automatic ones. */
  cards: HomeCard[] | null;
  /** False until the site_content table exists (nothing can be saved). */
  ready: boolean;
  loaded: boolean;
  reload: () => Promise<void>;
}

function fromCache(): HomeCard[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = validateHomeCards(JSON.parse(raw));
    return v.ok ? v.cards : null;
  } catch {
    return null;
  }
}

export function useHomeCards(): HomeCardsState {
  const [cards, setCards] = useState<HomeCard[] | null>(null);
  const [ready, setReady] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/site-content/home-cards");
      if (!res.ok) return;
      const j = (await res.json()) as { cards?: unknown; ready?: boolean };
      const v = j.cards ? validateHomeCards(j.cards) : null;
      const next = v && v.ok ? v.cards : null;
      setCards(next);
      setReady(j.ready !== false);
      try {
        if (next) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
      } catch { /* private mode: no cache, still correct */ }
    } catch {
      /* offline: keep whatever is showing */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // After mount, not during render: the server rendered the automatic
    // cards, and reading storage first would mismatch hydration.
    const cached = fromCache();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one paint from the cache, after hydration; see above
    if (cached) setCards(cached);
    void reload();
  }, [reload]);

  return { cards, ready, loaded, reload };
}
