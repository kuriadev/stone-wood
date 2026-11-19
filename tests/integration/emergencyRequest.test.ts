/* Online cancelling closes 2 days before the visit (owner, 2026-11-19).
 * Two or more days ahead it is instant and staff get a "Booking Cancelled"
 * notice. Closer than that the guest sends a cancellation request (stored
 * as "Emergency") with a reason and optional proof; once staff approve it,
 * the guest can cancel online (lib/emergency.ts). */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import type { StaffRole } from "@/lib/permissions";

const mockDb = new FakeDb();
const mails: { to: string; subject: string; html: string }[] = [];
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}), loadRow: jest.fn(async () => null) }));
jest.mock("@/lib/mailer", () => ({
  isMailConfigured: () => true, sendMail: jest.fn(),
  trySendMail: jest.fn(async (m: { to: string; subject: string; html: string }) => { mails.push(m); return true; }),
}));

import { POST as cancel } from "@/app/api/bookings/[id]/cancel/route";
import { POST as emergency } from "@/app/api/bookings/[id]/emergency/route";
import { GET as proofOf, PATCH as decide } from "@/app/api/customer-service/emergency/route";

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

const row = (o: Record<string, unknown>) => ({
  id: "NT-1", name: "Ana Cruz", contact: "09171234567", email: "ana@example.com",
  date: "2026-11-11", end_date: null, guests: 2, package: "Night Stay", rooms: [], overtime: 0,
  total: 400, downpayment: 400, status: "Confirmed", payment_proof: true, notes: "", cancel_reason: null,
  created_at: "2026-11-01T10:00:00+08:00", source: "Online", resource: "Pool", tier: "Shared", archived: false,
  archived_at: null, payment_intent_id: null, slot: "Night", arrival_time: null, checked_in_at: null,
  checked_out_at: null, settled_at: null, settlement_note: "", confirmed_at: null, cancelled_at: null,
  choice_deadline: null, held_amount: 0, refund_status: null, refund_amount: 0, refund_sent_at: null, refund_receipt: null,
  ...o,
});

