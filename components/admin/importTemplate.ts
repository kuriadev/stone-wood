// ── The import template, and reading a filled-in one back
//
// Browser only. exceljs is loaded when it is needed, like the Excel report
// (lib/excelReport.ts), so nobody pays for it until they use it.
//
// The template is a choice wherever it can be (owner's preference): Tour,
// Booking, Pool, Rooms and Paid by are dropdowns, so a line is picked
// rather than typed, and a second sheet says what each column wants.

import { IMPORT_COLUMNS, BOOKING_CHOICES, POOL_CHOICES, METHOD_CHOICES, tourChoices, type ImportKey } from "@/lib/importBookings";

const GOLD = "FFC9A84C";
/** Rows that carry the dropdowns. A day's offline bookings, with room. */
const ROWS = 200;

export async function downloadImportTemplate(rooms: { name: string }[]): Promise<void> {
  const buf = await buildImportTemplate(rooms);
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "StoneWood-bookings-import.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The template as an .xlsx file's bytes. */
export async function buildImportTemplate(rooms: { name: string }[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "StoneWood";
  wb.created = new Date();

  const ws = wb.addWorksheet("Bookings", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FF1A1000" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };

  const col = (k: ImportKey) => IMPORT_COLUMNS.findIndex((c) => c.key === k) + 1;
  // Text, so Excel keeps the 0 at the front of 09… and of references.
  ws.getColumn(col("contact")).numFmt = "@";
  ws.getColumn(col("reference")).numFmt = "@";
  ws.getColumn(col("first")).numFmt = "yyyy-mm-dd";
  ws.getColumn(col("last")).numFmt = "yyyy-mm-dd";
  ws.getColumn(col("amount")).numFmt = '"₱"#,##0';

  const list = (k: ImportKey, items: string[], strict: boolean) => {
    // A list longer than Excel's 255-character limit would corrupt the
    // file; the instructions sheet lists those choices instead.
    const formula = `"${items.join(",")}"`;
    if (formula.length > 255 || items.some((x) => x.includes(","))) return;
    for (let r = 2; r <= ROWS + 1; r++) {
      ws.getCell(r, col(k)).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        // Rooms can be more than one ("Room 1, Room 3"), so typing is allowed there.
        errorStyle: strict ? "stop" : "information",
        errorTitle: "Pick from the list",
        error: `Choose one of: ${items.join(", ")}.`,
      };
    }
  };
  list("tour", tourChoices().map((t) => t.label), true);
  list("booking", BOOKING_CHOICES.map((c) => c.label), true);
  list("pool", [...POOL_CHOICES], true);
  list("method", [...METHOD_CHOICES], true);
  list("rooms", rooms.map((r) => r.name), false);

  const help = wb.addWorksheet("How to fill this in");
  help.columns = [{ header: "Column", key: "c", width: 24 }, { header: "What to write", key: "w", width: 90 }];
  help.getRow(1).font = { bold: true };
  help.addRow({ c: "One booking per row", w: "Bookings taken while the internet was down, for today or later. Nothing is saved until you check the list in All Bookings → Import and press Import." });
  for (const c of IMPORT_COLUMNS) help.addRow({ c: c.header, w: c.hint });
  help.addRow({});
  help.addRow({ c: "Tour choices", w: tourChoices().map((t) => t.label).join(", ") });
  help.addRow({ c: "Booking choices", w: BOOKING_CHOICES.map((c) => c.label).join(", ") });
  help.addRow({ c: "Rooms", w: rooms.length ? rooms.map((r) => r.name).join("; ") : "No rooms set up." });
  help.addRow({ c: "Example", w: "Juan Dela Cruz · 09171234567 · 2026-11-05 · Day Tour · Resort & pool · Shared · 10 guests · Amount paid 1000 · Cash" });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** The first sheet of an .xlsx as a grid of raw cell values. */
export async function readWorkbookGrid(file: Blob | ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // A chosen file in the browser, or the bytes themselves (a Buffer in Node).
  await wb.xlsx.load(typeof (file as Blob).arrayBuffer === "function" ? await (file as Blob).arrayBuffer() : (file as ArrayBuffer));
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: unknown[] = [];
    // row.values is 1-based; index 0 is always empty.
    const values = row.values as unknown[];
    for (let i = 1; i < values.length; i++) cells.push(values[i]);
    grid[n - 1] = cells;
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}
