/* The offline sheet: what the front desk has on paper when the internet
 * drops. It is built from what the admin page already holds, so it can be
 * printed from an open tab after the connection is gone.
 */

import type { Booking } from "@/types/booking";
import { offlineSheetHtml } from "@/components/admin/offlineSheet";
import { IMPORT_COLUMNS } from "@/lib/importBookings";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date("2026-11-04T09:00:00+08:00"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance"],
  });
});
afterAll(() => jest.useRealTimers());

const booking = (o: Partial<Booking>): Booking => ({
  id: "SW-1", name: "Juan", contact: "09171234567", email: "", date: "2026-11-04", guests: 10,
  package: "Day Tour", rooms: [], overtime: 0, total: 2000, downpayment: 1000, status: "Confirmed",
  paymentProof: true, notes: "", slot: "Day", resource: "Pool", tier: "Shared", ...o,
});

const sheet = (bookings: Booking[]) => offlineSheetHtml({
  bookings, payments: [], damages: [], inspections: [],
  facilities: [{ id: 1, category: "Amenity", name: "Swimming Pool", icon: "pool", status: "Available", area: "Pool", notes: "" }],
  rooms: [{ id: 1, name: "Room 1 – Queen & Deck" }],
});

describe("the offline sheet", () => {
  it("lists today's and tomorrow's bookings, and nothing else", () => {
    const html = sheet([
      booking({ id: "SW-TODAY", name: "Today Group" }),
      booking({ id: "SW-TMRW", name: "Tomorrow Group", date: "2026-11-05", rooms: [1] }),
      booking({ id: "SW-LATER", name: "Later Group", date: "2026-11-09" }),
      booking({ id: "SW-GONE", name: "Cancelled Group", status: "Cancelled" }),
    ]);
    expect(html).toContain("Today Group");
    expect(html).toContain("Tomorrow Group");
    expect(html).toContain("Room 1");
    expect(html).not.toContain("Later Group");
    expect(html).not.toContain("Cancelled Group");
  });

  it("says what is still to collect, and what the caretaker has to do", () => {
    const html = sheet([booking({ id: "SW-TODAY", name: "Today Group" })]);
    // ₱2,000 total, nothing in the ledger yet: all of it to collect.
    expect(html).toMatch(/₱2,000<\/td><td class="n">₱0<\/td><td class="n">₱2,000/);
    expect(html).toContain("Prepare for Today Group");
  });

  it("carries the rates, the hours and blank forms laid out like the import template", () => {
    const html = sheet([]);
    expect(html).toContain("₱200 per guest, per tour");
    expect(html).toContain("₱6,000 per tour");
    expect(html).toContain("7:00 AM – 5:00 PM");
    for (const c of IMPORT_COLUMNS.filter((c) => c.key !== "email" && c.key !== "notes")) expect(html).toContain(`<th>${c.header}</th>`);
  });

  it("escapes what guests typed", () => {
    expect(sheet([booking({ name: "<script>x</script>" })])).not.toContain("<script>x</script>");
  });
});
