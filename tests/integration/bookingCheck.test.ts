/* POST /api/bookings/check: Book Now asks it before the payment screen.
 *
 * The bug it fixes: a guest who already had a shared pool tour that date,
 * booking the events venue on its own, only found out on the QR screen.
 * The check refuses it first and names the step to go back to.
 */

import { NextRequest } from "next/server";
import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));

import { POST as check } from "@/app/api/bookings/check/route";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-10-20T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

let ip = 0;
const ask = async (draft: Record<string, unknown>) => {
  const res = await check(new NextRequest("http://localhost:3000/api/bookings/check", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.8.0.${++ip}` },
    body: JSON.stringify({ draft }),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const DATE = "2026-10-27";
const draft = (o: Record<string, unknown> = {}) => ({
  resource: "Pool", tier: "Shared", slot: "Night", guests: 2, overtime: 0, rooms: [],
  date: DATE, endDate: DATE, name: "christian", email: "christian@example.com",
  contact: "09171234567", notes: "", payFull: false, ...o,
});
const existing = (o: Record<string, unknown>) => ({
  id: "SW-10189", name: "christian", contact: "09171234567", email: "christian@example.com",
  date: DATE, end_date: DATE, guests: 2, package: "Night Tour", rooms: [], overtime: 0,
  total: 400, downpayment: 200, status: "Confirmed", payment_proof: true, notes: "",
  source: "Online", resource: "Pool", tier: "Shared", slot: "Night", archived: false,
  checked_in_at: null, checked_out_at: null, created_at: "2026-10-19T10:00:00+08:00", ...o,
});
const room = { id: 1, name: "Room 1", beds: "1 Queen", capacity: 4, price: 2000, description: "", img: "x", gallery: [], created_at: "" };
const roomFacility = {
  id: 10, category: "Room", name: "Room 1", icon: "bed", status: "Available", room_id: 1, last_used_booking_id: null,
  last_used_guest_name: null, last_checked_at: null, notes: "", before_use_checklist: null, after_use_checklist: null,
  area: null, description: "", show_on_site: true, active: true, created_at: "",
};

function fresh(bookings: Record<string, unknown>[]) {
  mockDb.tables = {};
  mockDb.seed("bookings", bookings).seed("closed_dates", []).seed("packages", []).seed("rooms", [room])
    .seed("facilities", [roomFacility]).seed("date_change_requests", []);
}

describe("POST /api/bookings/check", () => {
  it("lets a free booking through", async () => {
    fresh([]);
    expect(await ask(draft())).toEqual({ status: 200, body: { success: true } });
  });

  it("stops the same guest booking the venue alone on top of their shared pool tour, and says to go back to the date", async () => {
    fresh([existing({})]);
    const r = await ask(draft({ resource: "Venue", tier: "Exclusive", guests: 30 }));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false, step: "date" });
    expect(String(r.body.error)).toMatch(/already have a shared pool booking that date \(SW-10189\)/);
  });

  it("lets a different guest book the venue that night", async () => {
    fresh([existing({})]);
    const other = await ask(draft({ resource: "Venue", tier: "Exclusive", guests: 30, name: "Maria", email: "maria@example.com", contact: "09181234567" }));
    expect(other.body).toEqual({ success: true });
  });

  it("sends a room that is taken back to the room step", async () => {
    fresh([existing({ id: "SW-1", name: "Someone", email: "someone@example.com", contact: "09191234567", rooms: [1] })]);
    const r = await ask(draft({ rooms: [1] }));
    expect(r.body).toMatchObject({ success: false, step: "room" });
  });

  it("sends a bad email back to the contact step", async () => {
    fresh([]);
    const r = await ask(draft({ email: "not-an-email" }));
    expect(r.body).toMatchObject({ success: false, step: "contact" });
  });
});
