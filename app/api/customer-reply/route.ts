// ── POST /api/customer-reply  → email a reply to a customer
//
// This route was, until now, an unauthenticated open mail relay. Anyone on the
// internet could POST an arbitrary recipient and arbitrary HTML and have it
// delivered from the resort's own Gmail address — a phishing kit with the
// resort's return address on it, and a fast route to having the account
// suspended. It is now admin-only, escaped, validated and rate limited.

import nodemailer from "nodemailer";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { escapeHtml, sanitizeHeaderValue } from "@/lib/escapeHtml";
import { isValidEmail } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const limited = rateLimit(req, { name: "customer-reply", limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const body = await req.json().catch(() => ({}));
    const customerEmail = typeof body?.customerEmail === "string" ? body.customerEmail.trim() : "";
    const customerName = sanitizeHeaderValue(body?.customerName, 100);
    const message = typeof body?.message === "string" ? body.message.slice(0, 5000) : "";
    const type = sanitizeHeaderValue(body?.type, 60);

    if (!isValidEmail(customerEmail)) {
      return NextResponse.json({ success: false, error: "A valid customer email is required." }, { status: 400 });
    }
    if (!message.trim()) {
      return NextResponse.json({ success: false, error: "A message is required." }, { status: 400 });
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error("[/api/customer-reply] GMAIL_USER or GMAIL_APP_PASSWORD is not set.");
      return NextResponse.json({ success: false, error: "Email is not configured." }, { status: 503 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    // Every interpolated value is escaped. The reply is written by staff, but
    // the name came from a public form, and treating one input as trusted
    // because it is usually fine is how injection bugs survive.
    const safeName = escapeHtml(customerName) || "there";
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br/>");

    await transporter.sendMail({
      from: `"Stonewood Resort" <${process.env.GMAIL_USER}>`,
      to: customerEmail,
      subject: `Customer Service Response${type ? ` - ${type}` : ""}`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;">
          <h2 style="color:#c9a84c;">
            Stonewood Resort Customer Service
          </h2>

          <p>Hello ${safeName},</p>

          <p>${safeMessage}</p>

          <br/>

          <p>
            Thank you for contacting us.
          </p>

          <p>
            — Stonewood Resort Support Team
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    // Logged in full, returned as a generic failure: the underlying error can
    // name the SMTP host and the account it tried to authenticate as.
    console.error("[/api/customer-reply] Failed to send:", err);
    return NextResponse.json({ success: false, error: "Failed to send the reply." }, { status: 500 });
  }
}
