/* A stay, end to end, as front desk and the caretaker work it.
 *
 * The real route handlers run against the in-memory database, with the
 * clock moved to each day the work happens on, so the flow can be checked
 * without waiting for real dates:
 *
 *   day before   caretaker prepares (not earlier; front desk can't)
 *   arrival      front desk checks in, only once it is prepared
 *   on site      caretaker inspects as they leave, damage → penalty
 *   leaving      front desk collects balance + penalty, booking Completed
 *   after        caretaker cleans what was used
 *
 * Plus the two edges: a group nobody checked in on the day (front desk
 * checks them in late, without the preparation that can no longer be
 * done), and a same-day walk-in (prepare first, then check in).
 */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import type { StaffRole } from "@/lib/permissions";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));
jest.mock("@/lib/activity.server", () => ({
  ...jest.requireActual("@/lib/activity.server"),
  logActivity: jest.fn(async () => {}),
  loadRow: jest.fn(async () => null),
}));
jest.mock("@/lib/mailer", () => ({ trySendMail: jest.fn(async () => true), isMailConfigured: () => true, sendMail: jest.fn() }));

import { POST as prepare } from "@/app/api/inspections/route";
import { POST as checkIn } from "@/app/api/checkin/route";
import { POST as checkOut } from "@/app/api/checkout/route";
import { POST as settle } from "@/app/api/settle/route";
import { POST as cleaned } from "@/app/api/facilities/cleaned/route";
import { rowToBooking, rowToFacility, rowToInspection } from "@/lib/supabase";
import { caretakerTasks } from "@/lib/tasks";
import { opsBoard, opsStage } from "@/lib/operations";
import { manilaDate } from "@/lib/finance";
import type { BookingRow, FacilityRow, InspectionRow } from "@/types/database";

// ── The clock ────────────────────────────────────────────────────────
/** Moves "now" to a Manila date and time. Only Date is faked. */
const at = (isoManila: string) => jest.setSystemTime(new Date(`${isoManila}+08:00`));
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-04T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

// ── Who is calling ───────────────────────────────────────────────────
/** A request from a signed-in staff member. The session is minted at the
 *  moment of the call, so moving the clock a day never expires it. */
