/* Stress probe (not part of the normal suite): many people acting at once. */
import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/mailer", () => ({ ...jest.requireActual("@/lib/mailer"), trySendMail: jest.fn(async () => true), isMailConfigured: () => true }));
jest.mock("@/lib/staffNotify.server", () => ({ notifyStaff: jest.fn(async () => []), alertCaretakerIfSoon: jest.fn(async () => {}) }));
jest.mock("@/lib/guestReminder.server", () => ({ remindGuestIfTomorrow: jest.fn(async () => {}) }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}) }));
jest.mock("@/lib/paymentProofs.server", () => ({
  ...jest.requireActual("@/lib/paymentProofs.server"),
  saveProofImage: jest.fn(async (id: string) => `${id}/receipt.jpg`),
  proofUrl: jest.fn(async (path: string) => `https://signed.example/${path}`),
}));

import { POST as book } from "@/app/api/payment-proofs/route";
import { POST as decide } from "@/app/api/payment-proofs/[id]/route";
import { newEmailCode, checkEmailCode } from "@/lib/emailCode.server";

const proofFor = (email: string) => { const { code, challenge } = newEmailCode(email); const r = checkEmailCode(challenge, email, code); return r.ok ? r.proof : ""; };
beforeAll(() => { jest.useFakeTimers({ now: new Date("2026-11-12T09:00:00+08:00"), doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"] }); });
afterAll(() => jest.useRealTimers());
const IMG = `data:image/jpeg;base64,${Buffer.alloc(5000, 7).toString("base64")}`;
let ip = 0;
const req = (url: string, body: unknown, cookie?: string) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.77.${Math.floor(++ip / 250)}.${ip % 250}`, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const admin = (name: string) => `${SESSION_COOKIE}=${createSessionToken({ id: null, name, username: name.toLowerCase(), role: "Owner" })}`;
const fresh = () => { mockDb.tables = {}; mockDb.seed("bookings", []).seed("payments", []).seed("payment_proofs", []).seed("closed_dates", []).seed("packages", []).seed("rooms", []).seed("facilities", []).seed("date_change_requests", []).seed("damages", []).seed("staff", []); };
const draft = (i: number, o: Record<string, unknown>) => {
  const email = `guest${i}@example.com`;
  return { resource: "Pool", tier: "Shared", slot: "Day", guests: 1, overtime: 0, rooms: [], date: "2026-11-20", endDate: "2026-11-20", name: "Juan Dela Cruz", email, contact: "09171234567", notes: "", payFull: false, emailProof: proofFor(email), ...o };
};
const ocr = (i: number, amt: number) => ({ reference: `10123456${String(i).padStart(5, "0")}`, ocrReference: `10123456${String(i).padStart(5, "0")}`, senderName: "Juan Dela Cruz", senderAccount: "09171234567", date: "2026-11-12", amounts: [amt], amountMatch: true, nameFound: true, confidence: 90, sharpness: 300 });
const flagged = (b: Record<string, unknown>) => /⚠ CHECK/.test(String(b.notes ?? ""));

it("PROBE 1: 8 guests book the same PRIVATE pool Day Stay at the same moment", async () => {
  fresh();
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => book(req("http://x/api/payment-proofs", { draft: draft(i, { tier: "Exclusive", guests: 2 }), proof: IMG, ocr: ocr(i, 0) }))));
  const statuses = rs.map((r) => r.status);
  const bk = mockDb.rows("bookings");
  console.log("P1 statuses", statuses.join(","), "| saved", bk.length, "| unflagged", bk.filter((b) => !flagged(b)).length);
  // Staff confirm every receipt, one after another.
  const out: number[] = [];
  for (const p of mockDb.rows("payment_proofs")) {
    const r = await decide(req(`http://x/api/payment-proofs/${p.id}`, { action: "Downpayment" }, admin("Bea")), { params: Promise.resolve({ id: String(p.id) }) });
    out.push(r.status);
  }
  console.log("P1 confirms", out.join(","), "| Confirmed bookings", mockDb.rows("bookings").filter((b) => b.status === "Confirmed").length);
});

it("PROBE 2: 40 single guests book the SHARED pool (holds 30) at once", async () => {
  fresh();
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => book(req("http://x/api/payment-proofs", { draft: draft(i, {}), proof: IMG, ocr: ocr(i, 0) }))));
  const bk = mockDb.rows("bookings");
  console.log("P2 statuses", [...new Set(rs.map((r) => r.status))].join(","), "| saved", bk.length, "| unflagged guests", bk.filter((b) => !flagged(b)).reduce((n, b) => n + Number(b.guests), 0));
});

it("PROBE 3: two staff confirm the same receipt at the same moment", async () => {
  fresh();
  await book(req("http://x/api/payment-proofs", { draft: draft(1, {}), proof: IMG, ocr: ocr(1, 0) }));
  const p = mockDb.rows("payment_proofs")[0];
  const rs = await Promise.all(["Bea", "Carl"].map((n, k) => decide(req(`http://x/api/payment-proofs/${p.id}`, { action: k ? "Full" : "Downpayment" }, admin(n)), { params: Promise.resolve({ id: String(p.id) }) })));
  console.log("P3 statuses", rs.map((r) => r.status).join(","), "| payments", mockDb.rows("payments").length);
});
