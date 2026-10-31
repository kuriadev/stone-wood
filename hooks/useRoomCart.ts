"use client";

// The rooms a guest added with "Add to booking", before they book.
//
// Kept in localStorage so the choice follows them from the Rooms page to
// the home page to Book Now (and survives a reload), and announced with a
// window event so every place that shows it updates at once. Book Now
// starts its room step with these rooms selected, keeps the list in step
// with what is picked there, and empties it once the booking is made.

import { useSyncExternalStore } from "react";

const KEY = "sw_room_cart";
const EVENT = "sw-room-cart";
const EMPTY: number[] = [];

let cache: { raw: string | null; ids: number[] } = { raw: null, ids: EMPTY };

function read(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.ids;
    const parsed = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? [...new Set(parsed.map(Number).filter((n) => Number.isFinite(n)))] : EMPTY;
    cache = { raw, ids };
    return ids;
  } catch {
    return EMPTY;
  }
}

function write(ids: number[]) {
  try {
    if (ids.length) localStorage.setItem(KEY, JSON.stringify(ids));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: lasts this page view */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(on: () => void) {
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
}

/** The room ids added to the guest's booking, live. */
export function useRoomCart(): number[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const roomCart = {
  get: read,
  add(id: number) { const ids = read(); if (!ids.includes(id)) write([...ids, id]); },
  remove(id: number) { write(read().filter((x) => x !== id)); },
  set(ids: number[]) { write([...new Set(ids)]); },
  clear() { write([]); },
};
