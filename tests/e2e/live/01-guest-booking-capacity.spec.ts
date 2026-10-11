/**
 * LIVE 1 — Guest booking flow with capacity validation (TC-03, TC-04, TC-05).
 *
 * Real Supabase, real PayMongo TEST key. No webhook is involved: the app polls PayMongo
 * itself, so the flow is exercised up to the QR and, optionally, through payment.
 *
 * Needs: E2E_ALLOW_WRITES=1 (+ E2E_ADMIN_USER / E2E_ADMIN_PASS for the seed + cleanup).
 * Optional: E2E_PAY_VIA_TEST_URL=1 follows PayMongo's "simulate payment" link and checks that the
 *           booking is stored (this sends the guest confirmation email to E2E_GUEST_EMAIL).
 *
 * Capacity rule under test: 30 shared guests per slot; Day and Night are independent.
 */
import { test, expect } from "@playwright/test";
import { Cleanup, GUEST_EMAIL, TAG, apiLogin, claimDate, cont, dateCell, openDateStep, requireLiveWrites, setGuests } from "./support";

test.describe.configure({ mode: "serial" });

test.describe("LIVE 1 · guest booking + capacity", () => {
  requireLiveWrites();

  const cleanup = new Cleanup();
  let seeded: { id: string; date: string };

  test.beforeAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL });
    await apiLogin(admin);
    // 25 of the 30 shared Day seats on a free date → exactly 5 seats left.
    seeded = await claimDate(admin, cleanup, { name: `${TAG} Seed`, guests: 25, initialPayment: { amount: 100, method: "Cash" } });
    await admin.dispose();
  });

  test.afterAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL });
    await cleanup.run(admin);
    await admin.dispose();
  });

  const draft = (o: Record<string, unknown> = {}) => ({
    resource: "Pool", tier: "Shared", slot: "Day", guests: 5, rooms: [], overtime: 0,
    date: seeded.date, endDate: seeded.date, name: `${TAG} Guest`, email: GUEST_EMAIL, contact: "09171234567", notes: "", payFull: false, ...o,
  });

  test("server: over capacity is refused before any QR is minted; the exact remainder is accepted", async ({ request }) => {
    const over = await request.post("/api/payment", { data: { draft: draft({ guests: 6 }) } });
    expect(over.status()).toBe(409);
    expect((await over.json()).error).toMatch(/capacity|full|taken|available/i);

    const exact = await request.post("/api/payment", { data: { draft: draft({ guests: 5, total: 1, down: 1 }) } }); // client numbers are ignored
    expect(exact.status(), await exact.text()).toBe(200);
    const { quote, payment } = await exact.json();
    expect(quote).toMatchObject({ total: 1000, down: 500, dueNow: 500 });
    expect(payment).toBeTruthy();
  });

  test("server: Night is an independent slot on the same date", async ({ request }) => {
    const night = await request.post("/api/payment", { data: { draft: draft({ slot: "Night", guests: 10 }) } });
    expect(night.status(), await night.text()).toBe(200);
  });

  test("server: a booking cannot be created without a PayMongo payment", async ({ request }) => {
    const res = await request.post("/api/bookings", { data: { draft: draft(), paymentIntentId: "pi_does_not_exist" } });
    expect([402, 404, 500]).toContain(res.status());
    const rows = await (await request.get("/api/availability")).json();
    const onDate = (rows.slots as { date: string; guests: number }[]).filter((s) => s.date === seeded.date);
    expect(onDate.reduce((n, s) => n + s.guests, 0)).toBe(25); // nothing was added
  });

  test("UI: the calendar blocks a group that does not fit, then lets a group of 5 through to a QR", async ({ page }) => {
    await openDateStep(page);

    await setGuests(page, 10);
    const cell = await dateCell(page, seeded.date);
    await expect(cell).toHaveAttribute("aria-label", /booked/);
    await expect(cell).toBeDisabled();

    await setGuests(page, 5);
    await expect(cell).toHaveAttribute("aria-label", /available/);
    await cell.click();
    await cont(page).click();

    // Step 4 (room add-on): keep "No room needed".
    if (await page.getByText("No room needed").isVisible().catch(() => false)) await cont(page).click();

    await page.getByPlaceholder("Juan Dela Cruz").fill(`${TAG} Guest`);
    await page.getByPlaceholder("example@email.com").fill(GUEST_EMAIL);
    await page.getByPlaceholder("09XXXXXXXXX").fill("09171234567");
    await page.getByRole("button", { name: /REVIEW PAYMENT POLICY/ }).click();
    await page.locator("#gcash-policy-ack").click();

    const minted = page.waitForResponse((r) => r.url().includes("/api/payment") && r.request().method() === "POST");
    await page.getByRole("button", { name: /AGREE AND CONTINUE/ }).click();
    const res = await minted;
    expect(res.status()).toBe(200);
    const { quote } = await res.json();
    expect(quote).toMatchObject({ total: 1000, dueNow: 500 });

    await expect(page.getByText(/\b500\b/).first()).toBeVisible();   // amount the guest is asked to pay
    await expect(page.locator("main img, [role=main] img, img[alt*='QR' i]").first()).toBeVisible();
  });

  test("optional: pay through PayMongo's test link → booking is stored and holds the seats", async ({ page, request, context }) => {
    test.skip(process.env.E2E_PAY_VIA_TEST_URL !== "1", "Set E2E_PAY_VIA_TEST_URL=1 to simulate the PayMongo payment.");
    await apiLogin(request);

    await openDateStep(page);
    await setGuests(page, 5);
    await (await dateCell(page, seeded.date)).click();
    await cont(page).click();
    if (await page.getByText("No room needed").isVisible().catch(() => false)) await cont(page).click();
    await page.getByPlaceholder("Juan Dela Cruz").fill(`${TAG} Payer`);
    await page.getByPlaceholder("example@email.com").fill(GUEST_EMAIL);
    await page.getByPlaceholder("09XXXXXXXXX").fill("09171234567");
    await page.getByRole("button", { name: /REVIEW PAYMENT POLICY/ }).click();
    await page.locator("#gcash-policy-ack").click();
    await page.getByRole("button", { name: /AGREE AND CONTINUE/ }).click();

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: /TEST MODE/ }).click(),
    ]);
    await popup.getByRole("button", { name: /authorize|pay|success/i }).first().click(); // PayMongo-hosted page, not ours
    await popup.close();

    await expect(page.getByText("Payment received")).toBeVisible({ timeout: 60_000 }); // app polls PayMongo; no webhook
    const list = await (await request.get("/api/bookings")).json();
    const mine = (list.bookings as { id: string; name: string; status: string; guests: number }[]).find((b) => b.name === `${TAG} Payer`);
    expect(mine, "booking stored after payment").toBeTruthy();
    cleanup.bookings.add(mine!.id);
    expect(mine).toMatchObject({ status: "Confirmed", guests: 5 });

    // Date is now full (25 + 5): the same group size can no longer get a QR.
    const again = await request.post("/api/payment", { data: { draft: draft({ guests: 1 }) } });
    expect(again.status()).toBe(409);
  });
});
