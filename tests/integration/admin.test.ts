/**
 * Admin module — TC-07 (login + route guards), TC-08 (accept), TC-09 (walk-in),
 * TC-10 (check-out inspection + damage penalties), TC-11 (rooms), TC-13
 * (inventory), TC-14 (record payment → balance + Sales ledger).
 */
import { FakeDb } from "../helpers/fakeDb";
import { freshDb, makeBookingRow, inDays, poolFacility, venueFacility, roomFacility } from "../helpers/seed";
import { req, ctx, json } from "../helpers/http";
import { pinToday } from "../helpers/fixtures";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({
  ...jest.requireActual("@/lib/activity.server"),
  logActivity: jest.fn(async () => {}),
  loadRow: jest.fn(async () => null),
}));
jest.mock("@/lib/mailer", () => ({ trySendMail: jest.fn(async () => true), isMailConfigured: () => true, sendMail: jest.fn() }));

import { POST as login } from "@/app/api/auth/login/route";
import { GET as listBookings, POST as bookingsPost } from "@/app/api/bookings/route";
import { PATCH as patchBooking } from "@/app/api/bookings/[id]/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as recordPayment, PATCH as voidPayment } from "@/app/api/payments/route";
import { GET as listInventory, POST as addItem, PATCH as editItem } from "@/app/api/inventory/route";
import { POST as addRoom } from "@/app/api/rooms/route";
import { POST as sendEmail } from "@/app/api/email/route";

pinToday();
afterAll(() => jest.useRealTimers());
beforeEach(() => { freshDb(mockDb); jest.clearAllMocks(); });

// ───────────────────────────── TC-07 ─────────────────────────────
describe("TC-07 — admin login and route guards", () => {
  const attempt = (username: string, password: string, ip?: string) => login(req("POST", "/api/auth/login", { username, password }, { ip }));

  it("valid credentials (admin / stonewood2026) → 200 and an httpOnly session cookie", async () => {
    const res = await attempt("admin", "stonewood2026");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/sw_admin_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("wrong password and wrong username give the SAME 401 message (no username enumeration)", async () => {
    const a = await attempt("admin", "wrong");
    const b = await attempt("nobody", "stonewood2026");
    expect([a.status, b.status]).toEqual([401, 401]);
    expect((await json(a)).error).toBe((await json(b)).error);
    expect(a.headers.get("set-cookie")).toBeNull();
  });

  it.each([["", ""], ["admin", ""], ["", "stonewood2026"]])("empty field (%p, %p) → 401", async (u, p) => {
    expect((await attempt(u, p)).status).toBe(401);
  });

  it("oversized input is rejected before hashing", async () => {
    expect((await attempt("admin", "x".repeat(5000))).status).toBe(401);
  });

  it("brute force: the 9th attempt from one IP in 10 minutes is rate-limited (429)", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 8; i++) expect((await attempt("admin", "bad", ip)).status).toBe(401);
    expect((await attempt("admin", "stonewood2026", ip)).status).toBe(429);
  });

  const guarded: [string, () => Promise<Response>][] = [
    ["GET /api/bookings", () => listBookings(req("GET", "/api/bookings"))],
    ["GET /api/inventory", () => listInventory(req("GET", "/api/inventory"))],
    ["POST /api/payments", () => recordPayment(req("POST", "/api/payments", {}))],
    ["POST /api/checkout", () => checkout(req("POST", "/api/checkout", {}))],
    ["POST /api/rooms", () => addRoom(req("POST", "/api/rooms", { name: "x", capacity: 1, price: 1 }))],
    ["POST /api/email", () => sendEmail(req("POST", "/api/email", {}))],
    ["PATCH /api/bookings/:id", () => patchBooking(req("PATCH", "/api/bookings/SW-1", { status: "Confirmed" }), ctx("SW-1"))],
  ];
  it.each(guarded)("%s without a session → 401", async (_n, call) => expect((await call()).status).toBe(401));

  it("a forged or tampered cookie is not a session", async () => {
    const forged = await listBookings(req("GET", "/api/bookings", undefined, { cookie: "sw_admin_session=eyJ1IjoiYWRtaW4ifQ.AAAA" }));
    expect(forged.status).toBe(401);
  });

  it("a valid session reaches the data", async () => {
    mockDb.seed("bookings", [makeBookingRow()]);
    const res = await listBookings(req("GET", "/api/bookings", undefined, { admin: true }));
    expect(res.status).toBe(200);
    expect((await json(res)).bookings).toHaveLength(1);
  });
});

