/* The super admin changes a staff member's password (temporary, or one
 * they keep), and every staff member can change their own. */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE, hashPassword } from "@/lib/auth";
import { forgetStaff } from "@/lib/staff.server";
import type { StaffRole } from "@/lib/permissions";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}), loadRow: jest.fn(async () => null) }));
jest.mock("@/lib/mailer", () => ({ isMailConfigured: () => true, sendMail: jest.fn(), trySendMail: jest.fn(async () => true) }));

import { PATCH as patchStaff } from "@/app/api/staff/route";
import { PATCH as patchAccount } from "@/app/api/admin/account/route";

const OWNER = "11111111-1111-1111-1111-111111111111";
const ANA = "22222222-2222-2222-2222-222222222222";
const salt = "s4lt";
const row = (id: string, o: Record<string, unknown>) => ({
  id, name: "Ana", username: "ana", role: "Caretaker", password_hash: hashPassword("old-password", salt), password_salt: salt,
  active: true, must_change_password: false, created_at: "2026-11-01T00:00:00Z", last_login_at: null, ...o,
});
let ip = 0;
const cookie = (id: string, role: StaffRole, username: string) => `${SESSION_COOKIE}=${createSessionToken({ id, name: username, username, role })}`;
const req = (url: string, body: unknown, c: string) => new NextRequest(`http://localhost:3000${url}`, {
  method: "PATCH", headers: { "content-type": "application/json", cookie: c, "x-forwarded-for": `10.5.0.${++ip}` }, body: JSON.stringify(body),
});
const ana = () => mockDb.tables.staff.find((s) => s.id === ANA)!;

beforeEach(() => {
  mockDb.tables = {};
  mockDb.seed("staff", [row(OWNER, { name: "Owner", username: "owner", role: "Owner" }), row(ANA, {})]);
  forgetStaff();
});

it("lets the super admin set a temporary password (they choose their own at sign-in)", async () => {
  expect((await patchStaff(req(`/api/staff?id=${ANA}`, { password: "temp-pass-1" }, cookie(OWNER, "Owner", "owner")))).status).toBe(200);
  expect(ana().password_hash).toBe(hashPassword("temp-pass-1", ana().password_salt as string));
  expect(ana().must_change_password).toBe(true);
});

it("lets the super admin set a password they keep", async () => {
  expect((await patchStaff(req(`/api/staff?id=${ANA}`, { password: "kept-pass-1", mustChange: false }, cookie(OWNER, "Owner", "owner")))).status).toBe(200);
  expect(ana().must_change_password).toBe(false);
});

it("doesn't let other staff change someone's password", async () => {
  expect((await patchStaff(req(`/api/staff?id=${OWNER}`, { password: "hijack-pass" }, cookie(ANA, "Caretaker", "ana")))).status).toBe(403);
});

it("lets a staff member change their own password, with their current one", async () => {
  const c = cookie(ANA, "Caretaker", "ana");
  expect((await patchAccount(req("/api/admin/account", { username: "ana", currentPassword: "wrong-one", newPassword: "my-new-pass" }, c))).status).toBe(401);
  expect((await patchAccount(req("/api/admin/account", { username: "ana", currentPassword: "old-password", newPassword: "my-new-pass" }, c))).status).toBe(200);
  expect(ana().password_hash).toBe(hashPassword("my-new-pass", ana().password_salt as string));
});
