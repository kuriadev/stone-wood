/* The server quote charges a package's room and extra-day deals.
 *
 * Book Now only shows them (from the link); what is charged is worked out
 * here from the package row, so a guest who edits the link pays the same.
 */

import { FakeDb } from "../helpers/fakeDb";

const mockDb = new FakeDb();
jest.mock("@/lib/supabase", () => ({ ...jest.requireActual("@/lib/supabase"), getSupabaseAdmin: () => mockDb }));

import { quoteBooking } from "@/lib/bookingQuote";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-08T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

const DATE = "2026-11-20";
const room = { id: 6, name: "Room 3", beds: "1 Double", capacity: 4, price: 2000, description: "", img: "x", gallery: [], created_at: "" };
const roomFacility = {
  id: 10, category: "Room", name: "Room 3", icon: "bed", status: "Available", room_id: 6, last_used_booking_id: null,
  last_used_guest_name: null, last_checked_at: null, notes: "", before_use_checklist: null, after_use_checklist: null,
  area: null, description: "", show_on_site: true, active: true, created_at: "",
};
const stayPackage = (discount: unknown) => ({
  id: 5, code: "WHOLE-DAY-STAY", title: "Whole Day Stay", resource: "Pool", status: "Exclusive", price: 10800, list_price: null,
  discount, capacity: 30, requires_room: true, slot_mode: "WholeDay", cover: "x", gallery: [], blurb: "", includes: [], note: null,
  active: true, created_at: "",
});

function fresh(discount: unknown) {
  mockDb.tables = {};
  mockDb.seed("bookings", []).seed("closed_dates", []).seed("packages", [stayPackage(discount)]).seed("rooms", [room])
    .seed("facilities", [roomFacility]).seed("date_change_requests", []);
}

const draft = (o: Record<string, unknown> = {}) => ({
  packageCode: "WHOLE-DAY-STAY", resource: "Pool", tier: "Exclusive", slot: "WholeDay", guests: 30, overtime: 0, rooms: [6],
  date: DATE, endDate: DATE, name: "christian", email: "christian@example.com", contact: "09171234567", notes: "", payFull: false, ...o,
});

describe("quoteBooking with a package's deals", () => {
  it("charges the room at its discounted rate", async () => {
    fresh({ room: { type: "percent", value: 10 } });
    const r = await quoteBooking(draft());
    if (!r.ok) throw new Error(JSON.stringify(r));
    // 10,800 + (2,000 - 200) × 2 slots
    expect(r.quote.price).toMatchObject({ roomsFee: 3600, roomsOff: 400, total: 14400 });
  });

  it("takes the extra-day deal off the second day of a two-day stay", async () => {
    fresh({ type: "percent", value: 10, extraDay: { type: "amount", value: 2000 } });
    const r = await quoteBooking(draft({ endDate: "2026-11-21" }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    // A day: 9,720 (10% off) + 4,000 room = 13,720; day 2 is 2,000 off.
    expect(r.quote.price).toMatchObject({ perDay: 13720, extraDaysOff: 2000, total: 13720 * 2 - 2000 });
  });

  it("stops charging a deal the day after its last day", async () => {
    fresh({ room: { type: "percent", value: 10, until: "2026-11-07" } });
    const r = await quoteBooking(draft());
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.quote.price).toMatchObject({ roomsOff: 0, total: 10800 + 4000 });
  });
});
