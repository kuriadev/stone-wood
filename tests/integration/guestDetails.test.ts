/* A guest changes their own name, email and number from Manage booking,
 * once every 12 hours (lib/guestDetails.ts). */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
const mails: { to: string }[] = [];
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}), loadRow: jest.fn(async () => null) }));
jest.mock("@/lib/mailer", () => ({ isMailConfigured: () => true, sendMail: jest.fn(), trySendMail: jest.fn(async (m: { to: string }) => { mails.push(m); return true; }) }));

import { POST as details } from "@/app/api/bookings/[id]/details/route";
import { GET as lookup } from "@/app/api/bookings/[id]/route";

import { newEmailCode, checkEmailCode } from "@/lib/emailCode.server";
/** What Manage booking holds once the guest typed the code sent to `email`. */
const proofFor = (email: unknown) => {
  if (typeof email !== "string") return undefined;
  const c = newEmailCode(email);
  const r = checkEmailCode(c.challenge, email, c.code);
  return r.ok ? r.proof : undefined;
};

beforeAll(() => {
  jest.useFakeTimers({ now: new Date("2026-11-10T10:00:00+08:00"), doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"] });
});
afterAll(() => jest.useRealTimers());

const row = (o: Record<string, unknown> = {}) => ({
  id: "SW-1", name: "Ana Cruz", contact: "09171234567", email: "ana@example.com", date: "2026-11-20", end_date: null,
  guests: 2, package: "Day Stay", rooms: [], overtime: 0, total: 400, downpayment: 400, status: "Confirmed",
  payment_proof: true, notes: "", cancel_reason: null, created_at: "2026-11-01T10:00:00+08:00", source: "Online",
  resource: "Pool", tier: "Shared", archived: false, archived_at: null, slot: "Day", checked_in_at: null,
  details_updated_at: null, ...o,
});
let ip = 0;
const call = (body: unknown) => new NextRequest("http://localhost:3000/api/bookings/SW-1/details", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.7.0.${++ip}` },
  body: JSON.stringify({ ...(body as Record<string, unknown>), ep: proofFor((body as Record<string, unknown>).email) }),
});
const ctx = { params: Promise.resolve({ id: "SW-1" }) };
const change = { email: "ana@example.com", name: "Ana Reyes", newEmail: "ana.reyes@example.com", contact: "09181234567" };

beforeEach(() => { mockDb.tables = {}; mockDb.seed("bookings", [row()]); mails.length = 0; });

it("changes only the name, email and number, and tells both addresses", async () => {
  const res = await details(call({ ...change, guests: 30, date: "2026-12-01" }), ctx);
  expect(res.status).toBe(200);
  expect(mockDb.tables.bookings[0]).toMatchObject({ name: "Ana Reyes", email: "ana.reyes@example.com", contact: "09181234567", guests: 2, date: "2026-11-20" });
  expect(mockDb.tables.bookings[0].details_updated_at).toBeTruthy();
  expect(mails.map((m) => m.to).sort()).toEqual(["ana.reyes@example.com", "ana@example.com"]);
});

it("waits 12 hours before the next change", async () => {
  expect((await details(call(change), ctx)).status).toBe(200);
  const again = await details(call({ ...change, email: "ana.reyes@example.com", name: "Ana R. Reyes" }), ctx);
  expect(again.status).toBe(429);
  expect((await again.json()).error).toMatch(/change them again after/);
  jest.setSystemTime(new Date("2026-11-10T22:01:00+08:00"));
  expect((await details(call({ ...change, email: "ana.reyes@example.com", name: "Ana R. Reyes" }), ctx)).status).toBe(200);
  jest.setSystemTime(new Date("2026-11-10T10:00:00+08:00"));
});

it("refuses bad details, no change, a wrong email and a closed booking", async () => {
  expect((await details(call({ ...change, newEmail: "nope" }), ctx)).status).toBe(400);
  expect((await details(call({ ...change, contact: "123" }), ctx)).status).toBe(400);
  expect((await details(call({ email: "ana@example.com", name: "Ana Cruz", newEmail: "ana@example.com", contact: "09171234567" }), ctx)).status).toBe(400);
  expect((await details(call({ ...change, email: "x@example.com" }), ctx)).status).toBe(404);
  mockDb.tables.bookings = [row({ status: "Cancelled" })];
  expect((await details(call(change), ctx)).status).toBe(409);
});

it("needs the email confirmed with a code, not just typed", async () => {
  const at = (q: string) => new NextRequest(`http://localhost:3000/api/bookings/SW-1?${q}`, { headers: { "x-forwarded-for": `10.7.1.${++ip}` } });
  expect((await lookup(at("email=ana@example.com"), ctx)).status).toBe(404);
  expect((await lookup(at(`email=ana@example.com&ep=${encodeURIComponent(proofFor("someone@example.com")!)}`), ctx)).status).toBe(404);
  expect((await lookup(at(`email=ana@example.com&ep=${encodeURIComponent(proofFor("ana@example.com")!)}`), ctx)).status).toBe(200);
  // The routes that change a booking too.
  const raw = new NextRequest("http://localhost:3000/api/bookings/SW-1/details", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.7.1.${++ip}` }, body: JSON.stringify(change),
  });
  expect((await details(raw, ctx)).status).toBe(404);
});
