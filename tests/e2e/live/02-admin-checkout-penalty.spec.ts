/**
 * LIVE 2 — Admin check-out with damage-penalty calculation (TC-10, TC-14).
 *
 * Drives the real admin UI against the connected Supabase.
 * Penalty = quantity × rate-list price (+ adjustment, with a reason, floored at 0).
 * The seeded rate is the spec's own (₱350 / pc), so the maths never depends on the owner's price list.
 *
 * The "Complete" action only exists for a Confirmed booking whose date is today or earlier
 * (Asia/Manila), so this spec books TODAY for 1 guest (₱200) with a ₱100 deposit.
 *
 *   2 × ₱350 = ₱700 · adjust −₱100 ("small crack") → ₱600 · balance ₱100 → collect ₱700
 */
import { test, expect } from "@playwright/test";
import { Cleanup, TAG, apiLogin, manilaToday, requireLiveWrites } from "./support";
import { ADMIN, NAV, openTab } from "../helpers";

test.describe.configure({ mode: "serial" });

test.describe("LIVE 2 · admin check-out + damage penalty", () => {
  requireLiveWrites();

  const cleanup = new Cleanup();
  let booking: { id: string; total: number };
  let rate: { id: number; name: string; rate: number };

  test.beforeAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL });
    await apiLogin(admin);
    await cleanup.snapshotFacilities(admin);

    const made = await admin.post("/api/damage-rates", { data: { name: `${TAG} chair`, category: "Furniture", unit: "pc", rate: 350 } });
    expect(made.status(), await made.text()).toBe(201);
    rate = (await made.json()).rate;
    cleanup.rates.add(rate.id);

    const res = await admin.post("/api/bookings", {
      data: {
        name: `${TAG} Checkout`, email: "", contact: "09181234567", date: manilaToday(), endDate: manilaToday(),
        guests: 1, resource: "Pool", tier: "Shared", slot: "Day", rooms: [], overtime: 0,
        initialPayment: { amount: 100, method: "Cash" },
      },
    });
    expect(res.status(), `today must have room for 1 guest: ${await res.text()}`).toBe(201);
    booking = (await res.json()).booking;
    cleanup.bookings.add(booking.id);
    expect(booking.total).toBe(200);
    await admin.dispose();
  });

  test.afterAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL });
    await cleanup.run(admin);
    await admin.dispose();
  });

  test("adjusting without a reason is refused; with one, the bill shows ₱700 and the server stores ₱600 in penalties", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#admin-username").fill(ADMIN.username);
    await page.locator("#admin-password").fill(ADMIN.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/admin");

    await openTab(page, NAV.bookings);
    await page.getByLabel("Search bookings").fill(booking.id);
    await page.getByRole("button", { name: "Complete", exact: true }).first().click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByText(`Complete ${TAG} Checkout's stay`)).toBeVisible();

    // Mark the first facility Damaged → a damage line appears.
    await modal.getByRole("button", { name: "Damaged", exact: true }).first().click();
    await modal.getByLabel("Damaged item").selectOption(String(rate.id));
    await modal.locator('input[type="number"][min="1"]').first().fill("2");

    const collect = modal.getByText("To collect now").locator("..");
    await expect(collect).toContainText("800"); // balance 100 + penalty 700

    // Adjustment needs a reason.
    await modal.getByText("Adjust amount").click();
    await modal.getByLabel("Adjustment").fill("-100");
    const submit = modal.getByRole("button", { name: /^Complete stay/ });
    await submit.click();
    await expect(modal.getByText(/reason for every adjusted penalty/i)).toBeVisible();

    await modal.getByPlaceholder(/^Reason/).fill("small crack, repairable");
    await expect(collect).toContainText("700"); // 100 + (700 − 100)

    const done = page.waitForResponse((r) => r.url().includes("/api/checkout") && r.request().method() === "POST");
    await modal.getByRole("button", { name: /^Complete stay/ }).click();
    const res = await done;
    expect(res.status(), await res.text()).toBe(200);
    expect(JSON.parse(await res.text()).penalty).toBe(600);
  });

  test("database state: booking Completed, damage recorded at the server's price, payments add up, facility flagged", async ({ request }) => {
    await apiLogin(request);
    const got = await (await request.get(`/api/bookings/${booking.id}`)).json();
    expect(got.booking.status).toBe("Completed");

    const ops = await (await request.get("/api/ops")).json();
    const damages = ops.damages as { bookingId: string; quantity: number; amount: number; adjustmentReason?: string }[];
    const mine = damages.filter((d) => d.bookingId === booking.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ quantity: 2, amount: 600 });

    const paid = (got.payments as { amount: number }[]).reduce((s, p) => s + p.amount, 0); // route already excludes voided
    expect(paid).toBe(100 + 700); // deposit + (balance 100 + penalty 600) collected at check-out

    const facilities = (await (await request.get("/api/facilities")).json()).facilities as { id: number; status: string; lastUsedBookingId?: string }[];
    const used = facilities.filter((f) => f.lastUsedBookingId === booking.id);
    expect(used.length).toBeGreaterThan(0);
    expect(used.some((f) => ["Needs Cleaning", "Under Maintenance"].includes(f.status))).toBe(true);
  });

  test("the browser cannot lower a penalty: a forged unit rate is ignored when rateId is given", async ({ request }) => {
    await apiLogin(request);
    // Fresh booking so the one above stays Completed.
    const res = await request.post("/api/bookings", {
      data: { name: `${TAG} Forge`, email: "", contact: "09181234567", date: manilaToday(), endDate: manilaToday(), guests: 1, resource: "Pool", tier: "Shared", slot: "Day", rooms: [], overtime: 0, initialPayment: { amount: 200, method: "Cash" } },
    });
    expect(res.status(), await res.text()).toBe(201);
    const id = (await res.json()).booking.id as string;
    cleanup.bookings.add(id);

    const facilities = (await (await request.get("/api/facilities")).json()).facilities as { id: number; name: string }[];
    const f = facilities[0];
    const out = await request.post("/api/checkout", {
      data: {
        bookingId: id,
        items: [{ facilityId: f.id, facilityName: f.name, checklist: [], condition: "Damaged" }],
        damages: [{ facilityName: f.name, rateId: rate.id, quantity: 3, unitRate: 1, amount: 3 }],
      },
    });
    expect(out.status(), await out.text()).toBe(200);
    expect((await out.json()).penalty).toBe(3 * 350);
  });
});
