/* Stress probe: one address flooding the public forms. */
import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}) }));
jest.mock("@/lib/staffNotify.server", () => ({ notifyStaff: jest.fn(async () => []) }));
jest.mock("@/lib/mailer", () => ({ ...jest.requireActual("@/lib/mailer"), trySendMail: jest.fn(async () => true), sendMail: jest.fn(async () => undefined), isMailConfigured: () => true }));
import { POST as message } from "@/app/api/customer-service/route";
import { POST as code } from "@/app/api/email-code/route";
import { POST as login } from "@/app/api/auth/login/route";

const from = (url: string, body: unknown) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.99.99.99" }, body: JSON.stringify(body) });
beforeEach(() => { mockDb.tables = {}; mockDb.seed("customer_messages", []).seed("staff", []).seed("login_attempts", []).seed("admin_credentials", []); });

it("PROBE 8: 15 messages, 15 code requests and 15 wrong logins from one address", async () => {
  const m: number[] = [], c: number[] = [], l: number[] = [];
  for (let i = 0; i < 15; i++) m.push((await message(from("http://x/api/customer-service", { name: "Ana Cruz", email: "ana@example.com", contact: "09171234567", type: "Inquiry", message: "Is the pool open on Sunday?" }))).status);
  for (let i = 0; i < 15; i++) c.push((await code(from("http://x/api/email-code", { email: `ana${i}@example.com` }))).status);
  for (let i = 0; i < 15; i++) l.push((await login(from("http://x/api/auth/login", { username: "admin", password: `wrong${i}` }))).status);
  console.log("P8 messages", m.join(","), "| saved", mockDb.rows("customer_messages").length);
  console.log("P8 codes   ", c.join(","));
  console.log("P8 logins  ", l.join(","));
});
