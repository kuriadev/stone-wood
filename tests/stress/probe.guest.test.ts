/* Stress probe: a guest double-tapping, two staff answering one request, and
 * two guests asking for the same free date at the same moment. */
import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}), loadRow: jest.fn(async () => null) }));
jest.mock("@/lib/mailer", () => ({ isMailConfigured: () => true, sendMail: jest.fn(), trySendMail: jest.fn(async () => true) }));
jest.mock("@/lib/staffNotify.server", () => ({ ...jest.requireActual("@/lib/staffNotify.server"), notifyStaff: jest.fn(async () => []) }));

import { POST as cancel } from "@/app/api/bookings/[id]/cancel/route";
import { POST as emergency } from "@/app/api/bookings/[id]/emergency/route";
import { POST as dateChange } from "@/app/api/bookings/[id]/date-change/route";
import { PATCH as decide } from "@/app/api/customer-service/emergency/route";
import { newEmailCode, checkEmailCode } from "@/lib/emailCode.server";

const proofFor = (email: string) => { const c = newEmailCode(email); const r = checkEmailCode(c.challenge, email, c.code); return r.ok ? r.proof : undefined; };
beforeAll(() => { jest.useFakeTimers({ now: new Date("2026-11-10T10:00:00+08:00"), doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"] }); });
afterAll(() => jest.useRealTimers());
const row = (o: Record<string, unknown>) => ({
  id: "NT-1", name: "Ana Cruz", contact: "09171234567", email: "ana@example.com", date: "2026-11-20", end_date: "2026-11-20", guests: 2, package: "Private Pool Night Stay", rooms: [], overtime: 0,
  total: 400, downpayment: 400, status: "Confirmed", payment_proof: true, notes: "", cancel_reason: null, created_at: "2026-11-01T10:00:00+08:00", source: "Online", resource: "Pool", tier: "Exclusive", archived: false,
  archived_at: null, slot: "Night", checked_in_at: null, checked_out_at: null, settled_at: null, settlement_note: "", confirmed_at: null, cancelled_at: null, choice_deadline: null, held_amount: 0, refund_status: null, refund_amount: 0, ...o,
});
let ip = 0;
const guest = (id: string, path: string, email: string, body: Record<string, unknown>) => new NextRequest(`http://localhost/api/bookings/${id}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.66.0.${++ip}` }, body: JSON.stringify({ ...body, email, ep: proofFor(email) }) });
const staff = (name: string, id: number, body: unknown) => new NextRequest(`http://localhost/api/customer-service/emergency?id=${id}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken({ id: null, name, username: name, role: "FrontDesk" })}`, "x-forwarded-for": `10.66.1.${++ip}` }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const fresh = (rows: Record<string, unknown>[]) => { mockDb.tables = {}; mockDb.seed("bookings", rows).seed("customer_messages", []).seed("payments", []).seed("payment_proofs", []).seed("date_change_requests", []).seed("closed_dates", []).seed("facilities", []).seed("staff", []); };

it("PROBE 4: a guest taps Cancel 5 times at once", async () => {
  fresh([row({})]);
  const rs = await Promise.all(Array.from({ length: 5 }, () => cancel(guest("NT-1", "cancel", "ana@example.com", {}), ctx("NT-1"))));
  console.log("P4 statuses", rs.map((r) => r.status).join(","), "| notices", mockDb.rows("customer_messages").length, "| status", mockDb.rows("bookings")[0].status);
});

it("PROBE 5: a guest sends a cancellation request 4 times at once", async () => {
  fresh([row({ date: "2026-11-11" })]);
  const rs = await Promise.all(Array.from({ length: 4 }, () => emergency(guest("NT-1", "emergency", "ana@example.com", { message: "My son was taken to the hospital last night." }), ctx("NT-1"))));
  console.log("P5 statuses", rs.map((r) => r.status).join(","), "| requests saved", mockDb.rows("customer_messages").length);
});

it("PROBE 6: two staff answer one cancellation request at the same moment (approve vs decline)", async () => {
  fresh([row({ date: "2026-11-11" })]);
  await emergency(guest("NT-1", "emergency", "ana@example.com", { message: "My son was taken to the hospital last night." }), ctx("NT-1"));
  const id = mockDb.rows("customer_messages")[0].id as number;
  const rs = await Promise.all([decide(staff("Bea", id, { decision: "Approved" })), decide(staff("Carl", id, { decision: "Declined", note: "No proof attached." }))]);
  console.log("P6 statuses", rs.map((r) => r.status).join(","), "| resolution", mockDb.rows("customer_messages")[0].resolution, "| booking", mockDb.rows("bookings")[0].status);
});

it("PROBE 7: two guests ask to move to the same free private-pool date at the same moment", async () => {
  fresh([row({ id: "NT-1", email: "ana@example.com" }), row({ id: "NT-2", email: "ben@example.com", name: "Ben Reyes", date: "2026-11-21", end_date: "2026-11-21" })]);
  const rs = await Promise.all([
    dateChange(guest("NT-1", "date-change", "ana@example.com", { date: "2026-11-25" }), ctx("NT-1")),
    dateChange(guest("NT-2", "date-change", "ben@example.com", { date: "2026-11-25" }), ctx("NT-2")),
  ]);
  const bodies = await Promise.all(rs.map((r) => r.json()));
  console.log("P7 statuses", rs.map((r) => r.status).join(","), "| holds", mockDb.rows("date_change_requests").filter((r) => r.status === "Pending").length, "|", bodies.map((b) => b.error ?? "ok").join(" / "));
});
