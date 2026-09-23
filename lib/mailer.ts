// ── Outgoing mail
//
// SERVER ONLY.
//
// One place that knows how to reach Gmail, and one place that decides what
// "configured" means. The transporter was being rebuilt inline in every route
// that sends, each with its own slightly different missing-credentials check.

import nodemailer from "nodemailer";

/** True when both Gmail variables are present. Checked before building a
 *  transporter so a misconfigured deploy fails as a clear 503 rather than an
 *  SMTP timeout thirty seconds later. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function transporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

/** Send and throw on failure. Use where the caller reports the outcome. */
export async function sendMail({ to, subject, html }: Mail): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD are not set.");
  }
  await transporter().sendMail({
    from: `"StoneWood Resort" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

/**
 * Send, but never throw.
 *
 * For mail that accompanies an action rather than being the action. A guest
 * who has just paid must not see their booking fail because Gmail was slow or
 * the app password expired — the booking is already saved, and a missing
 * acknowledgement is an inconvenience, not a lost reservation.
 *
 * Returns whether it went out, so the caller can say so in its response.
 */
export async function trySendMail(mail: Mail, label: string): Promise<boolean> {
  if (!isMailConfigured()) {
    console.warn(`[mailer] ${label}: skipped, GMAIL_USER / GMAIL_APP_PASSWORD not set.`);
    return false;
  }
  try {
    await sendMail(mail);
    return true;
  } catch (err) {
    console.error(`[mailer] ${label}: send failed:`, err);
    return false;
  }
}
