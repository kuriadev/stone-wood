// ── Reading the import template
//
// Pure: no React, no network, no exceljs. Takes the sheet as a grid of
// cell values (the first row the headers) and turns each line into the
// walk-in body POST /api/bookings/import checks. A line that can't be read
// says why, in the words of the template, before anything is sent.
//
// The columns are found by their header, so a sheet whose columns were
// moved, or one typed up from the printed offline sheet, still reads.

import { SLOTS } from "@/lib/resort";
import type { BookingResource, BookingSlot, BookingTier } from "@/types/booking";

/** The template's columns, in order. `key` is what the reader looks for. */
export const IMPORT_COLUMNS: { key: ImportKey; header: string; width: number; hint: string }[] = [
  { key: "name", header: "Guest name", width: 24, hint: "Required." },
  { key: "contact", header: "Contact number", width: 16, hint: "Required. 09XXXXXXXXX." },
  { key: "email", header: "Email", width: 26, hint: "Optional." },
  { key: "first", header: "First day", width: 13, hint: "Required. Today or later, e.g. 2026-11-05." },
  { key: "last", header: "Last day", width: 13, hint: "Staycation over several days only. Leave blank for one day." },
  { key: "tour", header: "Tour", width: 13, hint: "Pick from the list." },
  { key: "booking", header: "Booking", width: 28, hint: "Pick from the list." },
  { key: "pool", header: "Pool", width: 11, hint: "Shared or Exclusive. Blank means Shared (Exclusive for a Staycation)." },
  { key: "guests", header: "Guests", width: 8, hint: "Required. How many are coming." },
  { key: "rooms", header: "Rooms", width: 22, hint: "Optional. Room names, separated by commas." },
  { key: "amount", header: "Amount paid", width: 13, hint: "Optional. Pesos taken; leave blank if nothing was paid." },
  { key: "method", header: "Paid by", width: 14, hint: "Cash, GCash or Bank Transfer." },
  { key: "reference", header: "Reference no.", width: 16, hint: "For GCash and bank transfers." },
  { key: "notes", header: "Notes", width: 30, hint: "Optional." },
];

export type ImportKey = "name" | "contact" | "email" | "first" | "last" | "tour" | "booking" | "pool" | "guests" | "rooms" | "amount" | "method" | "reference" | "notes";

/** The choices the template offers, as dropdowns. */
export const BOOKING_CHOICES: { label: string; resource: BookingResource }[] = [
  { label: "Resort & pool", resource: "Pool" },
  { label: "Resort & pool + Events Venue", resource: "Pool+Venue" },
  { label: "Events Venue only", resource: "Venue" },
];
export const tourChoices = (): { label: string; slot: BookingSlot }[] =>
  (["Day", "Night", "WholeDay"] as BookingSlot[]).map((s) => ({ label: SLOTS[s].label, slot: s }));
export const POOL_CHOICES: BookingTier[] = ["Shared", "Exclusive"];
export const METHOD_CHOICES = ["Cash", "GCash", "Bank Transfer"] as const;

/** What one line becomes. */
export interface ImportBody {
  name: string;
  contact: string;
  email: string;
  date: string;
  endDate?: string;
  slot: BookingSlot;
  resource: BookingResource;
  tier?: BookingTier;
  guests: number;
  rooms: number[];
  notes: string;
  initialPayment?: { type: "Downpayment"; method: string; amount: number; reference: string };
}

export interface ImportLine {
  /** The spreadsheet's own row number, as the person sees it. */
  line: number;
  /** One readable line: who, when, what. */
  summary: string;
  body?: ImportBody;
  /** Why the line can't be read. */
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Text of a cell, whatever exceljs handed back: a plain value, a date, a
 *  hyperlink (Excel turns typed emails into those), rich text or a formula. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
    return "";
  }
  return String(v).trim();
}

/** A date as YYYY-MM-DD: a real date cell, an Excel day number, or text
 *  typed as 2026-11-05 or 11/5/2026. Null when it isn't one. */
export function readDate(v: unknown): string | null {
  if (v instanceof Date) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = cellText(v);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return valid(+m[3], +m[1], +m[2]);
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? iso(y, mo, d) : null;
}

/** A PH mobile number as 09XXXXXXXXX. Excel drops the leading 0 of a number
 *  typed into a number cell, and some people write +63. */
