// ── How each AppContext collection maps onto the API
//
// AppContext exposes plain React setters, and all 35 call sites in the app
// mutate them functionally: p => [...p, x], p.map(...), p.filter(...). None
// of them say *what* changed, only what the array now looks like.
//
// So rather than rewrite every call site to call an endpoint (30+ files of
// regression risk), each collection declares how to LOAD itself and how to
// SYNC a previous array against the next one. useDbCollection diffs the two
// and issues the right requests. The components stay exactly as they are.

import type { Booking } from "@/types/booking";
import type { Room } from "@/types/room";
import type { ResortPackage } from "@/types/package";
import type { InventoryItem } from "@/types/inventory";
import type { Facility } from "@/types/facility";
import type { CustomerMessage } from "@/types/admin";

/** A request that failed is never treated as "the server says empty" — that
 *  distinction is what stops a dropped connection from looking like a delete
 *  of every row. null means "could not load", never "loaded nothing". */
async function getJson<T>(
  url: string,
  pick: (j: Record<string, unknown>) => T | undefined,
): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const value = pick(json);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

async function send(
  url: string,
  method: string,
  body?: unknown,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface Collection<T> {
  /** localStorage key, kept as an instant-paint cache and offline fallback. */
  key: string;
  /** Fetch the authoritative list. null on any failure. */
  load: () => Promise<T[] | null>;
  /** Push the difference between two arrays. Returns the list to keep in
   *  state, which may differ from `next`: a freshly created row comes back
   *  with the database's real id rather than the temporary Date.now() one
   *  the UI invented. */
  sync: (prev: T[], next: T[]) => Promise<T[]>;
  /** Only hydrate when signed in. Admin-only endpoints 401 for guests, and a
   *  401 would otherwise read as "could not load" on every public page. */
  adminOnly?: boolean;
  /** Re-fetch on this interval while the page is visible, so changes made
   *  elsewhere (a guest booking online) show up without a reload. */
  pollMs?: number;
}

/** Diff two id-keyed arrays and post/patch/delete the difference. */
function idDiff<T extends { id: number | string }>(
  endpoint: string,
  pickCreated: (j: Record<string, unknown>) => T | undefined,
) {
  return async (prev: T[], next: T[]): Promise<T[]> => {
    const prevById = new Map(prev.map((x) => [x.id, x]));
    const nextById = new Map(next.map((x) => [x.id, x]));
    const reconciled = [...next];

    // Deletions first: doing them last would let a create-then-delete in the
    // same tick remove the wrong row if ids were reused.
    for (const old of prev) {
      if (!nextById.has(old.id)) await send(endpoint + "?id=" + old.id, "DELETE");
    }

    for (let i = 0; i < reconciled.length; i++) {
      const item = reconciled[i];
      const before = prevById.get(item.id);

      if (!before) {
        const created = await send(endpoint, "POST", item);
        const row = created ? pickCreated(created) : undefined;
        // Swap the temporary id for the database's real one, or the next
        // edit would patch an id that does not exist.
        if (row) reconciled[i] = row;
        continue;
      }
      if (JSON.stringify(before) !== JSON.stringify(item)) {
        await send(endpoint + "?id=" + item.id, "PATCH", item);
      }
    }
    return reconciled;
  };
}

export const COLLECTIONS = {
  rooms: {
    key: "sw_rooms",
    load: () => getJson<Room[]>("/api/rooms", (j) => j.rooms as Room[] | undefined),
    sync: idDiff<Room>("/api/rooms", (j) => j.room as Room | undefined),
  } satisfies Collection<Room>,

  packages: {
    key: "sw_packages",
    load: () =>
      getJson<ResortPackage[]>("/api/packages", (j) => j.packages as ResortPackage[] | undefined),
    sync: idDiff<ResortPackage>("/api/packages", (j) => j.package as ResortPackage | undefined),
  } satisfies Collection<ResortPackage>,

  inventory: {
    key: "sw_inventory",
    adminOnly: true,
    load: () =>
      getJson<InventoryItem[]>("/api/inventory", (j) => j.inventory as InventoryItem[] | undefined),
    sync: idDiff<InventoryItem>("/api/inventory", (j) => j.item as InventoryItem | undefined),
  } satisfies Collection<InventoryItem>,

  facilities: {
    key: "sw_facilities",
    adminOnly: true,
    pollMs: 30_000,
    load: () =>
      getJson<Facility[]>("/api/facilities", (j) => j.facilities as Facility[] | undefined),
    // Facilities are never created or deleted from the UI, only updated, so
    // this patches changed rows and does nothing else.
    sync: async (prev: Facility[], next: Facility[]) => {
      const prevById = new Map(prev.map((f) => [f.id, f]));
      for (const f of next) {
        const before = prevById.get(f.id);
        if (before && JSON.stringify(before) !== JSON.stringify(f)) {
          await send("/api/facilities?id=" + f.id, "PATCH", f);
        }
      }
      return next;
    },
  } satisfies Collection<Facility>,

  bookings: {
    key: "sw_bookings",
    adminOnly: true,
    // New online bookings and PayMongo payments arrive without the admin
    // doing anything, so the panel checks for them every 15 seconds.
    pollMs: 15_000,
    load: () => getJson<Booking[]>("/api/bookings", (j) => j.bookings as Booking[] | undefined),
    // Only the admin panel writes through here (walk-ins, status changes,
    // archiving). The database assigns every booking reference, so a new
    // walk-in arrives with a temporary id and is swapped for the real one —
    // otherwise the next status change would patch an id that doesn't exist.
    sync: async (prev: Booking[], next: Booking[]) => {
      const prevById = new Map(prev.map((b) => [b.id, b]));
      const nextIds = new Set(next.map((b) => b.id));
      const reconciled = [...next];
      for (const old of prev) {
        if (!nextIds.has(old.id)) {
          await send("/api/bookings/" + encodeURIComponent(old.id), "DELETE");
        }
      }
      for (let i = 0; i < reconciled.length; i++) {
        const b = reconciled[i];
        const before = prevById.get(b.id);
        if (!before) {
          const created = await send("/api/bookings", "POST", b);
          const saved = created?.booking as Booking | undefined;
          if (saved) reconciled[i] = saved;
        } else if (JSON.stringify(before) !== JSON.stringify(b)) {
          await send("/api/bookings/" + encodeURIComponent(b.id), "PATCH", b);
        }
      }
      return reconciled;
    },
  } satisfies Collection<Booking>,

  customerMessages: {
    key: "sw_customer_messages",
    adminOnly: true,
    load: () =>
      getJson<CustomerMessage[]>("/api/customer-service", (j) =>
        Array.isArray(j) ? (j as unknown as CustomerMessage[]) : undefined,
      ),
    // Guests create these through the public form, and the admin only
    // archives them, so archive state is the one thing pushed back.
    sync: async (prev: CustomerMessage[], next: CustomerMessage[]) => {
      const prevById = new Map(prev.map((m) => [m.id, m]));
      for (const m of next) {
        const before = prevById.get(m.id);
        if (before && !!before.archivedAt !== !!m.archivedAt) {
          await send("/api/customer-service?id=" + m.id, "PATCH", { archived: !!m.archivedAt });
        }
      }
      return next;
    },
  } satisfies Collection<CustomerMessage>,

  gallery: {
    key: "sw_gallery",
    load: () => getJson<string[]>("/api/gallery", (j) => j.gallery as string[] | undefined),
    // A plain list of urls with no ids: replacing it wholesale is simpler and
    // safer than trying to patch positions one row at a time.
    sync: async (_prev: string[], next: string[]) => {
      if (next.length > 0) await send("/api/gallery", "PUT", { gallery: next });
      return next;
    },
  } satisfies Collection<string>,

  closedDates: {
    key: "sw_closed_dates",
    load: () =>
      getJson<string[]>("/api/closed-dates", (j) => j.closedDates as string[] | undefined),
    sync: async (prev: string[], next: string[]) => {
      const before = new Set(prev);
      const after = new Set(next);
      for (const d of prev) {
        if (!after.has(d)) await send("/api/closed-dates?date=" + encodeURIComponent(d), "DELETE");
      }
      for (const d of next) {
        if (!before.has(d)) await send("/api/closed-dates", "POST", { date: d });
      }
      return next;
    },
  } satisfies Collection<string>,
};
