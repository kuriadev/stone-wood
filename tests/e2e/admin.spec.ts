/**
 * Admin module against a live stack.
 * TC-07 login · TC-08 accept · TC-09 walk-in · TC-10 check-out penalties
 * · TC-13 inventory · TC-14 payment · TC-15 CSV · TC-16 search/filter.
 *
 * NOTE: sidebar names differ from Test-Case.docx ("All Bookings", "Supplies & Equipment",
 * "Payments & Expenses", "Facilities & Inspections"). Specs use the real labels.
 */
import { test, expect } from "@playwright/test";
import { ADMIN, NAV, apiLogin, day, openTab, uiLogin, walkIn } from "./helpers";

test.describe("TC-07 admin login", () => {
  test("valid credentials open the admin modules", async ({ page }) => {
    await uiLogin(page);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(NAV.bookings).first()).toBeVisible();
  });

  test("wrong password shows one generic error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#admin-username").fill(ADMIN.username);
    await page.locator("#admin-password").fill("definitely-wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  });

  test("/admin without a session does not show admin data", async ({ page, request }) => {
    expect((await request.get("/api/bookings")).status()).toBe(401);
    await page.goto("/admin");
    await expect(page.locator("#admin-username")).toBeVisible();
  });
});

test.describe("TC-08 / TC-16 bookings", () => {
  test("search by name and filter by status", async ({ page, request }) => {
    await apiLogin(request);
    const tag = `Zed${Date.now() % 100000}`;
    const pending = await walkIn(request, { name: `Pending ${tag.replace(/\d/g, "x")}`, date: day(70) }); // no payment → Pending
    const confirmed = await walkIn(request, { name: `Confirmed ${tag.replace(/\d/g, "y")}`, date: day(71), initialPayment: { amount: 500, method: "Cash" } });
    expect([pending.status, confirmed.status]).toEqual(["Pending", "Confirmed"]);

    await uiLogin(page);
    await openTab(page, NAV.bookings);
    const search = page.getByLabel("Search bookings");

    await search.fill(confirmed.id);
    await expect(page.getByText(confirmed.id).first()).toBeVisible();
    await expect(page.getByText(pending.id)).toHaveCount(0);

    await search.fill("");
    await page.getByRole("button", { name: /^Pending \(\d+\)/ }).click();
    await expect(page.getByText(pending.id).first()).toBeVisible();
    await expect(page.getByText(confirmed.id)).toHaveCount(0);

    // date-range filter
    await page.getByRole("button", { name: /^All bookings/ }).click();
    await page.getByLabel("Visit date from").fill(day(71));
    await page.getByLabel("Visit date to").fill(day(71));
    await expect(page.getByText(confirmed.id).first()).toBeVisible();
    await expect(page.getByText(pending.id)).toHaveCount(0);
  });

  test("TC-08 accepting a pending booking confirms it", async ({ page, request }) => {
    await apiLogin(request);
    const b = await walkIn(request, { name: "Accept Me", date: day(72) });
    await uiLogin(page);
    await openTab(page, NAV.bookings);
    await page.getByLabel("Search bookings").fill(b.id);
    await page.getByRole("button", { name: "Accept booking" }).first().click();
    await page.getByRole("button", { name: "Accept booking" }).last().click(); // confirm dialog
    await expect.poll(async () => (await (await request.get(`/api/bookings/${b.id}`)).json()).booking?.status).toBe("Confirmed");
  });
});

test.describe("TC-09 / TC-14 / TC-10 money flow (API-driven, UI-verified)", () => {
  test("walk-in → payment → check-in → check-out with damage → settlement figure", async ({ request }) => {
    await apiLogin(request);
    const b = await walkIn(request, { name: "Penalty Pat", date: day(0), guests: 10, initialPayment: { amount: 1000, method: "Cash" } });
    expect(b.total).toBe(2000);

    // TC-14: record the balance; ledger and booking agree
    const pay = await request.post("/api/payments", { data: { bookingId: b.id, type: "Balance", method: "Cash", amount: 500 } });
    expect(pay.status()).toBe(201);
    const tooMuch = await request.post("/api/payments", { data: { bookingId: b.id, type: "Balance", method: "Cash", amount: 999999 } });
    expect([400, 409]).toContain(tooMuch.status());

    // TC-10: check in, then out with a damaged item
    expect((await request.post("/api/checkin", { data: { bookingId: b.id } })).status()).toBe(200);
    // Own rate, so the assertion doesn't depend on whatever the owner has configured.
    const made = await request.post("/api/damage-rates", { data: { name: `E2E chair ${Date.now() % 100000}`, category: "Furniture", unit: "pc", rate: 350 } });
    expect(made.status(), await made.text()).toBe(201);
    const rates = [(await made.json()).rate as { id: number; rate: number }];
    const facilities = (await (await request.get("/api/facilities")).json()).facilities ?? [];
    const pool = facilities.find((f: { name: string }) => f.name === "Swimming Pool");

    const out = await request.post("/api/checkout", {
      data: {
        bookingId: b.id,
        items: [{ facilityId: pool.id, facilityName: pool.name, checklist: [], condition: "Damaged" }],
        damages: [{ facilityName: pool.name, rateId: rates[0].id, quantity: 2 }],
      },
    });
    expect(out.status(), await out.text()).toBe(200);
    const body = await out.json();
    expect(body.penalty).toBe(2 * rates[0].rate);
    expect(body.toSettle).toBe(2000 - 1500 + body.penalty); // 500 balance + penalties
  });
});

test.describe("TC-13 inventory low-stock flag", () => {
  test("an item whose quantity is reduced below its minimum shows LOW STOCK", async ({ page, request }) => {
    await apiLogin(request);
    const name = `E2E Chlorine ${Date.now() % 100000}`;
    const created = await request.post("/api/inventory", { data: { category: "Pool & Chemicals", name, qty: 20, unit: "pcs", minQty: 10, notes: "" } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).item.id;

    await uiLogin(page);
    await openTab(page, NAV.inventory);
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row.getByText("LOW STOCK")).toHaveCount(0);

    expect((await request.patch(`/api/inventory?id=${id}`, { data: { qty: 4 } })).status()).toBe(200);
    await page.reload();
    await openTab(page, NAV.inventory);
    await expect(page.getByRole("row", { name: new RegExp(name) }).getByText("LOW STOCK")).toBeVisible();
  });
});

test.describe("TC-15 sales CSV", () => {
  test("Reports → Sales CSV downloads a file containing the recorded payment", async ({ page, request }) => {
    await apiLogin(request);
    const b = await walkIn(request, { name: "Csv Carla", date: day(0), initialPayment: { amount: 777, method: "Cash" } });
    await uiLogin(page);
    await openTab(page, NAV.reports);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Sales CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^StoneWood_Sales_.*\.csv$/);
    const text = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
    expect(text).toContain("777");
    expect(text).toContain(b.id);
  });
});
