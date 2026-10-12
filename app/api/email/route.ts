// ── POST /api/email  →  send booking confirmation OR rejection email
//
// Required env vars (in .env.local):
//   GMAIL_USER=your.email@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← 16-char Gmail App Password

import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity.server";
import nodemailer from "nodemailer";
import {
  buildReceiptEmail, buildRejectionEmail, buildGuestMessageEmail,
  GUEST_MESSAGE_MAX, GUEST_SUBJECT_MAX, type RejectionMoney,
} from "@/lib/emailTemplate";
import { requirePermission } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isValidEmail } from "@/lib/validators";
import type { Booking } from "@/types/booking";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Only an admin confirms or rejects a booking. Unauthenticated, this route
  // sent attacker-supplied content to an attacker-supplied address from the
  // resort's Gmail account.
  const denied = await requirePermission(req, "bookings.edit");
  if (denied) return denied;

  const limited = rateLimit(req, { name: "email", limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const { booking, type, reason, money, subject: subjectIn, message }: {
      booking: Booking;
      type: "confirmed" | "rejected" | "message";
      reason?: string;
      money?: RejectionMoney;
      subject?: string;
      message?: string;
    } = await req.json();

    if (!booking?.email || !isValidEmail(booking.email)) {
      return NextResponse.json({ error: "A valid booking email is required." }, { status: 400 });
    }
    if (type !== "confirmed" && type !== "rejected" && type !== "message") {
      return NextResponse.json({ error: "type must be 'confirmed', 'rejected' or 'message'." }, { status: 400 });
    }
    // A free-typed note needs something in it. Length is capped here as
    // well as in the form, because the form is not what decides.
    if (type === "message") {
      const body = String(message ?? "").trim();
      if (!body) return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
      if (body.length > GUEST_MESSAGE_MAX) {
        return NextResponse.json({ error: `A message can be at most ${GUEST_MESSAGE_MAX} characters.` }, { status: 400 });
      }
      if (String(subjectIn ?? "").length > GUEST_SUBJECT_MAX) {
        return NextResponse.json({ error: `A subject can be at most ${GUEST_SUBJECT_MAX} characters.` }, { status: 400 });
      }
    }
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error("[/api/email] GMAIL_USER or GMAIL_APP_PASSWORD is not set.");
      return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
    }

    // ── Build the correct email based on type ────────────────────────────────
    let subject: string;
    let html: string;

    if (type === "confirmed") {
      ({ subject, html } = buildReceiptEmail(booking));
    } else if (type === "message") {
      ({ subject, html } = buildGuestMessageEmail(booking, String(subjectIn ?? ""), String(message ?? "")));
    } else {
      // Only well-formed money details reach the template; anything else
      // falls back to the generic line.
      const m = money && typeof money.paid === "number" && Number.isFinite(money.paid)
        ? {
            paid: Math.max(0, money.paid),
            refund: money.refund && Number.isFinite(Number(money.refund.amount))
              ? { amount: Number(money.refund.amount), method: String(money.refund.method ?? "").slice(0, 40), reference: String(money.refund.reference ?? "").slice(0, 80) }
              : null,
          }
        : undefined;
      ({ subject, html } = buildRejectionEmail(booking, (reason || "").slice(0, 1000), m));
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

    const ACTION = { confirmed: "email.confirmation", rejected: "email.rejection", message: "email.message" } as const;
    const WHAT = {
      confirmed: "the booking confirmation",
      rejected: "the cancellation notice",
      message: "a message",
    } as const;
    await logActivity({
      actor: "Admin", action: ACTION[type], bookingId: booking.id ?? null, entity: "booking", entityId: booking.id,
      summary: `Emailed ${WHAT[type]} for ${booking.id} to ${booking.email}.`,
      // The note itself goes in the log, so "what did we tell them?" has an
      // answer later. The subject alone would not.
      details: type === "message" ? { subject, message: String(message ?? "").slice(0, GUEST_MESSAGE_MAX) } : undefined,
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    // `detail: String(err)` used to go back to the caller. An SMTP failure
    // names the host and the account it authenticated as; that stays in the
    // server log.
    console.error("[/api/email] Failed to send:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
