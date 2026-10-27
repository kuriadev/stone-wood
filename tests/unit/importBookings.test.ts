/* Reading the import template back.
 *
 * The sheet comes from Excel, Google Sheets or the printed offline sheet
 * typed up by hand, so the reader takes what those really produce: real
 * date cells, Excel day numbers, phone numbers with the 0 dropped, emails
 * turned into links, columns in another order. A line it can't read says
 * why, before anything reaches the server.
 */

import { readImportSheet, readDate, readContact, cellText, IMPORT_COLUMNS } from "@/lib/importBookings";
import { buildImportTemplate, readWorkbookGrid } from "@/components/admin/importTemplate";

const rooms = [{ id: 1, name: "Room 1 – Queen & Deck" }, { id: 2, name: "Room 2 – Deck Suite" }];
const header = IMPORT_COLUMNS.map((c) => c.header);
const line = (o: Partial<Record<string, unknown>>) => IMPORT_COLUMNS.map((c) => o[c.key] ?? null);

describe("cell values", () => {
  it("reads dates however the sheet stored them", () => {
    expect(readDate(new Date(Date.UTC(2026, 10, 5)))).toBe("2026-11-05");
    expect(readDate(46331)).toBe("2026-11-05");
    expect(readDate("2026-11-05")).toBe("2026-11-05");
    expect(readDate("11/5/2026")).toBe("2026-11-05");
    expect(readDate("2026-02-30")).toBeNull();
    expect(readDate("next week")).toBeNull();
  });

  it("puts back the 0 Excel drops from a phone number", () => {
    expect(readContact(9171234567)).toBe("09171234567");
    expect(readContact("+63 917 123 4567")).toBe("09171234567");
    expect(readContact("0917-123-4567")).toBe("09171234567");
  });

  it("reads links and rich text as their text", () => {
    expect(cellText({ text: "juan@example.com", hyperlink: "mailto:juan@example.com" })).toBe("juan@example.com");
    expect(cellText({ richText: [{ text: "Juan " }, { text: "Cruz" }] })).toBe("Juan Cruz");
  });
});

describe("readImportSheet", () => {
  it("turns a filled-in line into a walk-in", () => {
    const { lines } = readImportSheet([
      header,
      line({ name: "Juan Dela Cruz", contact: 9171234567, first: new Date(Date.UTC(2026, 10, 5)), tour: "Day Tour", booking: "Resort & pool", pool: "Exclusive", guests: 12, rooms: "Room 1, room 2", amount: "₱3,000", method: "GCash", reference: "123456" }),
    ], rooms);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ line: 2, body: {
      name: "Juan Dela Cruz", contact: "09171234567", date: "2026-11-05", slot: "Day", resource: "Pool", tier: "Exclusive",
      guests: 12, rooms: [1, 2], initialPayment: { method: "GCash", amount: 3000, reference: "123456" },
    } });
  });

  it("reads a Staycation over several days, and leaves the tier to the server when blank", () => {
    const { lines } = readImportSheet([header, line({ name: "Ana", contact: "09181234567", first: "2026-11-05", last: "2026-11-07", tour: "Staycation", booking: "Resort & pool", guests: 8 })], rooms);
    expect(lines[0].body).toMatchObject({ slot: "WholeDay", date: "2026-11-05", endDate: "2026-11-07" });
    expect(lines[0].body!.tier).toBeUndefined();
    expect(lines[0].body!.initialPayment).toBeUndefined();
  });

  it("finds columns by their header, in any order, and skips empty lines", () => {
    const grid = [
      ["Guests", "Tour", "First day", "Contact number", "Guest name"],
      [5, "Night Tour", "2026-11-06", "09171234567", "Bea"],
      [null, null, null, null, null],
    ];
    const { lines } = readImportSheet(grid, rooms);
    expect(lines).toHaveLength(1);
    expect(lines[0].body).toMatchObject({ name: "Bea", slot: "Night", guests: 5, resource: "Pool" });
  });

  it("says why a line can't be read", () => {
    const { lines } = readImportSheet([
      header,
      line({ contact: "09171234567", first: "2026-11-05", tour: "Day Tour", guests: 2 }),
      line({ name: "A", contact: "09171234567", first: "tomorrow", tour: "Day Tour", guests: 2 }),
      line({ name: "B", contact: "09171234567", first: "2026-11-05", tour: "Morning", guests: 2 }),
      line({ name: "C", contact: "09171234567", first: "2026-11-05", tour: "Day Tour", guests: 2, rooms: "Room 9" }),
      line({ name: "D", contact: "09171234567", first: "2026-11-05", tour: "Day Tour", guests: 0 }),
    ], rooms);
    expect(lines.map((l) => l.error)).toEqual([
      "Add the guest's name.",
      "First day isn't a date. Write it like 2026-11-05.",
      "Tour must be Day Tour, Night Tour or Staycation.",
      'There is no room called "room 9".',
      "Guests must be a whole number, 1 or more.",
    ]);
    expect(lines.map((l) => l.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it("refuses a sheet without the columns it needs", () => {
    expect(readImportSheet([["Name", "Date"]], rooms).missing).toEqual(["Contact number", "Tour", "Guests"]);
  });
});

describe("the template the app hands out", () => {
  it("reads back with every column found and no bookings in it", async () => {
    const grid = await readWorkbookGrid(await buildImportTemplate(rooms));
    const { lines, missing } = readImportSheet(grid, rooms);
    expect(missing).toEqual([]);
    expect(lines).toEqual([]);
    expect(grid[0]).toEqual(IMPORT_COLUMNS.map((c) => c.header));
  });
});
