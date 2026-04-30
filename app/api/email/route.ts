// ── POST /api/email  →  send booking confirmation OR rejection email
//
// Required env vars (in .env.local):
//   GMAIL_USER=your.email@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← 16-char Gmail App Password

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { buildReceiptEmail, buildRejectionEmail, generateOTP } from "@/lib/emailTemplate";
import type { Booking } from "@/types/booking"; 

export async function POST(req: NextRequest) {
  try {
    const { booking, type, reason }: { booking: Booking; type: "confirmed" | "rejected"; reason?: string } = await req.json();

    if (!booking?.email) {
      return NextResponse.json({ error: "Booking email is required." }, { status: 400 });
    }

    // ── Build the correct email based on type ────────────────────────────────
    let subject: string;
    let html: string;
    let otp: string | null = null;

    if (type === "confirmed") {
      otp = generateOTP();
      ({ subject, html } = buildReceiptEmail(booking, otp));
    } else {
      ({ subject, html } = buildRejectionEmail(booking, reason || ""));
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
    console.error("[/api/email] Failed to send:", err);
    return NextResponse.json(
      { error: "Failed to send email.", detail: String(err) },
      { status: 500 }
    );
  }
}