let ip = 0;
const guest = (path: string, body: unknown) => new NextRequest(`http://localhost:3000/api/bookings/NT-1/${path}`, {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` },
  body: JSON.stringify({ ...(body as Record<string, unknown>), ep: proofFor((body as Record<string, unknown>).email) }),
});
const staff = (method: string, id: number, role: StaffRole, body?: unknown) => new NextRequest(`http://localhost:3000/api/customer-service/emergency?id=${id}`, {
  method,
  headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken({ id: null, name: "Bea", username: role.toLowerCase(), role })}`, "x-forwarded-for": `10.9.1.${++ip}` },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const ctx = { params: Promise.resolve({ id: "NT-1" }) };
const photo = { name: "medcert.jpg", type: "image/jpeg", data: "data:image/jpeg;base64,/9j/AAAA" };
const story = "My son was hospitalised last night with a high fever.";

beforeEach(() => {
  mockDb.tables = {};
  mockDb.seed("bookings", [row({})]);
  mockDb.seed("customer_messages", []);
  mails.length = 0;
});

it("won't cancel online inside the window without an approved request", async () => {
  const res = await cancel(guest("cancel", { email: "ana@example.com" }), ctx);
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/cancellation request/);
  expect(mockDb.tables.bookings[0].status).toBe("Confirmed");
});

it("cancels at once 2 or more days ahead, and leaves staff a Booking Cancelled notice", async () => {
  mockDb.tables.bookings = [row({ date: "2026-11-20" })];
  mockDb.seed("payment_proofs", [{ id: 1, booking_id: "NT-1", status: "Submitted" }]);
  const res = await cancel(guest("cancel", { email: "ana@example.com", reason: "Change of plans" }), ctx);
  expect(res.status).toBe(200);
  expect(mockDb.tables.bookings[0]).toMatchObject({ status: "Cancelled", cancel_reason: "Change of plans" });
  // Notification only: nothing for staff to approve.
  expect(mockDb.tables.customer_messages).toHaveLength(1);
  expect(mockDb.tables.customer_messages[0]).toMatchObject({ type: "Cancellation", booking_id: "NT-1", email: "ana@example.com" });
  expect(String(mockDb.tables.customer_messages[0].message)).toContain("Reason: Change of plans");
  // The receipt stays in the queue: staff still settle the money.
  expect(mockDb.tables.payment_proofs[0].status).toBe("Submitted");
  // A second click finds it cancelled already.
  expect((await cancel(guest("cancel", { email: "ana@example.com" }), ctx)).status).toBe(409);
});

it("doesn't need a reason", async () => {
  mockDb.tables.bookings = [row({ date: "2026-11-20" })];
  const res = await cancel(guest("cancel", { email: "ana@example.com" }), ctx);
  expect(res.status).toBe(200);
  expect(String(mockDb.tables.customer_messages[0].message)).toContain("No reason given.");
});

it("can't cancel once checked in, or after the date", async () => {
  mockDb.tables.bookings = [row({ date: "2026-11-20", checked_in_at: "2026-11-10T07:30:00+08:00" })];
  expect((await cancel(guest("cancel", { email: "ana@example.com" }), ctx)).status).toBe(409);
  mockDb.tables.bookings = [row({ date: "2026-11-09" })];
  expect((await cancel(guest("cancel", { email: "ana@example.com" }), ctx)).status).toBe(409);
});

it("saves a cancellation request to Guest Messages, once; proof is optional", async () => {
  // A reason is required.
  expect((await emergency(guest("emergency", { email: "ana@example.com", message: "too short", files: [] }), ctx)).status).toBe(400);
  const res = await emergency(guest("emergency", { email: "ana@example.com", message: story, files: [photo] }), ctx);
  expect(res.status).toBe(200);
  const saved = mockDb.tables.customer_messages;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ type: "Emergency", booking_id: "NT-1", attachment_count: 1, email: "ana@example.com" });
  expect(String(saved[0].message)).toMatch(/^Cancellation request for NT-1/);
  expect(mails.some((m) => /Cancellation request · NT-1/.test(m.subject))).toBe(true);
  // A second one waits for the first answer.
  expect((await emergency(guest("emergency", { email: "ana@example.com", message: story, files: [photo] }), ctx)).status).toBe(409);
  // A wrong email finds nothing.
  expect((await emergency(guest("emergency", { email: "x@example.com", message: story, files: [photo] }), ctx)).status).toBe(404);
});

it("takes a request with no proof attached", async () => {
  const res = await emergency(guest("emergency", { email: "ana@example.com", message: story }), ctx);
  expect(res.status).toBe(200);
  expect(mockDb.tables.customer_messages[0]).toMatchObject({ type: "Emergency", attachment_count: 0 });
});

it("isn't needed outside the window", async () => {
  mockDb.tables.bookings = [row({ date: "2026-11-20" })];
  expect((await emergency(guest("emergency", { email: "ana@example.com", message: story, files: [photo] }), ctx)).status).toBe(409);
});

it("once approved, the guest can cancel inside the window", async () => {
  await emergency(guest("emergency", { email: "ana@example.com", message: story }), ctx);
  const id = mockDb.tables.customer_messages[0].id as number;
  expect((await cancel(guest("cancel", { email: "ana@example.com" }), ctx)).status).toBe(409);
  expect((await decide(staff("PATCH", id, "FrontDesk", { decision: "Approved" }))).status).toBe(200);
  const res = await cancel(guest("cancel", { email: "ana@example.com" }), ctx);
  expect(res.status).toBe(200);
  expect(mockDb.tables.bookings[0].status).toBe("Cancelled");
});

it("a declined request keeps the booking", async () => {
  await emergency(guest("emergency", { email: "ana@example.com", message: story }), ctx);
  const id = mockDb.tables.customer_messages[0].id as number;
  expect((await decide(staff("PATCH", id, "FrontDesk", { decision: "Declined", note: "No proof of the emergency." }))).status).toBe(200);
  expect((await cancel(guest("cancel", { email: "ana@example.com" }), ctx)).status).toBe(409);
  expect(mockDb.tables.bookings[0].status).toBe("Confirmed");
});

it("lets staff see the proof and approve it, emailing the guest what they can do now", async () => {
  await emergency(guest("emergency", { email: "ana@example.com", message: story, files: [photo] }), ctx);
  const id = mockDb.tables.customer_messages[0].id as number;
  const got = await (await proofOf(staff("GET", id, "FrontDesk"))).json();
  expect(got.files[0]).toMatchObject({ name: "medcert.jpg", type: "image/jpeg" });
  expect((await decide(staff("PATCH", id, "Caretaker", { decision: "Approved" }))).status).toBe(403);
  mails.length = 0;
  const res = await decide(staff("PATCH", id, "FrontDesk", { decision: "Approved" }));
  expect(res.status).toBe(200);
  expect(mockDb.tables.customer_messages[0]).toMatchObject({ resolution: "Approved", resolved_by: "Bea" });
  expect(mails[0].to).toBe("ana@example.com");
  expect(mails[0].html).toContain("approved");
  expect(mails[0].subject).toMatch(/Your cancellation request/);
  expect(mails[0].html).toContain("Cancel your booking");
  expect((await decide(staff("PATCH", id, "FrontDesk", { decision: "Declined", note: "Too late" }))).status).toBe(409);
});

it("needs a reason to decline", async () => {
  await emergency(guest("emergency", { email: "ana@example.com", message: story, files: [photo] }), ctx);
  const id = mockDb.tables.customer_messages[0].id as number;
  expect((await decide(staff("PATCH", id, "FrontDesk", { decision: "Declined" }))).status).toBe(400);
  expect((await decide(staff("PATCH", id, "FrontDesk", { decision: "Declined", note: "The proof is unreadable." }))).status).toBe(200);
  expect(mockDb.tables.customer_messages[0].resolution).toBe("Declined");
});

it("lets the guest cancel online only 2 or more days before the visit", async () => {
  // Today is Nov 10. The visit is today, tomorrow, in 2 days or on Nov 20.
  for (const [date, status] of [["2026-11-10", 409], ["2026-11-11", 409], ["2026-11-12", 200], ["2026-11-20", 200]] as const) {
    mockDb.tables.bookings = [row({ date })];
    const res = await cancel(guest("cancel", { email: "ana@example.com" }), ctx);
    expect([date, res.status]).toEqual([date, status]);
  }
});
