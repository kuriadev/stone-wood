// ── POST /api/bookings/[id]/refund-request → RETIRED (no-refund policy)
//
// StoneWood does not refund. When the resort has to cancel a booking the
// remedy is another date, and what the guest has paid stays with the booking
// and carries across — see POST /api/bookings/[id]/rebook, which is the only
// choice the guest is now offered.
//
// The route is kept rather than deleted because links to it went out in
// cancellation emails before the policy was settled. A guest following an old
// link gets an explanation and is pointed back at their booking page; a 404
// would read as a broken site.
//
// Money still LEAVES the resort sometimes — a goodwill payment, a disputed
// damage charge — and that is recorded by the owner through
// POST /api/payments (type "Refund"), so Sales and the daily cash count still
// balance. What no longer exists is a way for a guest to demand one.

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const GONE =
  "We don't issue refunds — your payment stays with your booking and moves with it. " +
  "Please pick another date on your booking page, or contact us and we'll find one together.";

export async function POST(_req: NextRequest) {
  return NextResponse.json({ success: false, error: GONE }, { status: 410 });
}
