/**
 * Customer module against a live stack.
 * TC-01 calendar · TC-03 custom booking quote · TC-04 capacity · TC-05 QR amount
 * · TC-06b cancel frees the slot.
 *
 * TC-05's last step (scanning the QR and PayMongo marking it paid) cannot be automated
 * without PayMongo's test-mode "simulate payment" — it stays a manual step. These specs
 * cover everything up to the QR and everything after payment via the API contract.
 */
import { test, expect } from "@playwright/test";
import { apiLogin, day, draft, walkIn } from "./helpers";

test.describe("TC-01 availability calendar", () => {
  test("a fully booked date is shown as booked on /book, and its neighbour is not", async ({ page, request }) => {
    await apiLogin(request);
    const d = day(30);
    await walkIn(request, { date: d, guests: 30, tier: "Exclusive", slot: "Day", initialPayment: { amount: 1000, method: "Cash" } });

    await page.goto("/book");
    // The calendar cells carry aria-label "<YYYY-MM-DD> — booked|available|closed|unavailable".
    // If the booking is in next month, page forward until the cell exists.
    const cell = page.locator(`[aria-label^="${d} "]`);
    for (let i = 0; i < 3 && !(await cell.count()); i++) await page.getByRole("button", { name: "Next month" }).click();
    await expect(cell).toHaveAttribute("aria-label", /booked/);
    await expect(page.locator(`[aria-label^="${day(31)} "]`)).toHaveAttribute("aria-label", /available/);
  });

  test("the public availability API exposes no personal data", async ({ request }) => {
    const text = await (await request.get("/api/availability")).text();
    expect(text).not.toMatch(/@gmail\.com|09\d{9}/);
  });
});

test.describe("TC-03 / TC-04 / TC-05 server-side quote and capacity", () => {
  test("the QR amount is the server's 50% down payment, whatever the browser claims", async ({ request }) => {
    const res = await request.post("/api/payment", { data: { draft: { ...draft({ date: day(40), endDate: day(40) }), total: 1, down: 1 } } });
    expect(res.status()).toBe(200);
    const { quote, payment } = await res.json();
    expect(quote).toMatchObject({ total: 2000, down: 1000, dueNow: 1000 });
    expect(payment).toBeTruthy(); // the QR to display
  });

  test("TC-04: a group larger than the remaining capacity cannot get a QR", async ({ request }) => {
    await apiLogin(request);
    const d = day(50);
    await walkIn(request, { date: d, guests: 25 });
    const res = await request.post("/api/payment", { data: { draft: draft({ date: d, endDate: d, guests: 10 }) } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/capacity/i);
  });

  test("TC-04: a booking without a verified payment is never created", async ({ request }) => {
    const res = await request.post("/api/bookings", { data: { draft: draft(), paymentIntentId: "pi_does_not_exist" } });
    expect([402, 500]).toContain(res.status());
  });
});

test.describe("TC-06b cancellation reopens the date", () => {
  test("cancel with reference + email, then the date can be quoted again", async ({ request }) => {
    await apiLogin(request);
    const d = day(60);
    const email = "cancel.me@gmail.com";
    const b = await walkIn(request, { date: d, guests: 30, email, initialPayment: { amount: 1000, method: "Cash" } });

    const blocked = await request.post("/api/payment", { data: { draft: draft({ date: d, endDate: d, guests: 5 }) } });
    expect(blocked.status()).toBe(409);

    const cancel = await request.post(`/api/bookings/${b.id}/cancel`, { data: { email, reason: "E2E" } });
    expect(cancel.status()).toBe(200);

    const open = await request.post("/api/payment", { data: { draft: draft({ date: d, endDate: d, guests: 5 }) } });
    expect(open.status()).toBe(200);
  });
});
