// ── The report as an Excel workbook
//
// The CSV files were one table each and lost every number format: pesos
// came out as bare decimals and dates as text, so whoever opened them had
// to fix the sheet before they could use it. This builds ONE workbook with
// a sheet per table — Summary, Bookings, Payments, Expenses, Stock — with
// peso columns formatted as money, a bold frozen header row and a filter
// on every table, ready for the owner's accountant.
//
// Browser only. exceljs is loaded when the button is pressed, not with the
// page, so nobody pays for it until they export.

export interface SheetSpec {
  name: string;
  columns: { header: string; key: string; width?: number; money?: boolean }[];
  rows: Record<string, string | number | null>[];
  /** Label/value lines under the table, e.g. totals. */
  footer?: [string, string | number][];
}

const PESO = '"₱"#,##0.00;[Red]-"₱"#,##0.00';
const GOLD = "FFC9A84C";

export async function downloadWorkbook(fileName: string, title: string, sheets: SheetSpec[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "StoneWood";
  wb.created = new Date();
  wb.title = title;

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(10, c.header.length + 2) }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FF1A1000" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    head.alignment = { vertical: "middle" };

    for (const r of spec.rows) ws.addRow(r);
    spec.columns.forEach((c, i) => {
      if (c.money) ws.getColumn(i + 1).numFmt = PESO;
    });
    if (spec.rows.length) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
    }
    if (spec.footer?.length) {
      ws.addRow([]);
      for (const [label, value] of spec.footer) {
        const row = ws.addRow([label, value]);
        row.font = { bold: true };
        if (typeof value === "number") row.getCell(2).numFmt = PESO;
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
