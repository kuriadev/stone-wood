// ── "Did you mean …@gmail.com?"
//
// Pure: runs in Book Now and the walk-in window as the email is typed.
// Most confirmations that never arrive went to a misspelt provider
// (gmial.com, gmail.con, yaho.com), so a near miss on a well-known
// provider, or ".con" for ".com", gets a one-tap suggestion. It is only a
// suggestion: a real address that happens to look close can be kept.

/** Providers guests here actually use, plus real ones that sit close to
 *  them (mail.com, email.com), so those are never "corrected". */
const KNOWN = [
  "gmail.com", "yahoo.com", "yahoo.com.ph", "ymail.com", "rocketmail.com",
  "outlook.com", "outlook.ph", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "email.com", "zoho.com", "yandex.com",
];
const KNOWN_SET = new Set(KNOWN);

/** Endings that are always a slip for ".com". */
const BAD_COM = /\.(con|cmo|ocm|vom|xom|comm|coom|cpm|c0m|om)$/;

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** The address the guest probably meant, or null when it looks fine (or
 *  isn't far enough along to tell). */
export function suggestEmail(raw: string): string | null {
  const email = (raw ?? "").trim();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain.includes(".") && domain.length < 6) return null;
  if (KNOWN_SET.has(domain)) return null;

  // Closest well-known provider: one slip for a short name, two for a
  // longer one ("gmial.com", "gmailcom", "yahooo.com", "hotmial.com").
  let best: string | null = null;
  let bestD = 3;
  for (const k of KNOWN) {
    const d = distance(domain, k);
    if (d < bestD) { best = k; bestD = d; }
  }
  if (best && bestD <= (best.length <= 8 ? 1 : 2)) return `${local}@${best}`;

  // Any other domain ending in ".con" and the like.
  if (BAD_COM.test(domain)) return `${local}@${domain.replace(BAD_COM, ".com")}`;
  return null;
}
