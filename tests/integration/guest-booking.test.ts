/**
 * Customer module — TC-02/03 (server prices & books), TC-04 (capacity),
 * TC-05 (QR amount), TC-06 (confirmation + email), TC-06b (guest cancellation
 * frees the slot). Route handlers run for real against an in-memory DB.
 */
import { FakeDb } from "../helpers/fakeDb";
import { freshDb, draft, makeBookingRow, inDays } from "../helpers/seed";
import { req, ctx, json } from "../helpers/http";
import { pinToday } from "../helpers/fixtures";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({ logActivity: jest.fn(async () => {}) }));
jest.mock("@/lib/mailer", () => ({ trySendMail: jest.fn(async () => true), isMailConfigured: () => true, sendMail: jest.fn() }));
jest.mock("@/lib/paymongo", () => ({
  MIN_AMOUNT_CENTAVOS: 2000,
  createQrPayment: jest.fn(async (a: any) => ({ id: "pi_test", qrImage: "data:image/png;base64,AA", expiresAt: "2099-01-01", amountCentavos: a.amountCentavos })),
  getPaymentStatus: jest.fn(),
  cancelPayment: jest.fn(async () => true),
}));

import { POST as createPayment } from "@/app/api/payment/route";
import { POST as createBooking } from "@/app/api/bookings/route";
import { POST as cancelBooking } from "@/app/api/bookings/[id]/cancel/route";
import { GET as availability } from "@/app/api/availability/route";
import { createQrPayment, getPaymentStatus } from "@/lib/paymongo";
import { trySendMail } from "@/lib/mailer";

pinToday();
afterAll(() => jest.useRealTimers());
beforeEach(() => { freshDb(mockDb); jest.clearAllMocks(); });

const paid = (centavos: number) => (getPaymentStatus as jest.Mock).mockResolvedValue({ status: "succeeded", amountCentavos: centavos, paidAt: new Date().toISOString() });

