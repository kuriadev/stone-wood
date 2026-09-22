/**
 * Escape a value for interpolation into an HTML string.
 *
 * The email builders assemble HTML by hand from booking fields and from
 * whatever a guest typed into the contact form. Without this, a `message` of
 * `<a href="http://evil">Click to confirm</a>` renders as a working link in an
 * email sent from the resort's own Gmail address — a ready-made phishing
 * template, signed by us.
 *
 * Quotes are escaped too, not just angle brackets: several values land inside
 * attributes, where a bare `"` would break out of the attribute.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip anything that cannot legally appear in a mail header.
 *
 * CR and LF in a subject line let a caller append their own headers — a second
 * `Bcc:` being the classic one. Nodemailer guards most of this, but the value
 * is untrusted before it ever reaches nodemailer, so it is cleaned here.
 */
export function sanitizeHeaderValue(value: unknown, max = 200): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}
