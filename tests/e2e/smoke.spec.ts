/**
 * Smoke tests for the running site, in a real browser.
 *
 * READ-ONLY: nothing here signs in, books or pays, so it is safe to point at
 * any copy of the site, staging or live:
 *
 *   E2E_BASE_URL=<site url> npm run test:e2e
 *
 * Without E2E_BASE_URL, Playwright starts `npm run dev` (playwright.config.ts).
 *
 * The older QA specs on the qa/jest-playwright-suites branch drove the
 * PayMongo checkout, which the GCash receipt flow replaced; they are not
 * brought over because the pages and APIs they call no longer exist.
 */
import { test, expect } from "@playwright/test";

test.describe("public pages load", () => {
  for (const path of ["/", "/packages", "/rooms", "/gallery", "/about", "/book", "/my-booking"]) {
    test(`${path} loads without a server error`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }

  test("the booking calendar shows dates", async ({ page }) => {
    await page.goto("/book");
    // Each calendar cell's aria-label starts with its YYYY-MM-DD date.
    await expect(page.locator('[aria-label^="20"]').first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("guest data stays private", () => {
  test("the public availability API exposes no email address or phone number", async ({ request }) => {
    const res = await request.get("/api/availability");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/(\+63|0)9\d{9}/);
  });

  test("the staff booking list needs a sign-in", async ({ request }) => {
    const res = await request.get("/api/bookings");
    expect([401, 403]).toContain(res.status());
  });

  test("the activity log needs a sign-in", async ({ request }) => {
    const res = await request.get("/api/activity");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("scheduled jobs are locked", () => {
  test("the daily briefing refuses a caller without the secret", async ({ request }) => {
    const res = await request.post("/api/notify");
    expect([401, 403]).toContain(res.status());
  });
});
