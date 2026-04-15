// ── POST /api/auth/login
// TODO: Implement admin authentication with MongoDB when backend is ready.
//
// import { NextRequest, NextResponse } from "next/server";
// import { connectDB } from "@/lib/mongoose";
//
// export async function POST(req: NextRequest) {
//   await connectDB();
//   const { username, password } = await req.json();
//   // TODO: verify credentials against DB or env vars
//   // Return JWT or session token
//   return NextResponse.json({ success: false, message: "Not implemented" }, { status: 501 });
// }
