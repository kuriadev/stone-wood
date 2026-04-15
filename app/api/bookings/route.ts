// ── GET /api/bookings  →  list all bookings
// ── POST /api/bookings →  create a new booking
// TODO: Implement with MongoDB/Mongoose when backend is ready.
//
// import { NextRequest, NextResponse } from "next/server";
// import { connectDB } from "@/lib/mongoose";
// import { Booking } from "@/models/Booking";
//
// export async function GET() {
//   await connectDB();
//   const bookings = await Booking.find().sort({ createdAt: -1 });
//   return NextResponse.json(bookings);
// }
//
// export async function POST(req: NextRequest) {
//   await connectDB();
//   const data = await req.json();
//   const booking = await Booking.create(data);
//   return NextResponse.json(booking, { status: 201 });
// }
