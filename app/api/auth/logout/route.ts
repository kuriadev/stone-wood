// ── POST /api/auth/logout  → clear the admin session cookie
//
// The cookie is httpOnly, so the browser cannot delete it on its own — the
// server has to expire it. Without this, "Log out" would clear the React flag
// while leaving a working session cookie behind.

import { NextResponse } from "next/server";
import { clearedSessionCookie } from "@/lib/auth";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

export async function POST() {
  await logActivity({ actor: "Admin", action: "security.logout", entity: "admin", summary: "Signed out of the admin panel." });
  const res = NextResponse.json({ success: true });
  res.cookies.set(clearedSessionCookie());
  return res;
}
