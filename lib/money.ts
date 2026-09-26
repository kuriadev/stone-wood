// Server-side parsing for money coming in from admin forms.

/** A positive peso amount rounded to centavos, or null if unusable. */
export function parseAmount(v: unknown, max = 1_000_000): number | null {
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return n;
}

export const cleanText = (v: unknown, max = 300): string =>
  String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);

export const isDateStr = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