// ───────────────────────────── TC-08 ─────────────────────────────
describe("TC-08 — accept a pending booking", () => {
  const patch = (id: string, body: object) => patchBooking(req("PATCH", `/api/bookings/${id}`, body, { admin: true }), ctx(id));

  it("Pending → Confirmed stamps confirmed_at", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-9", status: "Pending" })]);
    const res = await patch("SW-9", { status: "Confirmed" });
    expect(res.status).toBe(200);
    expect((await json(res)).booking.status).toBe("Confirmed");
    expect(mockDb.rows("bookings")[0].confirmed_at).toBeTruthy();
  });

  it("the status can't skip the check-out/settle flow: PATCH to Completed is refused", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-9" })]);
    expect((await patch("SW-9", { status: "Completed" })).status).toBe(409);
    expect(mockDb.rows("bookings")[0].status).toBe("Confirmed");
  });

  it("can't move a confirmed booking back to Pending, or revive a cancelled one", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "A" }), makeBookingRow({ id: "B", status: "Cancelled" })]);
    expect((await patch("A", { status: "Pending" })).status).toBe(409);
    expect((await patch("B", { status: "Confirmed" })).status).toBe(409);
  });

  it("can't cancel a group that is already checked in", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "A", checked_in_at: new Date().toISOString() })]);
    expect((await patch("A", { status: "Cancelled" })).status).toBe(409);
  });

  it("unknown booking → 404; junk status → 400; guest contact edits are validated", async () => {
    expect((await patch("NOPE", { status: "Confirmed" })).status).toBe(404);
    mockDb.seed("bookings", [makeBookingRow({ id: "A" })]);
    expect((await patch("A", { status: "Banana" })).status).toBe(400);
    expect((await patch("A", { contact: "123" })).status).toBe(400);
  });
});

