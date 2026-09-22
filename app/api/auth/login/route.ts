// ── POST /api/auth/login  → verify admin credentials, set a session cookie
//
// This replaces the client-side check in AdminLogin. The credentials are read
// from env vars here, on the server, so they never enter the bundle.

import { NextResponse, type NextRequest } from "next/server";
import { checkAdminCredentials, createSessionToken, sessionCookie } from "@/lib/auth";
import { rateLimit, tooManyRequests, resetRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const LIMIT = { name: "login", limit: 8, windowMs: 10 * 60 * 1000 };

export async function POST(req: NextRequest) {
  // Brute force is the whole threat model for a login route, so this one is
  // limited hard: eight attempts per ten minutes per IP.
  const limited = rateLimit(req, LIMIT);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  // Length caps before the comparison: an unbounded password would otherwise
  // let a caller make the server hash a megabyte of input per request.
  if (!username || !password || username.length > 64 || password.length > 128) {
    return NextResponse.json(
      { success: false, error: "Invalid username or password." },
      { status: 401 }
    );
  }

  let ok: boolean;
  try {
    ok = checkAdminCredentials(username, password);
  } catch (err) {
    // A missing SESSION_SECRET or ADMIN_* var is a deployment problem, not a
    // failed login. Say so in the log; tell the caller nothing specific.
    console.error("[/api/auth/login] configuration error:", err);
    return NextResponse.json(
      { success: false, error: "Login is unavailable right now." },
      { status: 503 }
    );
  }

  if (!ok) {
    // One message for both wrong username and wrong password — naming which
    // one was wrong confirms valid usernames to an attacker.
    return NextResponse.json(
      { success: false, error: "Invalid username or password." },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(sessionCookie(createSessionToken(username)));
  resetRateLimit(req, LIMIT.name);
  return res;
}
