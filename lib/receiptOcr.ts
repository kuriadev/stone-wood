// ── Reading a payment receipt (the words, after OCR)
//
// The guest uploads a screenshot of their GCash / Maya / bank receipt. The
// browser turns it into text (lib/receiptImage.ts, tesseract.js) and this
// decides whether it is a real receipt for this booking:
//
//   reference   GCash "Ref. No. 1234 567 891234", Maya "Reference ID …",
//               a bank's "Reference number" / "Transaction ID"
//   date        a date on the receipt, from the last few days (not a year-old
//               screenshot, not the future)
//   amount      the amount sent; it must be the "Pay now" amount
//   name        the resort's GCash account name, or the guest's own name
//
// A random photo has none of these and is turned away. A real receipt needs
// the reference and the date, and either the right amount or the name.
// Staff still check every one by eye; this only keeps out the obvious junk.

export interface ReceiptRead {
  reference: string | null;
  /** YYYY-MM-DD, when a date was found. */
  date: string | null;
  /** Every peso amount found, e.g. [200, 0]. */
  amounts: number[];
  amountMatch: boolean;
  nameFound: boolean;
}

export interface ReceiptCheck extends ReceiptRead {
  ok: boolean;
  /** Why it was turned away: what's missing, in the guest's words. */
  problem: "not-receipt" | "wrong-amount" | "old-date" | null;
  missing: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** OCR mixes up O/0, l/1, S/5 inside numbers; fix them where digits belong. */
function digitsOnly(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/[^0-9]/g, "");
}

export function findReference(text: string): string | null {
  // A label, then the code: "Ref. No. 0012 345 678901", "Reference ID: ABCD-1234".
  const labelled = /(?:ref(?:erence)?\.?\s*(?:no\.?|number|num|id|#|code)?|transaction\s*(?:id|no\.?|number)|trace\s*no\.?|invoice\s*no\.?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9 \-]{5,32})/i;
  const m = labelled.exec(text);
  if (m) {
    const raw = m[1].trim().replace(/\s{2,}.*/, "");
    const code = raw.replace(/[\s-]/g, "");
    if (code.length >= 6 && (code.match(/\d/g) ?? []).length >= 4) return code.toUpperCase().slice(0, 32);
  }
  // No label read: a GCash reference is 13 digits, often written 4-3-6.
  const bare = /\b(\d{4}\s?\d{3}\s?\d{6})\b/.exec(text);
  if (bare) return bare[1].replace(/\s/g, "");
  return null;
}

export function findDate(text: string, now = new Date()): string | null {
  const y0 = now.getFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, mo: number, d: number) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= y0 - 1 && y <= y0 + 1 ? `${y}-${pad(mo)}-${pad(d)}` : null);
  // "Nov 12, 2026", "12 Nov 2026", "November 12 2026"
  const named = /\b(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?,?\s+(\d{4})\b/i.exec(text);
  if (named) {
    const mo = MONTHS.indexOf(named[2].toLowerCase().slice(0, 3)) + 1;
    const d = Number(named[3] ?? named[1]);
    const got = ok(Number(named[4]), mo, d);
    if (got) return got;
  }
  // "2026-11-12"
  const iso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (iso) { const got = ok(Number(iso[1]), Number(iso[2]), Number(iso[3])); if (got) return got; }
  // "11/12/2026" (month first, as GCash and most PH banks print it) or "12-11-2026"
  const num = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (num) {
    const y = Number(num[3].length === 2 ? `20${num[3]}` : num[3]);
    const a = Number(num[1]), b = Number(num[2]);
    return ok(y, a, b) ?? ok(y, b, a);
  }
  return null;
}

export function findAmounts(text: string): number[] {
  const out = new Set<number>();
  // "₱200.00", "PHP 1,250.00", "P200.00", "Amount 200.00"; OCR often reads ₱ as P or F.
  const re = /(?:₱|php|p|f|amount|total|sent)\s*:?\s*([0-9OolI][0-9OolI,]*\.[0-9OolI]{2})\b/gi;
  for (const m of text.matchAll(re)) {
    const [whole, cents] = m[1].split(".");
    const n = Number(`${digitsOnly(whole)}.${digitsOnly(cents)}`);
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) out.add(Math.round(n * 100) / 100);
  }
  // A bare "200.00" too, when nothing was labelled.
  if (out.size === 0) {
    for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (n > 0) out.add(n);
    }
  }
  return [...out];
}

/** Any word of the names (3+ letters) on the receipt. GCash masks names as
 *  "JO*N D.", so the visible start of a word counts. */
export function nameOnReceipt(text: string, names: string[]): boolean {
  const hay = text.toLowerCase();
  for (const name of names) {
    for (const word of name.toLowerCase().split(/[^a-zñ]+/).filter((w) => w.length >= 3)) {
      if (hay.includes(word) || hay.includes(word.slice(0, 2) + "*")) return true;
    }
  }
  return false;
}

/** The whole check. `due` is the "Pay now" amount; `names` the resort's
 *  GCash account name and the guest's name. */
export function checkReceipt(text: string, opts: { due: number; names: string[]; now?: Date }): ReceiptCheck {
  const now = opts.now ?? new Date();
  const reference = findReference(text);
  const date = findDate(text, now);
  const amounts = findAmounts(text);
  const amountMatch = amounts.some((a) => Math.abs(a - opts.due) < 0.01);
  const nameFound = nameOnReceipt(text, opts.names);
  const read: ReceiptRead = { reference, date, amounts, amountMatch, nameFound };

  const missing: string[] = [];
  if (!reference) missing.push("the reference number");
  if (!date) missing.push("the date");
  if (!amountMatch && !nameFound) missing.push(amounts.length ? "the right amount" : "the amount or name");
  if (!reference || !date) return { ...read, ok: false, problem: "not-receipt", missing };

  // Paid within the last week, and not tomorrow.
  const days = (Date.parse(`${date}T12:00:00+08:00`) - now.getTime()) / 86_400_000;
  if (days > 1 || days < -7) return { ...read, ok: false, problem: "old-date", missing: [] };

  if (!amountMatch && !nameFound) {
    return { ...read, ok: false, problem: amounts.length ? "wrong-amount" : "not-receipt", missing };
  }
  return { ...read, ok: true, problem: null, missing: [] };
}