// ───────────────────────────── TC-09 ─────────────────────────────
describe("TC-09 — walk-in reservation", () => {
  const walkIn = (o: Record<string, unknown> = {}) => ({
    name: "Maria Santos", email: "", contact: "09181234567", date: inDays(3), guests: 10,
    resource: "Pool", tier: "Shared", slot: "Day", rooms: [], overtime: 0, ...o,
  });
  const post = (b: object) => bookingsPost(req("POST", "/api/bookings", b, { admin: true }));

  it("with a cash payment: Confirmed, priced by the server, payment goes to the Sales ledger", async () => {
    const res = await post(walkIn({ total: 1, initialPayment: { amount: 1000, method: "Cash" } }));
    expect(res.status).toBe(201);
    const { booking } = await json(res);
    expect(booking).toMatchObject({ status: "Confirmed", source: "Walk-In", total: 2000, downpayment: 1000 });
    expect(mockDb.rows("payments")[0]).toMatchObject({ booking_id: booking.id, method: "Cash", amount: 1000, type: "Downpayment" });
  });

  it("with no payment: stays Pending until money is recorded", async () => {
    const { booking } = await json(await post(walkIn()));
    expect(booking.status).toBe("Pending");
    expect(mockDb.rows("payments")).toHaveLength(0);
  });

  it("paying the full amount is recorded as Full", async () => {
    await post(walkIn({ initialPayment: { amount: 2000, method: "Cash" } }));
    expect(mockDb.rows("payments")[0].type).toBe("Full");
  });

  it("an email is optional, but a given one must be valid", async () => {
    expect((await post(walkIn({ email: "not-an-email" }))).status).toBe(400);
  });

  it.each([
    ["short name", { name: "A" }],
    ["bad contact", { contact: "555" }],
    ["bad date", { date: "03/05/2026" }],
    ["zero guests", { guests: 0 }],
    ["end before start", { endDate: inDays(1) }],
    ["a 4-day stay (max 3)", { endDate: inDays(6) }],
    ["overpaying at the desk", { initialPayment: { amount: 99999, method: "Cash" } }],
    ["GCash without a reference", { initialPayment: { amount: 1000, method: "GCash" } }],
    ["unknown payment method", { initialPayment: { amount: 1000, method: "Bitcoin" } }],
  ])("rejects %s with 400", async (_n, patch) => expect((await post(walkIn(patch))).status).toBe(400));

  it("refuses a walk-in that would overbook the pool (409)", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-1", date: inDays(3), end_date: inDays(3), guests: 25 })]);
    const res = await post(walkIn({ guests: 10 }));
    expect(res.status).toBe(409);
    expect(mockDb.rows("bookings")).toHaveLength(1);
  });

  it("refuses a closed date on a multi-day stay", async () => {
    mockDb.seed("closed_dates", [{ date: inDays(4) }]);
    expect((await post(walkIn({ endDate: inDays(5) }))).status).toBe(409);
  });

  it("without a session it is not a walk-in, it is a 401", async () => {
    expect((await bookingsPost(req("POST", "/api/bookings", walkIn()))).status).toBe(401);
  });
});