let ip = 0;
function call(role: StaffRole, url: string, body: unknown) {
  const token = createSessionToken({ id: null, name: role === "Caretaker" ? "Ana" : "Bea", username: role.toLowerCase(), role });
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}`, "x-forwarded-for": `10.9.0.${++ip % 250}` },
    body: JSON.stringify(body),
  });
}
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

// ── The resort ───────────────────────────────────────────────────────
const facility = (o: Partial<FacilityRow> & { id: number; name: string }) => ({
  category: "Amenity", icon: "pool", status: "Available", room_id: null, last_used_booking_id: null,
  last_used_guest_name: null, last_checked_at: null, notes: "", before_use_checklist: null,
  after_use_checklist: null, area: "Pool", description: "", show_on_site: true, active: true, created_at: "", ...o,
});
const POOL = 1, PARKING = 2, VENUE = 3;

function bookingRow(o: Record<string, unknown>) {
  return {
    id: "SW-1", name: "Juan Dela Cruz", contact: "09171234567", email: "juan@example.com",
    date: "2026-11-06", end_date: null, guests: 10, package: "Day Tour", rooms: [], overtime: 0,
    total: 2000, downpayment: 1000, status: "Confirmed", payment_proof: true, notes: "", cancel_reason: null,
    created_at: "2026-11-01T10:00:00+08:00", source: "Online", resource: "Pool", tier: "Shared", archived: false,
    archived_at: null, payment_intent_id: null, slot: "Day", arrival_time: null, checked_in_at: null,
    checked_out_at: null, settled_at: null, settlement_note: "", confirmed_at: null, cancelled_at: null,
    choice_deadline: null, held_amount: 0, refund_status: null, refund_amount: 0, refund_sent_at: null,
    refund_receipt: null,
    ...o,
  };
}

function freshResort(bookings: Record<string, unknown>[]) {
  mockDb.tables = {};
  mockDb.failures = {};
  mockDb.seed("facilities", [
    facility({ id: POOL, name: "Swimming Pool" }),
    facility({ id: PARKING, name: "Parking Area", icon: "parking", area: "Common" }),
    facility({ id: VENUE, name: "Events Venue", icon: "tent", area: "Venue" }),
  ]);
  mockDb.seed("bookings", bookings);
  // The online down payment, as the PayMongo flow records it.
  mockDb.seed("payments", bookings.map((b, i) => ({
    id: 500 + i, booking_id: b.id, guest_name: b.name, type: "Downpayment", method: "PayMongo",
    amount: b.downpayment, reference: `pi_${i}`, notes: "", received_at: "2026-11-01T10:00:00+08:00", voided: false,
  })));
  mockDb.seed("damage_records", []).seed("damage_rates", []).seed("facility_inspections", []);
}

// ── What each screen would show, worked out from the database ────────
const booking = (id: string) => rowToBooking(mockDb.rows("bookings").find((b) => b.id === id) as BookingRow);
const facilities = () => mockDb.rows("facilities").map((f) => rowToFacility(f as FacilityRow));
const inspections = () => mockDb.rows("facility_inspections").map((i) => rowToInspection(i as InspectionRow));
const caretakerList = () => caretakerTasks({
  bookings: mockDb.rows("bookings").map((b) => rowToBooking(b as BookingRow)),
  facilities: facilities(), inspections: inspections(), upkeep: [], runs: [], today: manilaDate(),
});
const stage = (id: string) => opsStage(booking(id), manilaDate());
const facilityStatus = (id: number) => mockDb.rows("facilities").find((f) => f.id === id)?.status;

/** The caretaker's ticked checklist for every facility the booking uses. */
const allTicked = (ids: number[]) => ids.map((facilityId) => ({
  facilityId, facilityName: String(mockDb.rows("facilities").find((f) => f.id === facilityId)?.name),
  checklist: [{ label: "Checked", done: true }],
}));

// ─────────────────────────────────────────────────────────────────────
describe("a normal stay, day by day", () => {
  beforeAll(() => freshResort([bookingRow({ id: "SW-1" })]));

  it("two days before: nothing to prepare yet, and nobody can jump ahead", async () => {
    at("2026-11-04T09:00:00");
    expect(stage("SW-1")).toBe("prepare");
    expect(caretakerList().filter((t) => t.kind === "prepare")).toHaveLength(0);

    const early = await prepare(call("Caretaker", "/api/inspections", { bookingId: "SW-1", items: allTicked([POOL, PARKING]) }));
    expect(early.status).toBe(409);
    expect((await json(early)).error).toMatch(/Preparation opens on/);

    const tooSoon = await checkIn(call("FrontDesk", "/api/checkin", { bookingId: "SW-1" }));
    expect(tooSoon.status).toBe(409);
    expect((await json(tooSoon)).error).toMatch(/haven't been prepared/);
  });

  it("the day before: the caretaker gets the task and prepares; front desk can't", async () => {
    at("2026-11-05T08:00:00");
    const [task] = caretakerList();
    expect(task).toMatchObject({ kind: "prepare", key: "prepare:SW-1" });
    expect(task.detail).toMatch(/Arriving tomorrow/);
    expect(task.facilities.map((f) => f.name).sort()).toEqual(["Parking Area", "Swimming Pool"]);

    expect((await prepare(call("FrontDesk", "/api/inspections", { bookingId: "SW-1", items: allTicked([POOL, PARKING]) }))).status).toBe(403);

    const res = await prepare(call("Caretaker", "/api/inspections", { bookingId: "SW-1", items: allTicked([POOL, PARKING]) }));
    expect(res.status).toBe(201);
    expect(inspections()).toEqual([expect.objectContaining({ bookingId: "SW-1", stage: "Preparation" })]);
    expect(caretakerList()).toHaveLength(0);
  });

  it("arrival day: front desk checks them in; the caretaker can't", async () => {
    at("2026-11-06T07:30:00");
    expect(stage("SW-1")).toBe("arriving");
    expect(opsBoard([booking("SW-1")], inspections(), new Date()).find((c) => c.b.id === "SW-1")).toMatchObject({ prepared: true, overdue: false });

    expect((await checkIn(call("Caretaker", "/api/checkin", { bookingId: "SW-1" }))).status).toBe(403);

    const res = await checkIn(call("FrontDesk", "/api/checkin", { bookingId: "SW-1" }));
    expect(res.status).toBe(200);
    expect(booking("SW-1").checkedInAt).toBeTruthy();
    expect(stage("SW-1")).toBe("onsite");
    expect(facilityStatus(POOL)).toBe("In Use");
  });

  it("on site: the caretaker has an inspect task with the leaving time; front desk can't settle yet", async () => {
    at("2026-11-06T13:00:00");
    const [task] = caretakerList();
    expect(task).toMatchObject({ kind: "inspect", key: "inspect:SW-1", overdue: false });
    expect(task.endsAt).toBeInstanceOf(Date);

    const early = await settle(call("FrontDesk", "/api/settle", { bookingId: "SW-1", payment: { amount: 1000, method: "Cash" } }));
    expect(early.status).toBe(409);
    expect((await json(early)).error).toMatch(/Check the group out/);
  });

  it("they leave: front desk can't inspect, the caretaker does and records damage", async () => {
    at("2026-11-06T17:05:00");
    const body = {
      bookingId: "SW-1",
      items: allTicked([POOL, PARKING]),
      damages: [{ facilityName: "Swimming Pool", rateId: null, itemName: "Broken lounge chair", unitRate: 300, quantity: 1 }],
    };
    expect((await checkOut(call("FrontDesk", "/api/checkout", body))).status).toBe(403);

    const res = await checkOut(call("Caretaker", "/api/checkout", body));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ success: true, penalty: 300, toSettle: 1300 });
    expect(booking("SW-1").checkedOutAt).toBeTruthy();
    expect(stage("SW-1")).toBe("settle");
    expect(mockDb.rows("damage_records")).toEqual([expect.objectContaining({ booking_id: "SW-1", amount: 300 })]);
    // What they used now waits for the caretaker to clean.
    expect([facilityStatus(POOL), facilityStatus(PARKING), facilityStatus(VENUE)]).toEqual(["Needs Cleaning", "Needs Cleaning", "Available"]);
    expect(caretakerList().map((t) => t.key).sort()).toEqual([`clean:${POOL}`, `clean:${PARKING}`]);
  });

  it("front desk collects the balance and the penalty; the caretaker can't take money", async () => {
    const pay = { bookingId: "SW-1", payment: { amount: 1300, method: "Cash" } };
    expect((await settle(call("Caretaker", "/api/settle", pay))).status).toBe(403);

    const res = await settle(call("FrontDesk", "/api/settle", pay));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ completed: true, collected: 1300, leftOwing: 0 });
    expect(booking("SW-1").status).toBe("Completed");
    expect(stage("SW-1")).toBe("done");
    const ledger = mockDb.rows("payments").filter((p) => p.booking_id === "SW-1").map((p) => [p.type, p.amount]);
    expect(ledger).toEqual([["Downpayment", 1000], ["Balance", 1000], ["Penalty", 300]]);
  });

  it("the caretaker cleans what was used, and the task clears", async () => {
    const res = await cleaned(call("Caretaker", "/api/facilities/cleaned", { ids: [POOL] }));
    expect(await json(res)).toMatchObject({ success: true, cleaned: 1 });
    expect(facilityStatus(POOL)).toBe("Available");
    expect(caretakerList().map((t) => t.key)).toEqual([`clean:${PARKING}`]);
  });
});

describe("a group nobody checked in on the day", () => {
  beforeAll(() => freshResort([bookingRow({ id: "SW-2", name: "Maria Santos" })]));

  it("the next day it can't be prepared any more, but front desk can check them in late", async () => {
    at("2026-11-07T10:00:00");
    expect(opsBoard([booking("SW-2")], inspections(), new Date())[0]).toMatchObject({ stage: "arriving", overdue: true, prepared: false });
    // No task the caretaker could act on: preparation is closed, and there
    // is nothing to inspect until someone checks them in.
    expect(caretakerList()).toHaveLength(0);
    expect((await prepare(call("Caretaker", "/api/inspections", { bookingId: "SW-2", items: allTicked([POOL, PARKING]) }))).status).toBe(409);

    const res = await checkIn(call("FrontDesk", "/api/checkin", { bookingId: "SW-2" }));
    expect(res.status).toBe(200);
    // A stay recorded after the fact leaves today's facilities alone.
    expect(facilityStatus(POOL)).toBe("Available");
  });

  it("the inspection then shows up for the caretaker, and the stay closes normally", async () => {
    const [task] = caretakerList();
    expect(task).toMatchObject({ kind: "inspect", key: "inspect:SW-2", overdue: true });

    expect((await checkOut(call("Caretaker", "/api/checkout", { bookingId: "SW-2", items: allTicked([POOL, PARKING]) }))).status).toBe(200);
    // Long over: nobody used the pool today, so it isn't flagged dirty.
    expect(facilityStatus(POOL)).toBe("Available");

    const res = await settle(call("FrontDesk", "/api/settle", { bookingId: "SW-2", payment: { amount: 1000, method: "GCash", reference: "1234567890" } }));
    expect(await json(res)).toMatchObject({ completed: true, leftOwing: 0 });
    expect(booking("SW-2").status).toBe("Completed");
  });
});

describe("a Night Tour, which leaves the morning after", () => {
  beforeAll(() => freshResort([bookingRow({ id: "SW-4", name: "Night Group", date: "2026-11-09", slot: "Night", package: "Night Tour" })]));

  it("isn't 'overdue' for the caretaker after midnight, while the group is still there", async () => {
    at("2026-11-09T18:00:00");
    await prepare(call("Caretaker", "/api/inspections", { bookingId: "SW-4", items: allTicked([POOL, PARKING]) }));
    at("2026-11-09T19:05:00");
    expect((await checkIn(call("FrontDesk", "/api/checkin", { bookingId: "SW-4" }))).status).toBe(200);

    at("2026-11-10T01:00:00");
    expect(caretakerList()).toEqual([expect.objectContaining({ kind: "inspect", overdue: false })]);
    // The next day, with the group still checked in, it is.
    at("2026-11-11T09:00:00");
    expect(caretakerList()).toEqual([expect.objectContaining({ kind: "inspect", overdue: true })]);
  });
});

describe("a same-day walk-in", () => {
  beforeAll(() => freshResort([bookingRow({ id: "SW-3", name: "Walk-in Group", date: "2026-11-08", source: "Walk-In" })]));

  it("is prepared first, then checked in", async () => {
    at("2026-11-08T08:00:00");
    const [task] = caretakerList();
    expect(task).toMatchObject({ kind: "prepare", key: "prepare:SW-3" });
    expect(task.detail).toMatch(/Arriving today/);

    expect((await checkIn(call("FrontDesk", "/api/checkin", { bookingId: "SW-3" }))).status).toBe(409);
    expect((await prepare(call("Caretaker", "/api/inspections", { bookingId: "SW-3", items: allTicked([POOL, PARKING]) }))).status).toBe(201);
    expect((await checkIn(call("FrontDesk", "/api/checkin", { bookingId: "SW-3" }))).status).toBe(200);
    expect(caretakerList()).toEqual([expect.objectContaining({ kind: "inspect", key: "inspect:SW-3" })]);
  });
});
