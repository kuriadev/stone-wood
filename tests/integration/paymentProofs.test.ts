/* Booking with a GCash receipt (/api/payment-proofs):
 *
 *   the guest books → Pending, the date held, the receipt waiting
 *   staff confirm partial → payment recorded, booking Confirmed, emailed
 *   staff reject → the guest is emailed; a new receipt goes back in the queue
 *   the same receipt can't pay for two bookings
 */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
const sent: { to: string; subject: string }[] = [];
jest.mock("@/lib/mailer", () => ({
  ...jest.requireActual("@/lib/mailer"),
  trySendMail: jest.fn(async (m: { to: string; subject: string }) => { sent.push(m); return true; }),
  isMailConfigured: () => true,
}));
jest.mock("@/lib/staffNotify.server", () => ({ notifyStaff: jest.fn(async () => []), alertCaretakerIfSoon: jest.fn(async () => {}) }));
jest.mock("@/lib/guestReminder.server", () => ({ remindGuestIfTomorrow: jest.fn(async () => {}) }));
jest.mock("@/lib/activity.server", () => ({ ...jest.requireActual("@/lib/activity.server"), logActivity: jest.fn(async () => {}) }));
jest.mock("@/lib/paymentProofs.server", () => ({
  ...jest.requireActual("@/lib/paymentProofs.server"),
  saveProofImage: jest.fn(async (id: string) => `${id}/receipt.jpg`),
  proofUrl: jest.fn(async (path: string) => `https://signed.example/${path}`),
}));

import { POST as book, GET as queue } from "@/app/api/payment-proofs/route";
import { POST as decide } from "@/app/api/payment-proofs/[id]/route";
import { POST as guestProof } from "@/app/api/bookings/[id]/proof/route";
import { newEmailCode, checkEmailCode } from "@/lib/emailCode.server";

const proofFor = (email: string) => {
  const { code, challenge } = newEmailCode(email);
  const r = checkEmailCode(challenge, email, code);
  return r.ok ? r.proof : "";
};

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-12T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

// A JPEG-ish payload big enough to pass the size check.
const IMG = `data:image/jpeg;base64,${Buffer.alloc(5000, 7).toString("base64")}`;
const OCR = (ref: string) => ({ reference: ref, ocrReference: ref, senderName: "Juan Dela Cruz", senderAccount: "0917 123 4567", date: "2026-11-12", amounts: [200], amountMatch: true, nameFound: true, confidence: 88, sharpness: 300 });
const EMAIL = "juan@example.com";
const draft = (o: Record<string, unknown> = {}) => ({
  resource: "Pool", tier: "Shared", slot: "Day", guests: 2, overtime: 0, rooms: [],
  date: "2026-11-20", endDate: "2026-11-20", name: "Juan Dela Cruz", email: EMAIL,
  contact: "09171234567", notes: "", payFull: false, emailProof: proofFor(EMAIL), ...o,
});