describe("TC-03/05 — POST /api/payment prices the booking on the server and charges that amount", () => {
  it("charges the 50% down payment (₱1,000 for 10 shared guests) and returns the quote the page must show", async () => {
    const res = await createPayment(req("POST", "/api/payment", { draft: draft() }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.quote).toMatchObject({ total: 2000, down: 1000, dueNow: 1000, payFull: false });
    expect((createQrPayment as jest.Mock).mock.calls[0][0].amountCentavos).toBe(100000);
  });

  it("pay-in-full charges the whole total", async () => {
    await createPayment(req("POST", "/api/payment", { draft: draft({ payFull: true }) }));
    expect((createQrPayment as jest.Mock).mock.calls[0][0].amountCentavos).toBe(200000);
  });

  it("ignores any price the browser sends (DevTools tampering)", async () => {
    const res = await createPayment(req("POST", "/api/payment", { draft: draft({ total: 1, down: 1, dueNow: 1, price: 1 }) }));
    expect((await json(res)).quote.dueNow).toBe(1000);
  });

  it("prices a booked room in", async () => {
    const res = await createPayment(req("POST", "/api/payment", { draft: draft({ rooms: [1] }) }));
    expect((await json(res)).quote.total).toBe(2000 + 1500);
  });

  it.each([
    ["bad PH number", { contact: "12345" }, 400],
    ["bad email", { email: "nope" }, 400],
    ["past date", { date: inDays(-2), endDate: inDays(-2) }, 400],
    ["date beyond the window", { date: inDays(200), endDate: inDays(200) }, 400],
    ["more than 30 guests", { guests: 31 }, 400],
    ["Shared Whole Day (not offered)", { slot: "WholeDay" }, 400],
    ["unknown room", { rooms: [999] }, 409],
  ])("rejects %s before any money moves", async (_n, patch, status) => {
    const res = await createPayment(req("POST", "/api/payment", { draft: draft(patch) }));
    expect(res.status).toBe(status);
    expect(createQrPayment).not.toHaveBeenCalled();
  });

  it("rejects a closed date", async () => {
    mockDb.seed("closed_dates", [{ date: inDays(7) }]);
    const res = await createPayment(req("POST", "/api/payment", { draft: draft() }));
    expect(res.status).toBe(409);
    expect(createQrPayment).not.toHaveBeenCalled();
  });
});

describe("TC-04 — over-capacity bookings are blocked", () => {
  it("refuses a QR for a group that exceeds the remaining shared capacity (25/30 taken, asks for 10)", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-1", guests: 25 })]);
    const res = await createPayment(req("POST", "/api/payment", { draft: draft({ guests: 10 }) }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/capacity is full/);
    expect(createQrPayment).not.toHaveBeenCalled();
  });

  it("still allows a group that exactly fits (25 + 5)", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-1", guests: 25 })]);
    const res = await createPayment(req("POST", "/api/payment", { draft: draft({ guests: 5 }) }));
    expect(res.status).toBe(200);
  });

  it("refuses a room that is already booked that slot", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-1", guests: 2, rooms: [1] })]);
    const res = await createPayment(req("POST", "/api/payment", { draft: draft({ rooms: [1] }) }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/Room 1 is already booked/);
  });

  it("refuses a room the owner took out of service", async () => {
    mockDb.tables.facilities.find((f) => f.id === 10)!.status = "Under Maintenance";
    const res = await createPayment(req("POST", "/api/payment", { draft: draft({ rooms: [1] }) }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/maintenance/);
  });

  it("refuses the pool while it is Under Maintenance", async () => {
    mockDb.tables.facilities.find((f) => f.id === 1)!.status = "Under Maintenance";
    const res = await createPayment(req("POST", "/api/payment", { draft: draft() }));
    expect(res.status).toBe(409);
  });
});

describe("TC-06 — POST /api/bookings after PayMongo confirms payment", () => {
  const go = (d = draft(), intent = "pi_1") => createBooking(req("POST", "/api/bookings", { draft: d, paymentIntentId: intent }));

  it("stores a Confirmed booking, returns a reference id, records the payment in Sales, and emails the guest", async () => {
    paid(100000);
    const res = await go();
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.booking).toMatchObject({ status: "Confirmed", total: 2000, downpayment: 1000, source: "Online", email: "juan@gmail.com" });
    expect(body.booking.id).toMatch(/^SW-/);
    expect(body.emailed).toBe(true);

    expect(mockDb.rows("payments")).toHaveLength(1);
    expect(mockDb.rows("payments")[0]).toMatchObject({ booking_id: body.booking.id, method: "PayMongo", amount: 1000, type: "Downpayment", reference: "pi_1" });

    const mail = (trySendMail as jest.Mock).mock.calls[0][0];
    expect(mail.to).toBe("juan@gmail.com");
    expect(mail.html).toContain(body.booking.id); // the reference id is in the email
  });

  it("paying the whole total is recorded as a Full payment", async () => {
    paid(200000);
    const body = await json(await go(draft({ payFull: true })));
    expect(mockDb.rows("payments")[0]).toMatchObject({ type: "Full", amount: 2000 });
    expect(body.booking.status).toBe("Confirmed");
  });

  it("is idempotent: the same payment id returns the same booking, never a second one", async () => {
    paid(100000);
    const a = await json(await go());
    const b = await json(await go());
    expect(b.booking.id).toBe(a.booking.id);
    expect(mockDb.rows("bookings")).toHaveLength(1);
    expect(trySendMail).toHaveBeenCalledTimes(1);
  });

  it("will not hand a booking to someone who isn't the person who made it", async () => {
    paid(100000);
    await go();
    const res = await go(draft({ email: "stranger@gmail.com" }));
    expect(res.status).toBe(409);
  });

  it("creates nothing when the payment has not succeeded", async () => {
    (getPaymentStatus as jest.Mock).mockResolvedValue({ status: "awaiting_payment_method", amountCentavos: 0 });
    const res = await go();
    expect(res.status).toBe(402);
    expect(mockDb.rows("bookings")).toHaveLength(0);
  });

  it("if the date was taken while the guest was paying, the paid booking is kept as Pending with a staff flag (no lost payment)", async () => {
    paid(100000);
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-1", guests: 28 })]);
    const body = await json(await go(draft({ guests: 10 })));
    expect(body.booking.status).toBe("Pending");
    expect(body.booking.notes).toMatch(/⚠ CHECK/);
    expect(mockDb.rows("payments")).toHaveLength(1); // the money is still on the ledger
  });

  it("if the guest paid the wrong amount, the booking is flagged Pending", async () => {
    paid(50000);
    const body = await json(await go());
    expect(body.booking.status).toBe("Pending");
    expect(body.booking.notes).toMatch(/paid .*500.* but/i);
  });

  it("a mail failure never fails the booking", async () => {
    paid(100000);
    (trySendMail as jest.Mock).mockResolvedValueOnce(false);
    const res = await go();
    expect(res.status).toBe(201);
    expect((await json(res)).emailed).toBe(false);
  });

  it("security: no payment id and no admin session → 401, nothing created", async () => {
    const res = await createBooking(req("POST", "/api/bookings", draft()));
    expect(res.status).toBe(401);
    expect(mockDb.rows("bookings")).toHaveLength(0);
  });
});

