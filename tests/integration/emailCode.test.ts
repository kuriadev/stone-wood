/* The email code, end to end: Book Now asks for a code, the guest types it,
 * and the pre-payment check and the QR payment both refuse a booking whose
 * email wasn't confirmed. Gmail is mocked; the code is read off the mail
 * that would have gone out.
 */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));

const sent: { to: string; subject: string }[] = [];
let mailOn = true;
jest.mock("@/lib/mailer", () => ({
  isMailConfigured: () => mailOn,
  sendMail: jest.fn(async (m: { to: string; subject: string }) => { sent.push(m); }),
  trySendMail: jest.fn(async () => true),
}));

import { POST as sendCode } from "@/app/api/email-code/route";
import { POST as verifyCode } from "@/app/api/email-code/verify/route";
import { POST as check } from "@/app/api/bookings/check/route";
import { POST as pay } from "@/app/api/payment-proofs/route";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-08T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockDb.tables = {};
  mockDb.seed("bookings", []).seed("closed_dates", []).seed("packages", []).seed("rooms", [])
    .seed("facilities", []).seed("date_change_requests", []);
  sent.length = 0;
  mailOn = true;
});

let ip = 0;
const call = async (handler: (r: NextRequest) => Promise<Response>, path: string, body: unknown, from = `10.9.0.${++ip}`) => {
  const res = await handler(new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": from },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const codeIn = (subject: string) => subject.slice(0, 6);

const EMAIL = "christian@example.com";
const draft = (o: Record<string, unknown> = {}) => ({
  resource: "Pool", tier: "Shared", slot: "Day", guests: 3, overtime: 0, rooms: [],
  date: "2026-11-19", endDate: "2026-11-19", name: "christian", email: EMAIL,
  contact: "09171234567", notes: "", payFull: false, ...o,
});

describe("POST /api/email-code", () => {
  it("emails a 6-digit code and hands back a challenge without it", async () => {
    const r = await call(sendCode, "/api/email-code", { email: "Christian@Example.com" });
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    expect(codeIn(sent[0].subject)).toMatch(/^\d{6}$/);
    expect(String(r.body.challenge)).not.toContain(codeIn(sent[0].subject));
  });

  it("won't send to an address that isn't one", async () => {
    const r = await call(sendCode, "/api/email-code", { email: "not-an-email" });
    expect(r.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("waits a minute before sending the same address another code", async () => {
    const from = "10.9.1.1";
    expect((await call(sendCode, "/api/email-code", { email: "wait@example.com" }, from)).status).toBe(200);
    const again = await call(sendCode, "/api/email-code", { email: "wait@example.com" }, from);
    expect(again.status).toBe(429);
    expect(again.body.retryAfter).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
  });

  it("says so when mail isn't set up, instead of pretending", async () => {
    mailOn = false;
    const r = await call(sendCode, "/api/email-code", { email: "nomail@example.com" });
    expect(r.status).toBe(503);
    expect(String(r.body.error)).toMatch(/can't send email right now/);
  });
});

describe("POST /api/email-code/verify", () => {
  it("turns the right code into a proof the booking check accepts", async () => {
    const s = await call(sendCode, "/api/email-code", { email: EMAIL });
    const v = await call(verifyCode, "/api/email-code/verify", { email: EMAIL, challenge: s.body.challenge, code: codeIn(sent[0].subject) });
    expect(v.status).toBe(200);
    const ok = await call(check, "/api/bookings/check", { draft: draft({ emailProof: v.body.proof }) });
    expect(ok).toEqual({ status: 200, body: { success: true } });
  });

  it("allows five tries on one code, then asks for a new one", async () => {
    const s = await call(sendCode, "/api/email-code", { email: "tries@example.com" });
    const real = codeIn(sent[0].subject);
    const wrong = real === "000000" ? "111111" : "000000";
    const from = "10.9.2.2";
    for (let i = 0; i < 5; i++) {
      const r = await call(verifyCode, "/api/email-code/verify", { email: "tries@example.com", challenge: s.body.challenge, code: wrong }, from);
      expect(r.status).toBe(400);
    }
    const sixth = await call(verifyCode, "/api/email-code/verify", { email: "tries@example.com", challenge: s.body.challenge, code: real }, from);
    expect(sixth.status).toBe(429);
    expect(String(sixth.body.error)).toMatch(/Send a new one/);
  });

  it("after a resend, takes the newest code and says to use it when given an older one", async () => {
    const first = await call(sendCode, "/api/email-code", { email: "resend@example.com" }, "10.9.3.1");
    const second = await call(sendCode, "/api/email-code", { email: "resend@example.com" }, "10.9.3.2");
    const [oldCode, newCode] = [codeIn(sent[0].subject), codeIn(sent[1].subject)];
    expect(first.status).toBe(200);
    // The page only keeps the newest challenge.
    if (oldCode !== newCode) {
      const stale = await call(verifyCode, "/api/email-code/verify", { email: "resend@example.com", challenge: second.body.challenge, code: oldCode });
      expect(stale.status).toBe(400);
      expect(String(stale.body.error)).toMatch(/newest email/);
    }
    const ok = await call(verifyCode, "/api/email-code/verify", { email: "resend@example.com", challenge: second.body.challenge, code: newCode });
    expect(ok.status).toBe(200);
  });

  it("won't confirm a different address with someone else's code", async () => {
    const s = await call(sendCode, "/api/email-code", { email: EMAIL });
    const r = await call(verifyCode, "/api/email-code/verify", { email: "someone@example.com", challenge: s.body.challenge, code: codeIn(sent[0].subject) });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/different address/);
  });
});

describe("before money moves", () => {
  it("the booking check sends the guest back to their details without a confirmed email", async () => {
    const r = await call(check, "/api/bookings/check", { draft: draft() });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, step: "contact" });
    expect(String(r.body.error)).toMatch(/6-digit code/);
  });

  it("a proof for one address doesn't cover another", async () => {
    const s = await call(sendCode, "/api/email-code", { email: EMAIL });
    const v = await call(verifyCode, "/api/email-code/verify", { email: EMAIL, challenge: s.body.challenge, code: codeIn(sent[0].subject) });
    const r = await call(check, "/api/bookings/check", { draft: draft({ email: "other@example.com", emailProof: v.body.proof }) });
    expect(r.status).toBe(400);
  });

  it("no booking is saved with a receipt for an email that wasn't confirmed", async () => {
    const proof = `data:image/jpeg;base64,${Buffer.alloc(5000, 7).toString("base64")}`;
    const r = await call(pay, "/api/payment-proofs", { draft: draft(), proof, ocr: { reference: "1012345678901", date: "2026-11-12", amountMatch: true } });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false });
    expect(String(r.body.error)).toMatch(/6-digit code/);
  });
});
