import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const ADMIN = { username: process.env.E2E_ADMIN_USER ?? "admin", password: process.env.E2E_ADMIN_PASS ?? "stonewood2026" };

/** YYYY-MM-DD, `n` days from today, local time. Spec dates are spread far apart so runs don't collide. */
export const day = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Signs the request context in (cookie is kept on the context) so later calls are admin calls. */
export async function apiLogin(request: APIRequestContext) {
  const res = await request.post("/api/auth/login", { data: ADMIN });
  expect(res.status(), "admin login via API").toBe(200);
}

export const draft = (o: Record<string, unknown> = {}) => ({
  resource: "Pool", tier: "Shared", slot: "Day", guests: 10, rooms: [], overtime: 0,
  date: day(20), endDate: day(20), name: "E2E Tester", email: "e2e.tester@gmail.com",
  contact: "09171234567", notes: "", payFull: false, ...o,
});

export async function walkIn(request: APIRequestContext, o: Record<string, unknown> = {}) {
  const res = await request.post("/api/bookings", {
    data: { name: "E2E Walkin", email: "", contact: "09181234567", date: day(20), guests: 5, resource: "Pool", tier: "Shared", slot: "Day", rooms: [], overtime: 0, ...o },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).booking as { id: string; total: number; status: string };
}

export async function uiLogin(page: Page) {
  await page.goto("/login");
  await page.locator("#admin-username").fill(ADMIN.username);
  await page.locator("#admin-password").fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/admin");
}

/** Sidebar labels are NOT the names used in Test-Case.docx — see ADMIN_TAB_LABEL in lib/labels.ts. */
export const NAV = {
  dashboard: "Dashboard", bookings: "All Bookings", calendar: "Booking Calendar", facilities: "Facilities & Inspections",
  inventory: "Supplies & Equipment", sales: "Payments & Expenses", reports: "Reports", rooms: "Rooms", packages: "Packages & Prices",
} as const;
export const openTab = (page: Page, label: string) => page.getByRole("button", { name: label, exact: false }).first().click();
