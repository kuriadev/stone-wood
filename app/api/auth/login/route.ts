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

  // Missing configuration is a deployment problem, not a failed login, and
  // the two need to be told apart. ADMIN_USERNAME/ADMIN_PASSWORD unset makes
  // checkAdminCredentials return false, which would otherwise look exactly
  // like a wrong password and send someone hunting for a typo that is not
  // there. This is checked explicitly so the server log names the cause.
  const configured = Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
  if (!configured) {
    console.error(
      "[/api/auth/login] ADMIN_USERNAME and/or ADMIN_PASSWORD is not set on this " +
        "deployment. Add them in the hosting provider's environment variables — " +
        ".env.local is gitignored and never ships."
    );
    return NextResponse.json(
      { success: false, error: "Login is not configured on this deployment." },
      { status: 503 }
    );
  }

  if (!checkAdminCredentials(username, password)) {
    // One message for both wrong username and wrong password — naming which
    // one was wrong confirms valid usernames to an attacker.
    return NextResponse.json(
      { success: false, error: "Invalid username or password." },
      { status: 401 }
    );
  }

  // The credentials are right; everything past here is signing the session.
  // createSessionToken throws when SESSION_SECRET is missing or too short,
  // and it used to throw outside any catch — an unhandled 500 with nothing
  // in the response to say the secret was the problem.
  let token: string;
  try {
    token = createSessionToken(username);
  } catch (err) {
    console.error("[/api/auth/login] cannot sign a session:", err);
    return NextResponse.json(
      { success: false, error: "Login is not configured on this deployment." },
      { status: 503 }
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(sessionCookie(token));
  resetRateLimit(req, LIMIT.name);
  return res;
}
