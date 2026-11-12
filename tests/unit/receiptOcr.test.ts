/* The receipt check: a real GCash receipt passes, a random photo, an old
 * screenshot and the wrong amount don't. */

import { checkReceipt, findReference, findDate, findAmounts } from "@/lib/receiptOcr";

const NOW = new Date("2026-11-12T10:00:00+08:00");
const GCASH = `GCash
Sent via GCash
Amount 200.00
Total Amount Sent PHP 200.00
STONEWOOD G.
+63 917 *** 1234
Ref. No. 1012 345 678901
Nov 12, 2026 9:41 AM`;

it("reads a GCash receipt", () => {
  expect(findReference(GCASH)).toBe("1012345678901");
  expect(findDate(GCASH, NOW)).toBe("2026-11-12");
  expect(findAmounts(GCASH)).toContain(200);
  const r = checkReceipt(GCASH, { due: 200, names: ["Stonewood Garden", "Juan Dela Cruz"], now: NOW });
  expect(r).toMatchObject({ ok: true, amountMatch: true, nameFound: true, problem: null });
});

it("turns away a photo that isn't a receipt", () => {
  const r = checkReceipt("Happy birthday! Pool party 2026", { due: 200, names: ["Stonewood"], now: NOW });
  expect(r.ok).toBe(false);
  expect(r.problem).toBe("not-receipt");
  expect(r.missing).toEqual(expect.arrayContaining(["the reference number", "the date"]));
});

it("turns away the wrong amount and an old receipt", () => {
  const wrong = checkReceipt(GCASH.replace(/200\.00/g, "150.00").replace("STONEWOOD G.", "ANNA R."), { due: 200, names: ["Stonewood Garden"], now: NOW });
  expect(wrong).toMatchObject({ ok: false, problem: "wrong-amount" });
  const old = checkReceipt(GCASH.replace("Nov 12, 2026", "Oct 1, 2026"), { due: 200, names: ["Stonewood Garden"], now: NOW });
  expect(old).toMatchObject({ ok: false, problem: "old-date" });
});

it("reads Maya and numeric dates, and fixes OCR letters in amounts", () => {
  const maya = "Maya\nReference ID: 6A2B 91C4 77D1\nDate 11/12/2026\nP2,O00.0O";
  expect(findReference(maya)).toBe("6A2B91C477D1");
  expect(findDate(maya, NOW)).toBe("2026-11-12");
  expect(findAmounts(maya)).toContain(2000);
});
