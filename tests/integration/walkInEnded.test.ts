/* A walk-in can't be booked into today's tour once it has ended: the group
 * would have no time left (the walk-in window also greys that tour out). */

import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));

import { checkWalkIn } from "@/lib/walkIn.server";

const walkIn = (slot: string) => ({
  name: "Late Group", contact: "09171234567", email: "", date: "2026-11-09", guests: 4,
  slot, resource: "Pool", tier: "Shared", package: "Day Tour", rooms: [], source: "Walk-In",
});

beforeAll(() => {
  jest.useFakeTimers({ now: new Date("2026-11-09T23:23:00+08:00"), doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "queueMicrotask"] });
  mockDb.tables = {};
  mockDb.seed("bookings", []).seed("closed_dates", []).seed("rooms", []).seed("packages", []).seed("payments", []);
});
afterAll(() => jest.useRealTimers());

it("refuses today's Day Tour after it ended at 5 PM", async () => {
  const r = await checkWalkIn(walkIn("Day"));
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toMatch(/already ended/);
});

it("still takes today's Night Tour, which is under way", async () => {
  const r = await checkWalkIn(walkIn("Night"));
  expect(r.ok ? "" : r.error).not.toMatch(/already ended/);
});

it("an offline booking being imported keeps its tour", async () => {
  const r = await checkWalkIn(walkIn("Day"), { fromToday: true });
  expect(r.ok ? "" : r.error).not.toMatch(/already ended/);
});

it("a walk-in can't be saved with nothing paid (Full or 50% down only)", async () => {
  const r = await checkWalkIn(walkIn("Night"));
  expect(r.ok ? "" : r.error).toMatch(/in full or 50% down/);
});