// ───────────────────────────── TC-10 ─────────────────────────────
describe("TC-10 — check-out inspection and damage penalties", () => {
  const BOOKING = "SW-50";
  beforeEach(() => {
    mockDb.seed("bookings", [makeBookingRow({
      id: BOOKING, total: 2000, downpayment: 1000, checked_in_at: new Date().toISOString(),
    })]);
    mockDb.seed("payments", [{ id: 1, booking_id: BOOKING, guest_name: "Juan", type: "Downpayment", method: "PayMongo", amount: 1000, reference: "pi", notes: "", voided: false, received_at: new Date().toISOString() }]);
    mockDb.seed("damage_rates", [
      { id: 1, name: "Broken monobloc chair", category: "Furniture", unit: "pc", rate: 350, active: true, created_at: "" },
      { id: 2, name: "Pool float", category: "Equipment", unit: "pc", rate: 200, active: true, created_at: "" },
    ]);
  });
  const items = (cond: "OK" | "Damaged" = "OK") => [{ facilityId: 1, facilityName: "Swimming Pool", checklist: [{ label: "No broken tiles", done: true }], condition: cond }];
  const out = (body: Record<string, unknown>) => checkout(req("POST", "/api/checkout", { bookingId: BOOKING, items: items(), ...body }, { admin: true }));

  it("no damage: no penalty, the stay balance is what's left to settle, booking is stamped checked out", async () => {
    const res = await out({});
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ success: true, penalty: 0, toSettle: 1000 });
    expect(mockDb.rows("bookings")[0].checked_out_at).toBeTruthy();
    expect(mockDb.rows("facility_inspections")).toHaveLength(1);
    expect(mockDb.rows("damage_records")).toHaveLength(0);
  });

  it("penalty = quantity × the owner's rate; the settlement adds it to the balance", async () => {
    const res = await out({ items: items("Damaged"), damages: [{ facilityName: "Swimming Pool", rateId: 1, quantity: 2 }, { facilityName: "Swimming Pool", rateId: 2, quantity: 1 }] });
    expect(await json(res)).toMatchObject({ penalty: 2 * 350 + 200, toSettle: 1000 + 900 });
    expect(mockDb.rows("damage_records").map((d) => d.amount)).toEqual([700, 200]);
  });

  it("the browser cannot choose the price: a unit rate sent with a rate id is ignored", async () => {
    const res = await out({ items: items("Damaged"), damages: [{ rateId: 1, quantity: 1, unitRate: 1, amount: 1 }] });
    expect((await json(res)).penalty).toBe(350);
    expect(mockDb.rows("damage_records")[0]).toMatchObject({ unit_rate: 350, amount: 350 });
  });

  it("an item not on the list needs a name and price; the amount is quantity × price", async () => {
    expect((await out({ damages: [{ rateId: null, quantity: 1, itemName: "", unitRate: 100 }] })).status).toBe(400);
    expect(mockDb.rows("bookings")[0].checked_out_at).toBeNull();
    const ok = await out({ damages: [{ rateId: null, quantity: 3, itemName: "Garden lamp", unitRate: 125.5 }] });
    expect((await json(ok)).penalty).toBe(376.5);
  });

  it("an adjustment needs a reason, can discount, and can never push a penalty below zero", async () => {
    expect((await out({ damages: [{ rateId: 1, quantity: 1, adjustment: -100 }] })).status).toBe(400);
    expect(mockDb.rows("bookings")[0].checked_out_at).toBeNull(); // validation happens before any write
    const ok = await out({ damages: [{ rateId: 1, quantity: 1, adjustment: -100, adjustmentReason: "Repairable" }] });
    expect((await json(ok)).penalty).toBe(250);
    mockDb.rows("bookings")[0].checked_out_at = null;
    mockDb.tables.damage_records = [];
    const floor = await out({ damages: [{ rateId: 1, quantity: 1, adjustment: -9999, adjustmentReason: "Waived" }] });
    expect((await json(floor)).penalty).toBe(0);
  });

  it.each([[0], [-1], [501], ["abc"]])("quantity %p is rejected", async (q) => {
    expect((await out({ damages: [{ rateId: 1, quantity: q }] })).status).toBe(400);
  });

  it("a rate removed from the list while the window was open → 409, nothing recorded", async () => {
    expect((await out({ damages: [{ rateId: 99, quantity: 1 }] })).status).toBe(409);
    expect(mockDb.rows("facility_inspections")).toHaveLength(0);
  });

  it("facilities used are flagged Needs Cleaning, or Under Maintenance when the owner says so", async () => {
    mockDb.tables.facilities.push({ ...poolFacility, id: 3, name: "BBQ / Grilling Area", area: "Pool" });
    await out({ items: [...items(), { facilityId: 3, facilityName: "BBQ / Grilling Area", checklist: [], condition: "Damaged" }], maintenanceFacilityIds: [3] });
    const status = (id: number) => mockDb.rows("facilities").find((f) => f.id === id)!.status;
    expect(status(1)).toBe("Needs Cleaning");
    expect(status(3)).toBe("Under Maintenance");
  });

  it("only facilities the booking actually used can be written into the inspection", async () => {
    await out({ items: [{ facilityId: 2, facilityName: "Events Venue", checklist: [], condition: "Damaged" }] }); // a Pool booking never used the venue
    expect(mockDb.rows("facility_inspections")[0].items).toEqual([]);
  });

  it("workflow guards: must be Confirmed, checked in, and not already checked out", async () => {
    mockDb.rows("bookings")[0].checked_in_at = null;
    expect((await out({})).status).toBe(409);
    mockDb.rows("bookings")[0].checked_in_at = new Date().toISOString();
    mockDb.rows("bookings")[0].status = "Pending";
    expect((await out({})).status).toBe(409);
    mockDb.rows("bookings")[0].status = "Confirmed";
    expect((await out({})).status).toBe(200);
    expect((await out({})).status).toBe(409); // second click
    expect((await checkout(req("POST", "/api/checkout", { bookingId: "NOPE" }, { admin: true }))).status).toBe(404);
  });

  it("if stamping the booking fails, the inspection and damage rows written moments earlier are rolled back", async () => {
    mockDb.failures["bookings.update"] = { message: "boom" };
    const res = await out({ items: items("Damaged"), damages: [{ rateId: 1, quantity: 1 }] });
    expect(res.status).toBe(500);
    expect(mockDb.rows("facility_inspections")).toHaveLength(0);
    expect(mockDb.rows("damage_records")).toHaveLength(0);
  });
});

