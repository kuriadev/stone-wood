/* POST /api/bookings/check with the venue's own rules (2026-11-08): a
 * venue-only event can have up to what the hall holds (50), anything with
 * the pool up to the resort's capacity (30), and tonight's venue stops
 * taking online bookings two hours before it closes at midnight.
 */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));

import { POST as check } from "@/app/api/bookings/check/route";
import { newEmailCode, checkEmailCode } from "@/lib/emailCode.server";

const proofFor = (email: string) => {
  const { code, challenge } = newEmailCode(email);
  const r = checkEmailCode(challenge, email, code);
  return r.ok ? r.proof : "";
};

const FAKE = ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"] as const;
beforeAll(() => jest.useFakeTimers({ now: new Date("2026-10-20T09:00:00+08:00"), doNotFake: [...FAKE] }));
afterAll(() => jest.useRealTimers());

let ip = 0;
const ask = async (draft: Record<string, unknown>) => {
  const res = await check(new NextRequest("http://localhost:3000/api/bookings/check", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` },
    body: JSON.stringify({ draft }),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const DATE = "2026-10-27";
const draft = (o: Record<string, unknown> = {}) => {
  const d: Record<string, unknown> = {
    resource: "Venue", tier: "Exclusive", slot: "Night", guests: 45, overtime: 0, rooms: [],
    date: DATE, endDate: DATE, name: "christian", email: "christian@example.com",
    contact: "09171234567", notes: "", payFull: false, ...o,
  };
  return { ...d, emailProof: proofFor(String(d.email)) };
};

beforeEach(() => {
  mockDb.tables = {};
  mockDb.seed("bookings", []).seed("closed_dates", []).seed("packages", []).seed("rooms", [])
    .seed("facilities", []).seed("date_change_requests", []);
});

describe("guest limits by what is booked", () => {
  it("lets a venue-only event of 45 through", async () => {
    expect(await ask(draft())).toEqual({ status: 200, body: { success: true } });
  });

  it("refuses more than the hall holds", async () => {
    const r = await ask(draft({ guests: 51 }));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Guests must be between 1 and 50.");
  });

  it("keeps anything with the pool at the resort's capacity", async () => {
    const pool = await ask(draft({ resource: "Pool+Venue", guests: 45 }));
    expect(pool.body.error).toBe("Guests must be between 1 and 30.");
    const shared = await ask(draft({ resource: "Pool", tier: "Shared", guests: 31 }));
    expect(shared.body.error).toBe("Guests must be between 1 and 30.");
  });
});

describe("tonight's venue, late in the evening", () => {
  afterEach(() => jest.setSystemTime(new Date("2026-10-20T09:00:00+08:00")));

  it("stops online bookings of tonight's venue and pool 2 hours after the Night Tour starts", async () => {
    jest.setSystemTime(new Date(`${DATE}T20:30:00+08:00`));
    expect((await ask(draft({ guests: 20 }))).status).toBe(200);
    jest.setSystemTime(new Date(`${DATE}T22:30:00+08:00`));
    const venue = await ask(draft({ guests: 20 }));
    expect(venue.status).toBe(409);
    expect(String(venue.body.error)).toMatch(/closed at 9:00 PM/);
    const pool = await ask(draft({ resource: "Pool", tier: "Shared", guests: 2 }));
    expect(pool.status).toBe(409);
  });
});
