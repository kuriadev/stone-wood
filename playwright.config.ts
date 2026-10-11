import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end specs hit a REAL running StoneWood stack (Next.js + a Supabase
 * project). Point them at a staging/test database, never production: they
 * create bookings, payments and inventory rows.
 *
 *   E2E_BASE_URL     default http://localhost:3000
 *   E2E_ADMIN_USER   default admin
 *   E2E_ADMIN_PASS   default stonewood2026
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // the specs share one database and one capacity pool
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] }, testMatch: /customer\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
