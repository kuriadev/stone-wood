/* Staff emails are saved only once confirmed with a code, and a confirmed
 * email lets a person reset a forgotten password from the sign-in page:
 * a code to that email signs them in, then they set a new password. */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE, hashPassword } from "@/lib/auth";
import { newEmailCode, checkEmailCode } from "@/lib/emailCode.server";
import { forgetStaff } from "@/lib/staff.server";

const mockDb = new FakeDb();
const sent: { to: string; subject: string; html: string }[] = [];
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}), loadRow: jest.fn(async () => null) }));
jest.mock("@/lib/mailer", () => ({
  isMailConfigured: () => true,
  sendMail: jest.fn(async (m: { to: string; subject: string; html: string }) => { sent.push(m); }),
  trySendMail: jest.fn(async () => true),
}));

import { PATCH as patchStaff } from "@/app/api/staff/route";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as verify } from "@/app/api/auth/forgot/verify/route";
import { POST as resetPw } from "@/app/api/auth/reset-password/route";

const OWNER = "11111111-1111-1111-1111-111111111111";
const ANA = "22222222-2222-2222-2222-222222222222";
const salt = "s4lt";
const row = (id: string, o: Record<string, unknown>) => ({
  id, name: "Ana Marie", username: "anamarie", role: "Caretaker", password_hash: hashPassword("old-password", salt), password_salt: salt,
  active: true, must_change_password: false, created_at: "2026-11-01T00:00:00Z", last_login_at: null, email: null, email_verified_at: null, ...o,
});

let ip = 0;
const json = (url: string, body: unknown, cookie?: string) => new NextRequest(`http://localhost:3000${url}`, {
  method: url.startsWith("/api/staff") ? "PATCH" : "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `10.6.0.${++ip}`, ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const ownerCookie = () => `${SESSION_COOKIE}=${createSessionToken({ id: OWNER, name: "Owner", username: "owner", role: "Owner" })}`;
const proofFor = (email: string) => { const c = newEmailCode(email); const r = checkEmailCode(c.challenge, email, c.code); return r.ok ? r.proof : ""; };
const codeIn = (subject: string) => subject.match(/^(\d{6}) /)?.[1] ?? "";

beforeEach(() => {
  mockDb.tables = {};
  mockDb.seed("staff", [row(OWNER, { name: "Owner", username: "owner", role: "Owner" }), row(ANA, {})]);
  sent.length = 0;
  forgetStaff();
});

it("saves a staff email only with the code's proof", async () => {
  expect((await patchStaff(json(`/api/staff?id=${ANA}`, { email: "ana@gmail.com" }, ownerCookie()))).status).toBe(400);
  const res = await patchStaff(json(`/api/staff?id=${ANA}`, { email: "ana@gmail.com", emailProof: proofFor("ana@gmail.com") }, ownerCookie()));
  expect(res.status).toBe(200);
  expect(mockDb.tables.staff.find((s) => s.id === ANA)).toMatchObject({ email: "ana@gmail.com" });
  expect(mockDb.tables.staff.find((s) => s.id === ANA)?.email_verified_at).toBeTruthy();
});

it("resets a forgotten password with a code to the confirmed email", async () => {
  mockDb.tables.staff = mockDb.tables.staff.map((s) => (s.id === ANA ? { ...s, email: "ana@gmail.com", email_verified_at: "2026-11-02T00:00:00Z" } : s));
  // By username: the code goes to her email.
  const f = await (await forgot(json("/api/auth/forgot", { login: "anamarie" }))).json();
  expect(f.success).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("ana@gmail.com");
  const code = codeIn(sent[0].subject);
  expect(code).toMatch(/^\d{6}$/);

  // A wrong code doesn't sign in; the right one does, with a session cookie.
  expect((await verify(json("/api/auth/forgot/verify", { login: "anamarie", challenge: f.challenge, code: code === "000000" ? "111111" : "000000" }))).status).toBe(400);
  const v = await verify(json("/api/auth/forgot/verify", { login: "anamarie", challenge: f.challenge, code }));
  expect(v.status).toBe(200);
  expect(v.headers.get("set-cookie")).toContain(SESSION_COOKIE);
  const { resetToken } = await v.json();

  // The suggested new password.
  expect((await resetPw(json("/api/auth/reset-password", { resetToken, password: "short" }))).status).toBe(400);
  expect((await resetPw(json("/api/auth/reset-password", { resetToken: "forged.token", password: "a-new-password" }))).status).toBe(401);
  expect((await resetPw(json("/api/auth/reset-password", { resetToken, password: "a-new-password" }))).status).toBe(200);
  const ana = mockDb.tables.staff.find((s) => s.id === ANA)!;
  expect(ana.password_hash).toBe(hashPassword("a-new-password", ana.password_salt as string));
});

it("sends nothing, and says the same, for an account without a confirmed email", async () => {
  const f = await (await forgot(json("/api/auth/forgot", { login: "anamarie" }))).json();
  expect(f.success).toBe(true);
  expect(f.challenge).toBeTruthy();
  expect(sent).toHaveLength(0);
  expect((await verify(json("/api/auth/forgot/verify", { login: "anamarie", challenge: f.challenge, code: "123456" }))).status).toBe(400);
});