export function readContact(v: unknown): string {
  const digits = cellText(v).replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  if (digits.length === 12 && digits.startsWith("639")) return `0${digits.slice(2)}`;
  return digits;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Which column holds what, from the header row. */
function headerMap(header: unknown[]): Partial<Record<ImportKey, number>> {
  const out: Partial<Record<ImportKey, number>> = {};
  header.forEach((h, i) => {
    const t = norm(cellText(h));
    const key: ImportKey | undefined =
      /^(guest )?name/.test(t) ? "name"
        : /^(contact|phone|mobile)/.test(t) ? "contact"
          : /^e-?mail/.test(t) ? "email"
            : /^(first day|date)/.test(t) ? "first"
              : /^last day/.test(t) ? "last"
                : /^tour/.test(t) ? "tour"
                  : /^(booking|what)/.test(t) ? "booking"
                    : /^pool/.test(t) ? "pool"
                      : /^(guests|pax)/.test(t) ? "guests"
                        : /^rooms?/.test(t) ? "rooms"
                          : /^amount/.test(t) ? "amount"
                            : /^(paid by|method)/.test(t) ? "method"
                              : /^ref/.test(t) ? "reference"
                                : /^notes?/.test(t) ? "notes"
                                  : undefined;
    if (key && out[key] === undefined) out[key] = i;
  });
  return out;
}

/**
 * The sheet, line by line. `grid[0]` is the header row; each later row is
 * one booking, and a row with nothing in it is skipped. `firstLine` is the
 * spreadsheet row number of grid[0] (1 in the template).
 */
export function readImportSheet(grid: unknown[][], rooms: { id: number; name: string }[], firstLine = 1): { lines: ImportLine[]; missing: string[] } {
  const cols = headerMap(grid[0] ?? []);
  const required: ImportKey[] = ["name", "contact", "first", "tour", "guests"];
  const missing = required.filter((k) => cols[k] === undefined).map((k) => IMPORT_COLUMNS.find((c) => c.key === k)!.header);
  if (missing.length) return { lines: [], missing };

  const tours = tourChoices();
  const lines: ImportLine[] = [];
  grid.slice(1).forEach((r, i) => {
    const at = (k: ImportKey) => (cols[k] === undefined ? undefined : r[cols[k]!]);
    const text = (k: ImportKey) => cellText(at(k));
    if (IMPORT_COLUMNS.every((c) => !text(c.key))) return;
    const line = firstLine + 1 + i;
    const name = text("name");
    const first = readDate(at("first"));
    const lastRaw = text("last");
    const last = lastRaw ? readDate(at("last")) : null;
    const tourText = norm(text("tour"));
    const tour = tours.find((t) => norm(t.label) === tourText || norm(t.slot) === tourText || (t.slot === "WholeDay" && /whole ?day/.test(tourText)));
    const bookingText = norm(text("booking"));
    const booking = !bookingText ? BOOKING_CHOICES[0]
      : BOOKING_CHOICES.find((c) => norm(c.label) === bookingText)
        ?? (/venue only/.test(bookingText) ? BOOKING_CHOICES[2] : /venue/.test(bookingText) ? BOOKING_CHOICES[1] : /pool|resort/.test(bookingText) ? BOOKING_CHOICES[0] : undefined);
    const poolText = norm(text("pool"));
    const tier = POOL_CHOICES.find((p) => norm(p) === poolText);
    const guests = Number(text("guests"));
    const summary = [name || "(no name)", first ?? (text("first") || "(no date)"), tour?.label ?? text("tour"), booking?.label ?? text("booking"), Number.isFinite(guests) && guests > 0 ? `${guests} guest${guests === 1 ? "" : "s"}` : ""]
      .filter(Boolean).join(" · ");
    const fail = (error: string) => lines.push({ line, summary, error });

    if (!name) return fail("Add the guest's name.");
    if (!first) return fail("First day isn't a date. Write it like 2026-11-05.");
    if (lastRaw && !last) return fail("Last day isn't a date. Write it like 2026-11-07, or leave it blank.");
    if (!tour) return fail(`Tour must be ${tours.map((t) => t.label).join(", ").replace(/, ([^,]*)$/, " or $1")}.`);
    if (!booking) return fail(`Booking must be ${BOOKING_CHOICES.map((c) => c.label).join(", ").replace(/, ([^,]*)$/, " or $1")}.`);
    if (poolText && !tier) return fail("Pool must be Shared or Exclusive.");
    if (!Number.isFinite(guests) || guests < 1 || !Number.isInteger(guests)) return fail("Guests must be a whole number, 1 or more.");

    const roomIds: number[] = [];
    for (const want of text("rooms").split(/[,;]/).map((s) => norm(s)).filter(Boolean)) {
      const room = rooms.find((x) => norm(x.name) === want) ?? rooms.find((x) => norm(x.name).startsWith(want));
      if (!room) return fail(`There is no room called "${want}".`);
      if (!roomIds.includes(room.id)) roomIds.push(room.id);
    }

    const amountText = text("amount").replace(/[₱,\s]/g, "");
    const amount = amountText ? Number(amountText) : 0;
    if (amountText && (!Number.isFinite(amount) || amount < 0)) return fail("Amount paid must be a number of pesos.");
    const methodText = norm(text("method"));
    const method = METHOD_CHOICES.find((m) => norm(m) === methodText) ?? (methodText === "bank" ? "Bank Transfer" : undefined);
    if (amount > 0 && methodText && !method) return fail("Paid by must be Cash, GCash or Bank Transfer.");

    lines.push({
      line,
      summary,
      body: {
        name,
        contact: readContact(at("contact")),
        email: text("email"),
        date: first,
        ...(last && last !== first ? { endDate: last } : {}),
        slot: tour.slot,
        resource: booking.resource,
        ...(tier && booking.resource !== "Venue" ? { tier } : {}),
        guests,
        rooms: roomIds,
        notes: text("notes"),
        ...(amount > 0 ? { initialPayment: { type: "Downpayment" as const, method: method ?? "Cash", amount, reference: text("reference") } } : {}),
      },
    });
  });
  return { lines, missing: [] };
}
