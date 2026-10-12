// ── GET /api/auth/me → who is signed in, and what they may do
//
// The admin screens ask this once after sign-in (StaffContext) to decide
// which screens to show, which buttons to hide, and which to relabel as a
// request to the owner. The server still checks every action on its own;
// this only keeps the screen honest about it.
//
// `staffEnabled` is false until the staff migration is applied: the screens
// then hide the Staff page and requests, and the single sign-in is the Owner.

import { NextResponse, type NextRequest } from "next/server";
import { sessionOf, currentIdentity } from "@/lib/auth";
import { staffTableReady } from "@/lib/staff.server";
import { permissionsOf, requestableOf } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = sessionOf(req);
  if (!session) return NextResponse.json({ success: false, error: "Not authorised." }, { status: 401 });
  try {
    const who = await currentIdentity(session);
    if (!who) return NextResponse.json({ success: false, error: "Your account is no longer active." }, { status: 401 });
    return NextResponse.json({
      success: true,
      staff: { id: who.id, name: who.name, username: who.username, role: who.role, mustChangePassword: !!who.mustChangePassword },
      permissions: permissionsOf(who.role),
      requestable: requestableOf(who.role),
      staffEnabled: await staffTableReady(),
    });
  } catch (err) {
    console.error("[/api/auth/me]", err);
    return NextResponse.json({ success: false, error: "Could not read your account." }, { status: 500 });
  }
}