describe("TC-06b — guest cancellation and calendar sync", () => {
  const seed = (o: Record<string, unknown> = {}) => mockDb.seed("bookings", [makeBookingRow({ id: "SW-77", guests: 30, email: "juan@gmail.com", ...o })]);
  const cancel = (body: object, id = "SW-77") => cancelBooking(req("POST", `/api/bookings/${id}/cancel`, body), ctx(id));
  const slots = async () => (await json(await availability(req("GET", "/api/availability")))).slots as any[];

  it("with the right reference + email the booking is cancelled and the slot reopens on the public calendar", async () => {
    seed();
    expect((await slots()).filter((s) => s.date === inDays(7))).toHaveLength(1);

    const res = await cancel({ email: "JUAN@gmail.com", reason: "Change of plans" });
    expect(res.status).toBe(200);
    expect((await json(res)).booking).toMatchObject({ status: "Cancelled", cancelReason: "Change of plans" });

    expect((await slots()).filter((s) => s.date === inDays(7))).toHaveLength(0);
    // …and the freed capacity is bookable again
    const q = await createPayment(req("POST", "/api/payment", { draft: draft({ guests: 30 }) }));
    expect(q.status).toBe(200);
  });

  it("a wrong email looks identical to a missing booking (404)", async () => {
    seed();
    expect((await cancel({ email: "other@gmail.com" })).status).toBe(404);
    expect((await cancel({ email: "juan@gmail.com" }, "SW-00")).status).toBe(404);
    expect(mockDb.rows("bookings")[0].status).toBe("Confirmed");
  });

  it("requires an email", async () => expect((await cancel({})).status).toBe(400));
  it("cannot cancel twice", async () => { seed({ status: "Cancelled" }); expect((await cancel({ email: "juan@gmail.com" })).status).toBe(409); });
  it("cannot cancel once checked in", async () => { seed({ checked_in_at: new Date().toISOString() }); expect((await cancel({ email: "juan@gmail.com" })).status).toBe(409); });
  it("cannot cancel a past booking", async () => { seed({ date: inDays(-3), end_date: inDays(-3) }); expect((await cancel({ email: "juan@gmail.com" })).status).toBe(409); });
});

describe("TC-01 — GET /api/availability is public and leaks no personal data", () => {
  it("returns only what the calendar needs", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-5", name: "Private Person", email: "secret@gmail.com", contact: "09170000000", notes: "VIP", total: 99999 })]);
    const res = await availability(req("GET", "/api/availability"));
    const text = JSON.stringify(await json(res));
    for (const leak of ["Private Person", "secret@gmail.com", "09170000000", "VIP", "99999", "SW-5"]) expect(text).not.toContain(leak);
  });
  it("omits cancelled and resort-cancelled bookings", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "A", status: "Cancelled" }), makeBookingRow({ id: "B", status: "ResortCancelled" }), makeBookingRow({ id: "C", status: "Pending" })]);
    expect((await json(await availability(req("GET", "/api/availability")))).slots).toHaveLength(1);
  });
});
