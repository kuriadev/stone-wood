/**
 * Shared plumbing for the LIVE specs (real Supabase, PayMongo test key, no mocks).
 *
 * Safety model
 *  - Nothing runs unless E2E_ALLOW_WRITES=1. These specs create and delete rows in the database
 *    the target app is connected to.
 *  - Every row is tagged "E2E-<runId>" in the guest name, so strays are easy to find.
 *  - Every booking / damage rate / facility change is registered in `Cleanup` and undone in
 *    afterAll, even when the test failed.
 *  - Dates are taken 30–75 days out (inside the booking window), away from real traffic.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN, apiLogin, day } from "../helpers";

export { ADMIN, apiLogin, day };

export const RUN_ID = Date.now().toString(36).slice(-6).toUpperCase();
export const TAG = `E2E-${RUN_ID}`;
export const GUEST_EMAIL = process.env.E2E_GUEST_EMAIL ?? "e2e.tester@gmail.com";

/** Call at the top of every live describe. */
export function requireLiveWrites() {
  test.skip(
    process.env.E2E_ALLOW_WRITES !== "1",
    "Live specs write to the connected Supabase. Set E2E_ALLOW_WRITES=1 to run them.",
  );
}

/** Today in the resort's timezone (the app gates "Complete" on this, not on the runner's clock). */
export const manilaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface Created { id: string; total: number; status: string; date: string }

/**
 * Creates a walk-in on the first date (30..75 days out, 4-day stride) that the server accepts.
 * The server's own capacity / closed-date checks decide, so this needs no knowledge of the data.
 */
export async function claimDate(
  request: APIRequestContext,
  cleanup: Cleanup,
  body: Record<string, unknown>,
  { nights = 1, startOffset = 30 }: { nights?: number; startOffset?: number } = {},
): Promise<Created> {
  for (let off = startOffset; off <= 75; off += 4) {
    const date = day(off);
    const res = await request.post("/api/bookings", {
      data: { contact: "09181234567", email: "", rooms: [], overtime: 0, resource: "Pool", tier: "Shared", slot: "Day", guests: 5, ...body, date, endDate: day(off + nights - 1) },
    });
    if (res.status() === 201) {
      const b = (await res.json()).booking as Created;
      cleanup.bookings.add(b.id);
      return { ...b, date };
    }
    if (![400, 409].includes(res.status())) throw new Error(`walk-in failed ${res.status()}: ${await res.text()}`);
  }
  throw new Error("No free date found in the booking window for this scenario.");
}

type FacilityRow = { id: number; name: string; status: string; lastUsedBookingId?: string | null; lastUsedGuestName?: string | null };

/** Records everything a spec touched so afterAll can put the database back. */
export class Cleanup {
  bookings = new Set<string>();
  rates = new Set<number>();
  facilities = new Map<number, FacilityRow>();

  async snapshotFacilities(request: APIRequestContext) {
    const res = await request.get("/api/facilities");
    expect(res.status(), "GET /api/facilities needs an admin session").toBe(200);
    for (const f of (await res.json()).facilities as FacilityRow[]) this.facilities.set(f.id, f);
  }

  async run(request: APIRequestContext) {
    const problems: string[] = [];
    try { await apiLogin(request); } catch { problems.push("admin login failed — nothing could be cleaned"); }

    // The booking route returns payments without ids; the ledger (/api/ops) has them.
    const ledger = ((await (await request.get("/api/ops")).json().catch(() => ({})))?.payments ?? []) as { id: number | string; bookingId?: string; voided?: boolean }[];
    for (const id of this.bookings) {
      try {
        for (const p of ledger.filter((x) => x.bookingId === id && !x.voided)) {
          await request.patch(`/api/payments?id=${p.id}`, { data: { reason: `${TAG} test cleanup` } });
        }
        const del = await request.delete(`/api/bookings/${id}`);
        if (del.status() !== 200) problems.push(`booking ${id}: DELETE ${del.status()}`);
      } catch (e) { problems.push(`booking ${id}: ${(e as Error).message}`); }
    }
    for (const id of this.rates) {
      const r = await request.delete(`/api/damage-rates?id=${id}`).catch(() => null);
      if (!r || r.status() >= 400) problems.push(`damage rate ${id} not removed`);
    }
    for (const f of this.facilities.values()) {
      await request.patch(`/api/facilities?id=${f.id}`, {
        data: { status: f.status, lastUsedBookingId: f.lastUsedBookingId ?? null, lastUsedGuestName: f.lastUsedGuestName ?? null },
      }).catch(() => null);
    }
    if (problems.length) console.warn(`[${TAG}] cleanup left behind:\n - ${problems.join("\n - ")}\n   Search the admin panel for "${TAG}".`);
  }
}

/** Guest wizard helpers (components/sections/BookNow.tsx). */
export const cont = (page: Page) => page.getByRole("button", { name: /^CONTINUE/ });

export async function setGuests(page: Page, n: number) {
  const fewer = page.getByRole("button", { name: "Fewer guests" });
  const more = page.getByRole("button", { name: "More guests" });
  while (await fewer.isEnabled()) await fewer.click();
  for (let i = 1; i < n; i++) await more.click();
}

/** Pages the date picker forward until the date's cell exists, then returns it. */
export async function dateCell(page: Page, ymd: string) {
  const cell = page.locator(`button[aria-label^="${ymd} "]`);
  for (let i = 0; i < 4 && !(await cell.count()); i++) await page.getByRole("button", { name: "Next month" }).first().click();
  await expect(cell, `calendar cell for ${ymd}`).toHaveCount(1);
  return cell;
}

/** Opens /book and moves from "Choose your visit" (step 1) to the date + guests step. */
export async function openDateStep(page: Page) {
  await page.goto("/book");
  await expect(page.getByText("Choose your visit")).toBeVisible();
  await cont(page).click();
  await expect(page.locator("#booknow-date-label")).toBeAttached();
}

/** Same as the app: a focus event is what makes the public hook re-fetch /api/availability. */
export const focusWindow = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));
