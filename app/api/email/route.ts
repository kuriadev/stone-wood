// ── POST /api/email  →  send booking confirmation OR rejection email
//
// Required env vars (in .env.local):
//   GMAIL_USER=your.email@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← 16-char Gmail App Password

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { buildReceiptEmail, buildRejectionEmail, generateOTP } from "@/lib/emailTemplate";
import { requireAdmin } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail } from "@/lib/validators";
import type { Booking } from "@/types/booking";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Only an admin confirms or rejects a booking. Unauthenticated, this route
  // sent attacker-supplied content to an attacker-supplied address from the
  // resort's Gmail account, and handed back the check-in OTP for free.
  const denied = requireAdmin(req);
  if (denied) return denied;

  const limited = rateLimit(req, { name: "email", limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const { booking, type, reason }: { booking: Booking; type: "confirmed" | "rejected"; reason?: string } = await req.json();

    if (!booking?.email || !isValidEmail(booking.email)) {
      return NextResponse.json({ error: "A valid booking email is required." }, { status: 400 });
    }
    if (type !== "confirmed" && type !== "rejected") {
      return NextResponse.json({ error: "type must be 'confirmed' or 'rejected'." }, { status: 400 });
    }
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error("[/api/email] GMAIL_USER or GMAIL_APP_PASSWORD is not set.");
      return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
    }

    // ── Build the correct email based on type ────────────────────────────────
    let subject: string;
    let html: string;
    let otp: string | null = null;

    if (type === "confirmed") {
      otp = generateOTP();
      ({ subject, html } = buildReceiptEmail(booking, otp));
    } else {
      ({ subject, html } = buildRejectionEmail(booking, (reason || "").slice(0, 1000)));
    }

    // ── Configure Nodemailer transporter (Gmail SMTP) ────────────────────────
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // ── Send the email ───────────────────────────────────────────────────────
    await transporter.sendMail({
      from: `"StoneWood Resort" <${process.env.GMAIL_USER}>`,
      to: booking.email,
      subject,
      html,
    });

    return NextResponse.json({ success: true, ...(otp ? { otp } : {}) }, { status: 200 });
  } catch (err) {
    // `detail: String(err)` used to go back to the caller. An SMTP failure
    // names the host and the account it authenticated as; that stays in the
    // server log.
    console.error("[/api/email] Failed to send:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
