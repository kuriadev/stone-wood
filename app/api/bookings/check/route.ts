// ── POST /api/bookings/check → can this booking go ahead?        (public)
//
// Body: { draft }   (the same draft /api/payment takes)
//
// Book Now asks this as the guest leaves the contact step, before the
// payment screen opens. It runs the same quoteBooking /api/payment runs,
// without creating a payment.
//
// Some problems can only be found once the guest has said who they are:
// the same guest already holding a shared pool tour that date and now
// booking the events venue on its own (splitBookingMatch). Those used to
// surface on the QR screen, after the guest had picked a payment. The
// answer names the step to fix it on, so Book Now can send the guest
// straight back there.

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { quoteBooking } from "@/lib/bookingQuote";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // A guest may go back and forth a few times; a script asking about every
  // date is not a guest.
  const limited = rateLimit(req, { name: "booking-check", limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const body = await req.json().catch(() => ({}));
    const result = await quoteBooking((body as { draft?: unknown })?.draft);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error, step: result.step }, { status: result.status });
    }
    if (!result.quote.available) {
      return NextResponse.json(
        { success: false, error: result.quote.unavailableReason ?? "That date is no longer available.", step: result.quote.unavailableStep ?? "date" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/bookings/check POST]", err);
    return NextResponse.json({ success: false, error: "Could not check the booking. Please try again." }, { status: 500 });
  }
}