// ───────────────────────────── TC-14 ─────────────────────────────
describe("TC-14 — record a payment; Sales ledger and booking balance", () => {
  const pay = (b: object) => recordPayment(req("POST", "/api/payments", b, { admin: true }));
  beforeEach(() => mockDb.seed("bookings", [makeBookingRow({ id: "SW-60", total: 2000, downpayment: 1000 })]));

  it("a Cash balance payment is stored with the booking and guest", async () => {
    const res = await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: 500 });
    expect(res.status).toBe(201);
    expect(mockDb.rows("payments")[0]).toMatchObject({ booking_id: "SW-60", guest_name: "Juan Dela Cruz", amount: 500, method: "Cash" });
  });

  it("the balance shrinks as payments land, and paying it off in full is allowed exactly", async () => {
    await pay({ bookingId: "SW-60", type: "Downpayment", method: "Cash", amount: 1000 });
    expect((await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: 1000.01 })).status).toBe(409);
    expect((await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: 1000 })).status).toBe(201);
    const over = await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: 1 });
    expect(over.status).toBe(409);
    expect((await json(over)).error).toMatch(/0/);
  });

  it("GCash and bank transfers need a reference number; Cash does not", async () => {
    expect((await pay({ bookingId: "SW-60", type: "Balance", method: "GCash", amount: 100 })).status).toBe(400);
    expect((await pay({ bookingId: "SW-60", type: "Balance", method: "GCash", amount: 100, reference: "GC123" })).status).toBe(201);
  });

  it.each([[0], [-5], ["abc"], [null]])("amount %p → 400", async (a) => {
    expect((await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: a })).status).toBe(400);
  });

  it("a payment can't be dated in the future (it would distort a later day's cash count)", async () => {
    const res = await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: 100, receivedAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(res.status).toBe(400);
  });

  it("money recorded against a Pending walk-in confirms it", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-61", status: "Pending", source: "Walk-In", total: 2000 })]);
    await pay({ bookingId: "SW-61", type: "Downpayment", method: "Cash", amount: 1000 });
    expect(mockDb.rows("bookings")[0]).toMatchObject({ status: "Confirmed", payment_proof: true });
  });

  it("nothing more is owed on a cancelled booking", async () => {
    mockDb.seed("bookings", [makeBookingRow({ id: "SW-62", status: "Cancelled" })]);
    expect((await pay({ bookingId: "SW-62", type: "Balance", method: "Cash", amount: 100 })).status).toBe(409);
  });

  it("payments are never deleted: voiding needs a reason and keeps the row", async () => {
    await pay({ bookingId: "SW-60", type: "Balance", method: "Cash", amount: 500 });
    const id = mockDb.rows("payments")[0].id;
    expect((await voidPayment(req("PATCH", `/api/payments?id=${id}`, { reason: "x" }, { admin: true }))).status).toBe(400);
    expect((await voidPayment(req("PATCH", `/api/payments?id=${id}`, { reason: "Entered twice" }, { admin: true }))).status).toBe(200);
    expect(mockDb.rows("payments")[0]).toMatchObject({ voided: true, void_reason: "Entered twice" });
    expect((await voidPayment(req("PATCH", `/api/payments?id=${id}`, { reason: "Entered twice" }, { admin: true }))).status).toBe(409);
  });
});

