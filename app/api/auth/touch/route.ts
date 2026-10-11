// ── POST /api/auth/touch  → the admin is still there
//
// Restarts the 30-minute idle clock (IDLE_TTL_MS in lib/auth.ts) by
// re-issuing the session cookie with a fresh "last seen" stamp.
//
// Only REAL activity calls this — the admin shell sends it when it sees a
// pointer or key event, at most once every few minutes. The background
// polling that keeps the dashboard live (OpsContext, useMaintenance) does
// not, which is the whole point: an unattended tab must not keep its own
// session alive.
//
// It cannot extend a session past its absolute 8-hour expiry; that value is
// carried over untouched by touchSessionToken.

import { NextResponse, type NextRequest } from "next/server";
import { refreshedSessionCookie, sessionOf } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = sessionOf(req);
  // Already idled out, or never signed in. The client treats this as "go
  // back to the login page".
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authorised." }, { status: 401 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(refreshedSessionCookie(session));
  return res;
}
