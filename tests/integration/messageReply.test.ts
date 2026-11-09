/* Replying to a guest message emails the guest from the resort's account,
 * to the address on the stored message (not one the screen sends). */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import type { StaffRole } from "@/lib/permissions";

const mockDb = new FakeDb();
const sent: { to: string; subject: string; html: string }[] = [];
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}) }));
jest.mock("@/lib/mailer", () => ({
  isMailConfigured: () => true,
  sendMail: jest.fn(async (m: { to: string; subject: string; html: string }) => { sent.push(m); }),
  trySendMail: jest.fn(async () => true),
}));

import { POST as reply } from "@/app/api/customer-service/reply/route";

let ip = 0;
const call = (role: StaffRole, body: unknown) => new NextRequest("http://localhost:3000/api/customer-service/reply", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken({ id: null, name: "Bea", username: role.toLowerCase(), role })}`, "x-forwarded-for": `10.8.0.${++ip}` },
  body: JSON.stringify(body),
});

beforeAll(() => {
  mockDb.tables = {};
  mockDb.seed("customer_messages", [{ id: 5, name: "Kuria", email: "kuria@example.com", type: "Inquiry", message: "Hi I have a question", date: "2026-11-07", archived_at: null, created_at: "2026-11-07T01:56:00Z" }]);
});

it("emails the reply to the guest who wrote in", async () => {
  const res = await reply(call("FrontDesk", { id: 5, message: "Hi Kuria,\n\nYes, you can bring food.\n\nWarm regards" }));
  expect(res.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("kuria@example.com");
  expect(sent[0].html).toContain("Yes, you can bring food.");
});

it("won't send an empty reply, and a caretaker can't reply", async () => {
  expect((await reply(call("FrontDesk", { id: 5, message: "  " }))).status).toBe(400);
  expect((await reply(call("Caretaker", { id: 5, message: "Hello" }))).status).toBe(403);
});
