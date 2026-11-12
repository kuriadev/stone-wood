// ── Text no field should hold
//
// Every text a guest or staff member types (names, notes, messages,
// addresses, settings, package text …) is cleaned of:
//   - emoji, including flags, skin tones, keycaps and joined sequences
//     (👨‍👩‍👧), and picture symbols such as ✔ ★ ♥ ☎ © ™ (the degree
//     sign ° stays; currency like ₱ and maths like + = are not symbols here);
//   - control characters (anything invisible below a space, except a new
//     line or tab in a multi-line field);
//   - invisible formatting characters: zero-width spaces and joiners,
//     right-to-left overrides (used to disguise text, e.g. a file name that
//     reads backwards) and the hidden "tag" characters.
//
// The same rule runs in two places: in the browser on every text field
// (components/common/TextGuard.tsx), so the characters never appear, and on
// the server for every JSON request (lib/readJson.ts), so a request sent
// around the page is cleaned too. Passwords are left exactly as typed.

const EMOJI = /(?!\u00B0)\p{So}|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u20E3\uFE0E\uFE0F]/gu;
// A keycap emoji (1️⃣) is a digit + U+FE0F + U+20E3: drop the two joiners and
// keep the digit. A bare digit, # or * is never touched.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u00AD]|[\u{E0000}-\u{E007F}]/gu;

/** True when `s` holds anything cleanText would remove. */
export function hasUnsafeText(s: string): boolean {
  EMOJI.lastIndex = 0; CONTROL.lastIndex = 0; INVISIBLE.lastIndex = 0;
  return EMOJI.test(s) || CONTROL.test(s) || INVISIBLE.test(s);
}

/** `s` without emoji, control or invisible characters. New lines and tabs
 *  stay (notes and messages have paragraphs). */
export function cleanText(s: string): string {
  return s.replace(EMOJI, "").replace(CONTROL, "").replace(INVISIBLE, "");
}

/** Keys whose value is kept exactly as sent: a password must not change
 *  under the person typing it. Matched on the field's name. */
const KEEP = /pass(word)?|secret/i;

/** Every string inside `v` (objects and lists, any depth) cleaned. */
export function cleanDeep<T>(v: T, key = ""): T {
  if (typeof v === "string") return (KEEP.test(key) ? v : cleanText(v)) as T;
  if (Array.isArray(v)) return v.map((x) => cleanDeep(x, key)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = cleanDeep(x, k);
    return out as T;
  }
  return v;
}
