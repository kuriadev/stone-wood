/* The Customer Service form asks for a mobile number (owner, 2026-11-19). */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}) }));
jest.mock("@/lib/staffNotify.server", () => ({ notifyStaff: jest.fn(async () => []) }));

import { POST } from "@/app/api/customer-service/route";

let ip = 0;
const send = (body: Record<string, unknown>) => POST(new NextRequest("http://localhost/api/customer-service", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.8.0.${++ip}` }, body: JSON.stringify(body),
}));
const base = { name: "Ana Cruz", email: "ana@example.com", type: "Inquiry", message: "Is the pool open on Sunday?" };

beforeEach(() => { mockDb.tables = {}; mockDb.seed("customer_messages", []); });

it("needs a valid PH mobile number", async () => {
  expect((await send(base)).status).toBe(400);
  expect((await send({ ...base, contact: "12345" })).status).toBe(400);
  expect(mockDb.tables.customer_messages).toHaveLength(0);
});

it("saves the number with the message, digits only", async () => {
  const res = await send({ ...base, contact: "0917-123-4567" });
  expect(res.status).toBe(200);
  expect(mockDb.tables.customer_messages[0]).toMatchObject({ name: "Ana Cruz", contact: "09171234567", type: "Inquiry" });
});