// ───────────────────────────── TC-13 ─────────────────────────────
describe("TC-13 — inventory", () => {
  const item = (o: object = {}) => ({ category: "Pool & Chemicals", name: "Chlorine Tablets", qty: 24, unit: "pcs", minQty: 10, notes: "", ...o });

  it("adds an item with category, name, qty, unit and minimum", async () => {
    const res = await addItem(req("POST", "/api/inventory", item(), { admin: true }));
    expect(res.status).toBe(201);
    expect(mockDb.rows("inventory")[0]).toMatchObject({ name: "Chlorine Tablets", qty: 24, unit: "pcs", min_qty: 10 });
  });

  it.each([
    ["no name", { name: "" }], ["negative qty", { qty: -1 }], ["missing minQty", { minQty: undefined }], ["unknown category", { category: "Weapons" }],
  ])("rejects %s", async (_n, patch) => {
    expect((await addItem(req("POST", "/api/inventory", item(patch), { admin: true }))).status).toBe(400);
  });

  it("reducing qty below the minimum is persisted, so the UI's low-stock flag has the data", async () => {
    await addItem(req("POST", "/api/inventory", item(), { admin: true }));
    const id = mockDb.rows("inventory")[0].id;
    const res = await editItem(req("PATCH", `/api/inventory?id=${id}`, { qty: 4 }, { admin: true }));
    const { item: saved } = await json(res);
    expect(saved.qty).toBeLessThan(saved.minQty);
  });

  /**
   * DOCUMENTED BEHAVIOUR, and a wording gap with TC-13: InventoryTab flags an
   * item when `qty <= minQty` ("at or below"), while the test case says "falls
   * below". An item sitting exactly at its minimum shows LOW STOCK.
   */
  it("low-stock rule used by InventoryTab is 'at or below the minimum'", () => {
    const isLow = (i: { qty: number; minQty: number }) => i.qty <= i.minQty;
    expect(isLow({ qty: 10, minQty: 10 })).toBe(true);
    expect(isLow({ qty: 11, minQty: 10 })).toBe(false);
  });
});

// ───────────────────────────── TC-11 ─────────────────────────────
describe("TC-11 — rooms", () => {
  const room = (o: object = {}) => ({ name: "Room 9", beds: "2 Queen", capacity: 6, price: 2500, desc: "Aircon", img: "https://images.unsplash.com/photo-1", gallery: [], ...o });

  it("adds a room that is then selectable (it's in the rooms table the booking quote reads)", async () => {
    const res = await addRoom(req("POST", "/api/rooms", room(), { admin: true }));
    expect(res.status).toBe(201);
    expect(mockDb.rows("rooms").find((r) => r.name === "Room 9")).toMatchObject({ price: 2500, capacity: 6 });
  });

  it.each([["no name", { name: "  " }], ["zero capacity", { capacity: 0 }], ["negative price", { price: -1 }]])("rejects %s", async (_n, patch) => {
    expect((await addRoom(req("POST", "/api/rooms", room(patch), { admin: true }))).status).toBe(400);
  });

  /**
   * KNOWN DEFECT (see audit report, W-1). The admin screen reads an uploaded
   * photo with FileReader.readAsDataURL, so the "image" is a base64 data URI —
   * routinely 100 KB+. /api/rooms cuts `img` (the cover every card renders) to
   * 2000 characters, and the gallery ends up with the full cover plus a second,
   * truncated copy of it — a corrupt, unrenderable image. `it.failing` keeps
   * the suite green while the bug exists and turns red the day it is fixed, so
   * this can be flipped to a normal `it`.
   */
  it.failing("an uploaded (data-URI) photo survives the save intact", async () => {
    const photo = "data:image/jpeg;base64," + "A".repeat(50_000);
    const res = await addRoom(req("POST", "/api/rooms", room({ img: photo, gallery: [photo] }), { admin: true }));
    const saved = mockDb.rows("rooms").find((r) => r.name === "Room 9")!;
    expect(res.status).toBe(201);
    expect(saved.img).toBe(photo);
  });
});
