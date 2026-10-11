/**
 * LIVE 3 — Calendar synchronisation (TC-01).
 *
 * The public calendar is NOT push-based. usePublicAvailability re-fetches /api/availability
 * on window `focus` and every 2 minutes. "Real-time" here therefore means: a change made by
 * the admin side reaches an already-open guest page on the next focus / poll, with no reload.
 *
 *  1. booking created   → open page shows the date as booked after a focus event
 *  2. booking cancelled → the same page shows it available again
 *  3. no focus at all   → the 2-minute poll alone does it (browser clock fast-forwarded)
 *  4. KNOWN DEFECT (test.fail): a multi-day stay only blocks its FIRST day on the public calendar
 *
 * Needs E2E_ALLOW_WRITES=1.
 */
import { test, expect } from "@playwright/test";
import { Cleanup, TAG, addDays, apiLogin, claimDate, dateCell, focusWindow, openDateStep, requireLiveWrites, setGuests } from "./support";

test.describe.configure({ mode: "serial" });

test.describe("LIVE 3 · calendar synchronisation", () => {
  requireLiveWrites();

  const cleanup = new Cleanup();
  test.afterAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL });
    await cleanup.run(admin);
    await admin.dispose();
  });

  const email = "e2e.sync@gmail.com";

  test("booking → booked on an open page after focus; cancel → available again", async ({ page, request }) => {
    await apiLogin(request);
    // Find a date that is free for 5 guests today by probing with the server's own rules, then release it.
    const probe = await claimDate(request, cleanup, { name: `${TAG} Probe`, guests: 1 });
    await request.delete(`/api/bookings/${probe.id}`);
    cleanup.bookings.delete(probe.id);

    await openDateStep(page);
    await setGuests(page, 5);
    const cell = await dateCell(page, probe.date);
    await expect(cell).toHaveAttribute("aria-label", /available/);

    // Admin side: a full-day exclusive booking takes the date.
    const made = await request.post("/api/bookings", {
      data: { name: `${TAG} Sync`, email, contact: "09181234567", date: probe.date, endDate: probe.date, guests: 30, resource: "Pool", tier: "Exclusive", slot: "WholeDay", rooms: [], overtime: 0, initialPayment: { amount: 100, method: "Cash" } },
    });
    expect(made.status(), await made.text()).toBe(201);
    const id = (await made.json()).booking.id as string;
    cleanup.bookings.add(id);

    // Not reloaded; only the focus event the app listens for.
    await expect(async () => {
      await focusWindow(page);
      await expect(cell).toHaveAttribute("aria-label", /booked/, { timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(cell).toBeDisabled();

    // Guest cancels with reference + email → the date reopens.
    const cancel = await request.post(`/api/bookings/${id}/cancel`, { data: { email, reason: `${TAG}` } });
    expect(cancel.status(), await cancel.text()).toBe(200);

    await expect(async () => {
      await focusWindow(page);
      await expect(cell).toHaveAttribute("aria-label", /available/, { timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(cell).toBeEnabled();
  });

  test("with no focus event, the 2-minute poll alone refreshes the calendar", async ({ page, request }) => {
    await apiLogin(request);
    await page.clock.install();
    await openDateStep(page);
    await setGuests(page, 5);

    const b = await claimDate(request, cleanup, { name: `${TAG} Poll`, guests: 30, tier: "Exclusive", slot: "WholeDay", email }, { startOffset: 50 });
    const cell = await dateCell(page, b.date);
    await expect(cell).toHaveAttribute("aria-label", /available|booked/); // may already show the new booking if the page refetched

    await page.clock.fastForward(2 * 60 * 1000 + 1_000);
    await expect(cell).toHaveAttribute("aria-label", /booked/, { timeout: 10_000 });
  });

  test("KNOWN DEFECT: days 2–3 of a multi-day stay show as available on the public calendar", async ({ request }) => {
    test.fail(true, "/api/availability selects `date` but not `end_date`, and usePublicAvailability maps only `date`. Remove this line once fixed.");
    await apiLogin(request);
    const b = await claimDate(request, cleanup, { name: `${TAG} Multi`, guests: 30, tier: "Exclusive", slot: "WholeDay", email }, { nights: 3, startOffset: 56 });
    const slots = (await (await request.get("/api/availability")).json()).slots as { date: string }[];
    for (const n of [0, 1, 2]) {
      const d = addDays(b.date, n);
      expect(slots.some((s) => s.date === d), `${d} (day ${n + 1} of the stay) is held in /api/availability`).toBe(true);
    }
  });

  test("…while the server still refuses the unseen days at QR time (the guest just learns late)", async ({ request }) => {
    await apiLogin(request);
    const b = await claimDate(request, cleanup, { name: `${TAG} Multi2`, guests: 30, tier: "Exclusive", slot: "WholeDay", email }, { nights: 3, startOffset: 62 });
    const res = await request.post("/api/payment", {
      data: { draft: { resource: "Pool", tier: "Shared", slot: "Day", guests: 2, rooms: [], overtime: 0, date: addDays(b.date, 1), endDate: addDays(b.date, 1), name: `${TAG} Late`, email, contact: "09171234567", notes: "", payFull: false } },
    });
    expect(res.status()).toBe(409);
  });
});
