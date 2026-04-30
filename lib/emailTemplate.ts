 import type { Booking } from "@/types/booking";

export function generateOTP(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0,O,1,I)
  let otp = "SW-";
  for (let i = 0; i < 4; i++) otp += chars[Math.floor(Math.random() * chars.length)];
  otp += "-";
  for (let i = 0; i < 4; i++) otp += chars[Math.floor(Math.random() * chars.length)];
  return otp; // e.g. SW-X4K2-9MBR
}

function fmt(n: number) {
  return `₱${Number(n).toLocaleString()}`;
}

function formatDate(ds: string) {
  try {
    return new Date(ds + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return ds;
  }
}

export function buildRejectionEmail(booking: Booking, reason: string): { subject: string; html: string } {
  const subject = `❌ Booking Update – ${booking.id} | StoneWood Resort`;
  const defaultReason = "Your booking did not meet our current availability or requirements.";
  const displayReason = reason.trim() || defaultReason;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Update – StoneWood Resort</title>
</head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a0808 0%,#2d0a0a 60%,#1a0808 100%);border-radius:12px 12px 0 0;padding:40px 36px;text-align:center;">
              <p style="margin:0 0 4px;color:#c9a84c;font-size:11px;letter-spacing:4px;text-transform:uppercase;">StoneWood Resort</p>
              <h1 style="margin:0 0 6px;color:#f0e6cc;font-size:28px;font-weight:400;letter-spacing:1px;">Booking Not Confirmed</h1>
              <p style="margin:0;color:#e07070;font-size:13px;">We're sorry, your reservation was not approved</p>
              <div style="margin:20px auto 0;width:48px;height:1px;background:linear-gradient(90deg,transparent,#c9a84c,transparent);"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px;">

              <p style="margin:0 0 24px;color:#3a2e1e;font-size:16px;line-height:1.7;">
                Dear <strong>${booking.name}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#5a4a35;font-size:14px;line-height:1.8;">
                Thank you for choosing <strong>StoneWood Resort</strong>. Unfortunately, we were unable to confirm your reservation at this time.
              </p>

              <!-- Booking ID -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#faf5e8;border:1px solid #e2d5b0;border-radius:8px;padding:16px 20px;">
                    <p style="margin:0 0 4px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Booking Reference</p>
                    <p style="margin:0;color:#1a1108;font-size:22px;font-family:monospace;font-weight:700;letter-spacing:2px;">${booking.id}</p>
                  </td>
                </tr>
              </table>

              <!-- Booking Summary -->
              <p style="margin:0 0 12px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;border-bottom:1px solid #e8e0cc;padding-bottom:8px;">Booking Summary</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                ${[
                  ["Full Name", booking.name],
                  ["Date of Visit", formatDate(booking.date)],
                  ["Package", booking.package],
                  ["Number of Guests", `${booking.guests} pax`],
                  ["Total Amount", fmt(booking.total)],
                ].map(([label, value]) => `
                <tr>
                  <td style="padding:9px 0;border-bottom:1px solid #f0e8d8;color:#8a6d3b;font-size:12px;width:40%;">${label}</td>
                  <td style="padding:9px 0;border-bottom:1px solid #f0e8d8;color:#2a1f0e;font-size:13px;font-weight:600;">${value}</td>
                </tr>`).join("")}
              </table>

              <!-- Reason -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#fff5f5;border:1px solid #f5c6c6;border-left:4px solid #e55555;border-radius:0 8px 8px 0;padding:20px;">
                    <p style="margin:0 0 8px;color:#c0392b;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Reason</p>
                    <p style="margin:0;color:#4a2828;font-size:14px;line-height:1.8;font-style:italic;">"${displayReason}"</p>
                  </td>
                </tr>
              </table>

              <!-- Encourage rebooking -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#faf5e8;border:1px solid #e2d5b0;border-radius:8px;padding:20px;">
                    <p style="margin:0 0 12px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;">What You Can Do</p>
                    <p style="margin:0 0 8px;color:#4a3a28;font-size:13px;line-height:1.7;">📅 Try booking a different date that may be available.</p>
                    <p style="margin:0 0 8px;color:#4a3a28;font-size:13px;line-height:1.7;">📞 Contact us directly to check availability and discuss options.</p>
                    <p style="margin:0;color:#4a3a28;font-size:13px;line-height:1.7;">💳 If a downpayment was made, our team will process your refund shortly.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#5a4a35;font-size:14px;line-height:1.8;">
                We hope to welcome you another time.<br/>
                <strong style="color:#2a1f0e;">The StoneWood Resort Team</strong>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1a1108;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
              <p style="margin:0 0 4px;color:#c9a84c;font-size:11px;letter-spacing:3px;text-transform:uppercase;">StoneWood Resort</p>
              <p style="margin:0;color:#5a4a35;font-size:11px;">This is an automated notification email. Please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();

  return { subject, html };
}

export function buildReceiptEmail(booking: Booking, otp: string): { subject: string; html: string } {
  const subject = `✅ Booking Confirmed – ${booking.id} | StoneWood Resort`;

  const extraGuests = booking.guests > 30 ? (booking.guests - 30) * 100 : 0;
  const overtimeFee = (booking.overtime || 0) * 500;
  const baseFee = 6000;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmed – StoneWood Resort</title>
</head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1108 0%,#2d1f0a 60%,#1a1108 100%);border-radius:12px 12px 0 0;padding:40px 36px;text-align:center;">
              <p style="margin:0 0 4px;color:#c9a84c;font-size:11px;letter-spacing:4px;text-transform:uppercase;">StoneWood Resort</p>
              <h1 style="margin:0 0 6px;color:#f0e6cc;font-size:28px;font-weight:400;letter-spacing:1px;">Booking Confirmed</h1>
              <p style="margin:0;color:#c9a84c;font-size:13px;">Your reservation has been accepted</p>
              <div style="margin:20px auto 0;width:48px;height:1px;background:linear-gradient(90deg,transparent,#c9a84c,transparent);"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px;">

              <!-- Greeting -->
              <p style="margin:0 0 24px;color:#3a2e1e;font-size:16px;line-height:1.7;">
                Dear <strong>${booking.name}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#5a4a35;font-size:14px;line-height:1.8;">
                We're delighted to confirm your reservation at <strong>StoneWood Resort</strong>. Please find your booking details and one-time access code below.
              </p>

              <!-- Booking ID badge -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#faf5e8;border:1px solid #e2d5b0;border-radius:8px;padding:16px 20px;">
                    <p style="margin:0 0 4px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Booking Reference</p>
                    <p style="margin:0;color:#1a1108;font-size:22px;font-family:monospace;font-weight:700;letter-spacing:2px;">${booking.id}</p>
                  </td>
                </tr>
              </table>

              <!-- Guest Details -->
              <p style="margin:0 0 12px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;border-bottom:1px solid #e8e0cc;padding-bottom:8px;">Guest Information</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                ${[
                  ["Full Name", booking.name],
                  ["Contact Number", booking.contact],
                  ["Email Address", booking.email],
                  ["Number of Guests", `${booking.guests} pax`],
                  ["Date of Visit", formatDate(booking.date)],
                  ["Package", booking.package],
                  ...(booking.overtime ? [["Overtime", `${booking.overtime} hour(s)`]] : []),
                  ["Payment Method", booking.package === "On-Site Reservation" ? "On-Site (Pay on Arrival)" : "GCash (Online Payment)"],
                  ["Payment Proof", booking.paymentProof ? "✔ Submitted" : "⚠ Not yet submitted"],
                ].map(([label, value]) => `
                <tr>
                  <td style="padding:9px 0;border-bottom:1px solid #f0e8d8;color:#8a6d3b;font-size:12px;width:40%;">${label}</td>
                  <td style="padding:9px 0;border-bottom:1px solid #f0e8d8;color:#2a1f0e;font-size:13px;font-weight:600;">${value}</td>
                </tr>`).join("")}
              </table>

              ${booking.notes ? `
              <!-- Notes -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#fdfaf3;border-left:3px solid #c9a84c;border-radius:0 6px 6px 0;padding:14px 16px;">
                    <p style="margin:0 0 4px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Your Notes</p>
                    <p style="margin:0;color:#4a3a28;font-size:13px;line-height:1.7;font-style:italic;">"${booking.notes}"</p>
                  </td>
                </tr>
              </table>` : ""}

              <!-- Pricing Breakdown -->
              <p style="margin:0 0 12px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;border-bottom:1px solid #e8e0cc;padding-bottom:8px;">Payment Summary</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td style="padding:9px 0;color:#5a4a35;font-size:13px;">☀️ Day Tour (Base Rate)</td>
                  <td style="padding:9px 0;color:#2a1f0e;font-size:13px;text-align:right;font-weight:600;">${fmt(baseFee)}</td>
                </tr>
                ${extraGuests > 0 ? `
                <tr>
                  <td style="padding:9px 0;color:#5a4a35;font-size:13px;border-top:1px solid #f0e8d8;">👥 Extra Guests (${booking.guests - 30} × ₱100)</td>
                  <td style="padding:9px 0;color:#b8860b;font-size:13px;text-align:right;border-top:1px solid #f0e8d8;">${fmt(extraGuests)}</td>
                </tr>` : ""}
                ${overtimeFee > 0 ? `
                <tr>
                  <td style="padding:9px 0;color:#5a4a35;font-size:13px;border-top:1px solid #f0e8d8;">🕐 Overtime (${booking.overtime}hr × ₱500)</td>
                  <td style="padding:9px 0;color:#e67e22;font-size:13px;text-align:right;border-top:1px solid #f0e8d8;">${fmt(overtimeFee)}</td>
                </tr>` : ""}
                <tr>
                  <td colspan="2" style="padding:0;border-top:2px solid #e2d5b0;"></td>
                </tr>
                <tr>
                  <td style="padding:14px 0 4px;color:#8a6d3b;font-size:12px;font-weight:700;letter-spacing:1px;">TOTAL AMOUNT</td>
                  <td style="padding:14px 0 4px;color:#1a1108;font-size:20px;font-weight:700;text-align:right;">${fmt(booking.total)}</td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;color:#8a6d3b;font-size:12px;">Downpayment Required</td>
                  <td style="padding:0 0 12px;color:#e67e22;font-size:14px;text-align:right;font-weight:700;">${fmt(booking.downpayment)}</td>
                </tr>
              </table>

              <!-- OTP Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
                <tr>
                  <td style="background:linear-gradient(135deg,#1a1108,#2d1f0a);border-radius:10px;padding:28px 24px;text-align:center;">
                    <p style="margin:0 0 6px;color:#c9a84c;font-size:10px;letter-spacing:4px;text-transform:uppercase;">One-Time Access Code</p>
                    <p style="margin:0 0 16px;color:#8a7060;font-size:12px;line-height:1.6;">Present this code upon arrival. Valid for this booking only.</p>
                    <div style="display:inline-block;background:#0d0a05;border:2px solid #c9a84c;border-radius:8px;padding:14px 28px;">
                      <p style="margin:0;color:#f0e6cc;font-size:28px;font-family:monospace;font-weight:700;letter-spacing:6px;">${otp}</p>
                    </div>
                    <p style="margin:16px 0 0;color:#6a5a45;font-size:11px;">⚠ This code is unique and can only be used once. Do not share it.</p>
                  </td>
                </tr>
              </table>

              <!-- What to bring -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#faf5e8;border:1px solid #e2d5b0;border-radius:8px;padding:20px;">
                    <p style="margin:0 0 12px;color:#8a6d3b;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Reminders</p>
                    <p style="margin:0 0 6px;color:#4a3a28;font-size:13px;line-height:1.7;">🪪 Bring a valid ID upon check-in.</p>
                    <p style="margin:0 0 6px;color:#4a3a28;font-size:13px;line-height:1.7;">⏰ Check-in starts at <strong>8:00 AM</strong>. Resort closes at <strong>5:00 PM</strong>.</p>
                    <p style="margin:0 0 6px;color:#4a3a28;font-size:13px;line-height:1.7;">💳 ${booking.package === "On-Site Reservation" ? "Pay the full balance on arrival." : "Please ensure your downpayment has been sent via GCash."}</p>
                    <p style="margin:0;color:#4a3a28;font-size:13px;line-height:1.7;">📞 For questions, contact us at our resort hotline.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 32px;color:#5a4a35;font-size:14px;line-height:1.8;">
                We look forward to welcoming you!<br/>
                <strong style="color:#2a1f0e;">The StoneWood Resort Team</strong>
              </p>

              <!-- Cancellation Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#fdf5f5;border:1px solid #f0d0d0;border-radius:8px;padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 6px;color:#8a5a5a;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Need to cancel?</p>
                    <p style="margin:0 0 16px;color:#7a5a5a;font-size:12px;line-height:1.6;">Plans changed? You can request a cancellation before your visit date.</p>
                    <!-- TODO: Replace the href below with the actual cancellation page URL once it's ready -->
                    <a href="http://localhost:3000/cancelbooking?booking=${booking.id}&email=${encodeURIComponent(booking.email)}"
                      style="display:inline-block;background:#c0392b;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:2px;text-decoration:none;padding:12px 28px;border-radius:6px;text-transform:uppercase;">
                      Request Cancellation
                    </a>
                    <p style="margin:12px 0 0;color:#aaa;font-size:10px;">Booking ID: ${booking.id}</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1a1108;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
              <p style="margin:0 0 4px;color:#c9a84c;font-size:11px;letter-spacing:3px;text-transform:uppercase;">StoneWood Resort</p>
              <p style="margin:0;color:#5a4a35;font-size:11px;">This is an automated confirmation email. Please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();

  return { subject, html };
}