let ip = 0;
const req = (url: string, body: unknown, cookie?: string) => new NextRequest(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}`, ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const admin = () => `${SESSION_COOKIE}=${createSessionToken({ id: null, name: "Bea", username: "bea", role: "Owner" })}`;
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });

function fresh() {
  mockDb.tables = {};
  sent.length = 0;
  mockDb.seed("bookings", []).seed("payments", []).seed("payment_proofs", []).seed("closed_dates", []).seed("packages", [])
    .seed("rooms", []).seed("facilities", []).seed("date_change_requests", []).seed("damages", []).seed("staff", []);
}

describe("booking with a GCash receipt", () => {
  beforeEach(fresh);

  it("saves the booking as Pending with its receipt, then confirming records the payment", async () => {
    const r = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: OCR("1012345678901") })));
    expect(r.status).toBe(201);
    const id = r.body.booking.id;
    expect(mockDb.rows("bookings")[0]).toMatchObject({ id, status: "Pending", downpayment: 0 });
    expect(mockDb.rows("payment_proofs")[0]).toMatchObject({ booking_id: id, status: "Submitted", pay_choice: "Downpayment", amount_due: 200, reference: "1012345678901" });
    expect(sent.map((m) => m.subject).join(" ")).toMatch(/proof of payment/i);
    expect(mockDb.rows("payments")).toHaveLength(0);

    // In the Dashboard queue, with a signed link to the receipt.
    const q = await json(await queue(new NextRequest("http://localhost/api/payment-proofs", { headers: { cookie: admin() } })));
    expect(q.body.proofs).toHaveLength(1);
    expect(q.body.proofs[0]).toMatchObject({ bookingId: id, amountDue: 200, imageUrl: `https://signed.example/${id}/receipt.jpg` });

    const proofId = mockDb.rows("payment_proofs")[0].id;
    sent.length = 0;
    const d = await json(await decide(req(`http://localhost/api/payment-proofs/${proofId}`, { action: "Downpayment" }, admin()), { params: Promise.resolve({ id: String(proofId) }) }));
    expect(d.status).toBe(200);
    expect(d.body.amount).toBe(200);
    // The guest gets the confirmation, with the Booking ID and the balance left.
    expect(d.body.emailed).toBe(true);
    const conf = sent.find((m) => /Booking Confirmed/.test(m.subject)) as { to: string; subject: string; html: string } | undefined;
    expect(conf).toBeDefined();
    expect(conf!.to).toBe(EMAIL);
    expect(conf!.subject).toContain(id);
    expect(conf!.html).toContain(id);
    expect(conf!.html).toMatch(/remaining balance of ₱/);
    expect(mockDb.rows("bookings")[0]).toMatchObject({ status: "Confirmed", payment_proof: true, downpayment: 200 });
    expect(mockDb.rows("payments")[0]).toMatchObject({ booking_id: id, method: "GCash", amount: 200, type: "Downpayment", reference: "1012345678901" });
    expect(mockDb.rows("payment_proofs")[0]).toMatchObject({ status: "Approved", approved_as: "Downpayment", reviewed_by: "Bea" });
    // Decided once only.
    const again = await decide(req(`http://localhost/api/payment-proofs/${proofId}`, { action: "Full" }, admin()), { params: Promise.resolve({ id: String(proofId) }) });
    expect(again.status).toBe(409);
  });

  it("confirm full records the whole total", async () => {
    const r = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft({ payFull: true }), proof: IMG, ocr: OCR("2012345678901") })));
    const proofId = mockDb.rows("payment_proofs")[0].id;
    expect(mockDb.rows("payment_proofs")[0]).toMatchObject({ pay_choice: "Full", amount_due: r.body.booking.total });
    sent.length = 0;
    const d = await json(await decide(req(`http://localhost/api/payment-proofs/${proofId}`, { action: "Full" }, admin()), { params: Promise.resolve({ id: String(proofId) }) }));
    expect(d.body.emailed).toBe(true);
    const conf = sent.find((m) => /Booking Confirmed/.test(m.subject)) as { to: string; html: string } | undefined;
    expect(conf?.to).toBe(EMAIL);
    expect(conf?.html).toMatch(/fully paid/);
    expect(mockDb.rows("payments")[0]).toMatchObject({ type: "Full", amount: r.body.booking.total });
    expect(mockDb.rows("bookings")[0].downpayment).toBe(r.body.booking.total);
  });

  it("a rejected receipt emails the guest, who sends a new one", async () => {
    const r = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: OCR("3012345678901") })));
    const id = r.body.booking.id;
    const proofId = mockDb.rows("payment_proofs")[0].id;
    const no = await decide(req(`http://localhost/api/payment-proofs/${proofId}`, { action: "Reject" }, admin()), { params: Promise.resolve({ id: String(proofId) }) });
    expect(no.status).toBe(400); // a reason is required
    await decide(req(`http://localhost/api/payment-proofs/${proofId}`, { action: "Reject", reason: "We can't find this payment in our GCash." }, admin()), { params: Promise.resolve({ id: String(proofId) }) });
    expect(mockDb.rows("payment_proofs")[0]).toMatchObject({ status: "Rejected", reject_reason: "We can't find this payment in our GCash." });
    expect(mockDb.rows("bookings")[0].status).toBe("Pending");
    expect(sent.at(-1)!.subject).toMatch(/couldn't verify/i);

    const st = await json(await guestProof(req(`http://localhost/api/bookings/${id}/proof`, { email: EMAIL, ep: proofFor(EMAIL), action: "status" }), { params: Promise.resolve({ id }) }));
    expect(st.body.proof).toMatchObject({ status: "Rejected", reason: "We can't find this payment in our GCash." });
    const up = await json(await guestProof(req(`http://localhost/api/bookings/${id}/proof`, { email: EMAIL, ep: proofFor(EMAIL), action: "upload", proof: IMG, ocr: OCR("3999999999999") }), { params: Promise.resolve({ id }) }));
    expect(up.status).toBe(200);
    expect(mockDb.rows("payment_proofs").map((p) => p.status)).toEqual(["Rejected", "Submitted"]);
  });

  it("refuses a receipt already used for another booking, and one with no reference", async () => {
    await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: OCR("4012345678901") }));
    const dup = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft({ date: "2026-11-21", endDate: "2026-11-21" }), proof: IMG, ocr: OCR("4012345678901") })));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already used/);
    const noRef = await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: { ...OCR("x"), reference: null } }));
    expect(noRef.status).toBe(400);
    const noSender = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: { ...OCR("5012345678901"), senderName: "Juan 2" } })));
    expect(noSender.status).toBe(400);
    expect(noSender.body.error).toMatch(/sender name/);
    const badAccount = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: { ...OCR("5012345678901"), senderAccount: "12345" } })));
    expect(badAccount.status).toBe(400);
    const sample = await json(await book(req("http://localhost/api/payment-proofs", { draft: draft(), proof: IMG, ocr: OCR("8047 192 533045") })));
    expect(sample.status).toBe(400);
    expect(mockDb.rows("bookings")).toHaveLength(1);
  });
});
