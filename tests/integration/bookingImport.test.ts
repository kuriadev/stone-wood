/* POST /api/bookings/import: bookings taken while the internet was down.
 *
 * Every row goes through the walk-in rules. The check (no `save`) writes
 * nothing and checks each row as if the rows above it were booked, so two
 * offline bookings for the same slot are caught before either is saved.
 */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import type { StaffRole } from "@/lib/permissions";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({
  ...jest.requireActual("@/lib/activity.server"),
  logActivity: jest.fn(async () => {}),
  loadRow: jest.fn(async () => null),
}));

import { POST as importRows } from "@/app/api/bookings/import/route";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-04T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

let ip = 0;
const call = async (rows: unknown[], save: boolean, role: StaffRole = "FrontDesk") => {
  const token = createSessionToken({ id: null, name: "Bea", username: role.toLowerCase(), role });
  const res = await importRows(new NextRequest("http://localhost:3000/api/bookings/import", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}`, "x-forwarded-for": `10.7.0.${++ip}` },
    body: JSON.stringify({ rows, save }),
  }));
  return { status: res.status, body: (await res.json()) as { success: boolean; saved: number; results: { row: number; ok: boolean; error?: string; id?: string; total?: number; status?: string }[] } };
};

const row = (o: Record<string, unknown> = {}) => ({
  name: "Juan Dela Cruz", contact: "09171234567", email: "", date: "2026-11-06", slot: "Day",
  resource: "Pool", tier: "Shared", guests: 10, rooms: [], notes: "", ...o,
});

function fresh() {
  mockDb.tables = {};
  mockDb.seed("bookings", []).seed("payments", []).seed("closed_dates", []).seed("packages", []).seed("date_change_requests", [])
    .seed("rooms", [{ id: 1, name: "Room 1", price: 2000 }])
    .seed("facilities", [{ id: 1, category: "Amenity", name: "Swimming Pool", icon: "pool", status: "Available", room_id: null, area: "Pool", active: true, show_on_site: true, notes: "", description: "", created_at: "" }]);
}

describe("POST /api/bookings/import", () => {
  beforeEach(fresh);

  it("checks without saving, and prices each row", async () => {
    const r = await call([row(), row({ name: "Ana", tier: "Exclusive", slot: "Night" })], false);
    expect(r.body.success).toBe(true);
    expect(r.body.results).toEqual([
      expect.objectContaining({ row: 0, ok: true, total: 2000, status: "Pending" }),
      expect.objectContaining({ row: 1, ok: true, total: 6000 }),
    ]);
    expect(mockDb.rows("bookings")).toHaveLength(0);
  });

  it("catches two offline bookings for the same slot before either is saved", async () => {
    const r = await call([row({ tier: "Exclusive" }), row({ name: "Ana", tier: "Exclusive" })], false);
    expect(r.body.results[0].ok).toBe(true);
    expect(r.body.results[1]).toMatchObject({ ok: false });
    expect(r.body.results[1].error).toMatch(/Exclusive/);
  });

  it("refuses a date already gone by", async () => {
    const r = await call([row({ date: "2026-11-03" })], false);
    expect(r.body.results[0]).toMatchObject({ ok: false });
    expect(r.body.results[0].error).toMatch(/already passed/);
  });

  it("refuses a closed date", async () => {
    mockDb.seed("closed_dates", [{ date: "2026-11-06" }]);
    const r = await call([row()], false);
    expect(r.body.results[0].error).toMatch(/closed/);
  });

  it("saves the rows that pass, with the money taken, and leaves the others", async () => {
    const r = await call([
      row({ initialPayment: { type: "Downpayment", method: "Cash", amount: 1000, reference: "" } }),
      row({ name: "Late", date: "2026-11-01" }),
      row({ name: "Ana", slot: "Night", rooms: [1], initialPayment: { type: "Downpayment", method: "GCash", amount: 4000, reference: "998877" } }),
    ], true);
    expect(r.body.saved).toBe(2);
    expect(r.body.results.map((x) => x.ok)).toEqual([true, false, true]);
    const saved = mockDb.rows("bookings");
    expect(saved.map((b) => [b.name, b.status, b.total, b.source])).toEqual([
      ["Juan Dela Cruz", "Confirmed", 2000, "Walk-In"],
      ["Ana", "Confirmed", 4000, "Walk-In"],
    ]);
    expect(mockDb.rows("payments").map((p) => [p.amount, p.method, p.type])).toEqual([[1000, "Cash", "Downpayment"], [4000, "GCash", "Full"]]);
    expect(String(mockDb.rows("payments")[0].notes)).toMatch(/offline/);
  });

  it("is for the counter: a caretaker can't import", async () => {
    expect((await call([row()], false, "Caretaker")).status).toBe(403);
  });
});
