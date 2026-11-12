/* The receipt check: a real GCash receipt passes, a random photo, an old
 * screenshot and the wrong amount don't. */

import { checkReceipt, findReference, findDate, findAmounts, cleanReference, validReference, validSenderName, cleanAccount, validAccount, sameReference } from "@/lib/receiptOcr";

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

// What tesseract read off a real GCash receipt: no space after the comma in
// the date, the date on the same line as the reference, ₱ read as £.
const REAL = `S—
SEeN JEeeeO M.
+63 Qeeeee0677
Sent via GCash

Amount 25.00
Total Amount Sent £25.00
Ref No. 1234 567 890123 Nov 13,2026 1:12 AM
Me fh Be Go DB DDB Oa Bd HB BD BB DE`;

it("reads a real GCash receipt as OCR sees it", () => {
  const now = new Date("2026-11-13T09:00:00+08:00");
  expect(findReference(REAL)).toBe("1234567890123");
  expect(findDate(REAL, now)).toBe("2026-11-13");
  expect(findAmounts(REAL)).toContain(25);
  expect(checkReceipt(REAL, { due: 25, names: ["SEAN JETHRO M.", "Stonewood", "Juan Dela Cruz"], now })).toMatchObject({ ok: true, problem: null });
});

it("turns away the sample receipt shown to guests", () => {
  const now = new Date("2026-11-13T09:00:00+08:00");
  const sample = REAL.replace("1234 567 890123", "8047 192 533045").replace(/25\.00/g, "10.00");
  expect(checkReceipt(sample, { due: 10, names: ["Stonewood"], now })).toMatchObject({ ok: false, problem: "sample" });
});

it("checks the sender's name, account number and reference as typed", () => {
  expect(cleanReference(" 0047-192 533045 ")).toBe("0047192533045");
  expect(validReference("0047192533045")).toBe(true);
  expect(validReference("1234567")).toBe(false);
  expect(validReference("1".repeat(21))).toBe(false);
  expect(validSenderName("Ma. Clara D'Souza-Reyes")).toBe(true);
  expect(validSenderName("Juan 2")).toBe(false);
  expect(validSenderName("Juan 🙂")).toBe(false);
  expect(cleanAccount("+63 917 123 4567")).toBe("09171234567");
  expect(validAccount(cleanAccount("0917-123-4567"))).toBe(true);
  expect(validAccount("0817123456")).toBe(false);
  expect(sameReference("8047 192 533045", "8047192533045")).toBe(true);
});

it("reads Maya and numeric dates, and fixes OCR letters in amounts", () => {
  const maya = "Maya\nReference ID: 6A2B 91C4 77D1\nDate 11/12/2026\nP2,O00.0O";
  expect(findReference(maya)).toBe("6A2B91C477D1");
  expect(findDate(maya, NOW)).toBe("2026-11-12");
  expect(findAmounts(maya)).toContain(2000);
});
