/* A date with guests still booked can't be closed: the resort cancels
 * their bookings first, so each guest is told. A free date closes. */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}) }));

import { POST as closeDate } from "@/app/api/closed-dates/route";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-12T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

const row = (o: Record<string, unknown>) => ({
  id: "DT-1", name: "Guest", contact: "09171234567", email: "g@example.com", date: "2026-11-18", end_date: "2026-11-18",
  guests: 5, package: "Day Stay", rooms: [], overtime: 0, total: 1000, downpayment: 500, status: "Confirmed",
  payment_proof: true, notes: "", source: "Online", resource: "Pool", tier: "Shared", slot: "Day", archived: false, created_at: "", ...o,
});
const call = (date: string) => closeDate(new NextRequest("http://localhost/api/closed-dates", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken({ id: null, name: "Bea", username: "bea", role: "Owner" })}` },
  body: JSON.stringify({ date }),
}));

it("refuses a date with a confirmed booking, even behind a cancelled one", async () => {
  mockDb.tables = {};
  mockDb.seed("closed_dates", []).seed("bookings", [row({ id: "DT-0", status: "Cancelled" }), row({ id: "DT-1", name: "Test Group" })]);
  const res = await call("2026-11-18");
  expect(res.status).toBe(409);
  const j = await res.json();
  expect(j.error).toMatch(/Test Group \(DT-1\) is booked that date/);
  expect(j.error).toMatch(/Cancel \(resort can't host\)/);
  expect(mockDb.rows("closed_dates")).toHaveLength(0);
});

it("closes a date with no one coming", async () => {
  mockDb.tables = {};
  mockDb.seed("closed_dates", []).seed("bookings", [row({ id: "DT-0", status: "Cancelled" })]);
  expect((await call("2026-11-18")).status).toBe(200);
  expect(mockDb.rows("closed_dates").map((r) => r.date)).toEqual(["2026-11-18"]);
});
