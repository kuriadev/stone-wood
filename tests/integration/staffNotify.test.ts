/* The system's emails reach the staff whose job they are, by role, through
 * the email each person confirmed on their account. */

import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
const sent: { to: string; subject: string }[] = [];
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/mailer", () => ({
  isMailConfigured: () => true, sendMail: jest.fn(),
  trySendMail: jest.fn(async (m: { to: string; subject: string }) => { sent.push(m); return true; }),
}));

import { notifyStaff, recipientsFor, alertCaretakerIfSoon } from "@/lib/staffNotify.server";
import { buildCaretakerBriefing } from "@/lib/adminNotify";
import { adminNotifyTo } from "@/lib/adminNotify";
import type { Booking } from "@/types/booking";

const staff = (id: string, role: string, email: string | null, o: Record<string, unknown> = {}) => ({
  id, name: id, username: id, role, active: true, email, email_verified_at: email ? "2026-11-01T00:00:00Z" : null, ...o,
});
const booking = (o: Partial<Booking>): Booking => ({
  id: "SW-1", name: "Ana", contact: "", email: "ana@example.com", date: "2026-11-10", guests: 4, package: "Day Tour", rooms: [1],
  overtime: 0, total: 800, downpayment: 400, status: "Confirmed", paymentProof: true, notes: "", slot: "Day", resource: "Pool", tier: "Shared", ...o,
} as Booking);

beforeAll(() => {
  jest.useFakeTimers({ now: new Date("2026-11-10T08:00:00+08:00"), doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"] });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  mockDb.tables = {};
  mockDb.seed("staff", [
    staff("owner", "Owner", "owner@gmail.com"),
    staff("desk", "FrontDesk", "desk@gmail.com"),
    staff("desk2", "FrontDesk", null),
    staff("care", "Caretaker", "care@gmail.com"),
    staff("gone", "FrontDesk", "gone@gmail.com", { active: false }),
  ]);
  mockDb.seed("rooms", [{ id: 1, name: "Room 1 — Queen & Deck" }]);
  sent.length = 0;
});

it("sends each role's emails to that role's confirmed, active addresses", async () => {
  expect((await recipientsFor(["Owner", "FrontDesk"])).sort()).toEqual([adminNotifyTo().toLowerCase(), "desk@gmail.com", "owner@gmail.com"].sort());
  expect(await recipientsFor(["Caretaker"])).toEqual(["care@gmail.com"]);
  await notifyStaff(["FrontDesk"], { subject: "x", html: "" }, "t");
  expect(sent.map((m) => m.to)).toEqual(["desk@gmail.com"]);
});

it("falls back to the resort inbox when nobody in the role has an email", async () => {
  mockDb.tables.staff = mockDb.tables.staff.filter((s) => s.role !== "Caretaker");
  expect(await recipientsFor(["Caretaker"])).toEqual([adminNotifyTo().toLowerCase()]);
});

it("tells the caretaker at once about a booking for today or tomorrow, not later ones", async () => {
  await alertCaretakerIfSoon(booking({ date: "2026-11-11" }));
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ to: "care@gmail.com" });
  expect(sent[0].subject).toMatch(/New arrival tomorrow · SW-1/);
  sent.length = 0;
  await alertCaretakerIfSoon(booking({ date: "2026-11-20" }));
  expect(sent).toHaveLength(0);
});

it("gives the caretaker a morning list of what to prepare, or nothing on a quiet day", () => {
  const mail = buildCaretakerBriefing({
    date: "2026-11-10",
    bookings: [booking({}), booking({ id: "SW-2", date: "2026-11-11", resource: "Pool+Venue", rooms: [] })],
    rooms: [{ id: 1, name: "Room 1 — Queen & Deck" }],
  });
  expect(mail?.subject).toMatch(/1 to prepare today · 1 tomorrow/);
  expect(mail?.html).toContain("Room 1 — Queen &amp; Deck");
  expect(mail?.html).toContain("pool + events venue");
  expect(buildCaretakerBriefing({ date: "2026-11-10", bookings: [] })).toBeNull();
});
