// ── GET    /api/bookings/[id]   →  get single booking
// ── PATCH  /api/bookings/[id]   →  update booking (status, etc.)
// ── DELETE /api/bookings/[id]   →  delete booking
// TODO: Implement with MongoDB/Mongoose when backend is ready.
//
// import { NextRequest, NextResponse } from "next/server";
// import { connectDB } from "@/lib/mongoose";
// import { Booking } from "@/models/Booking";
//
// export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
//   await connectDB();
//   const booking = await Booking.findOne({ id: params.id });
//   if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
//   return NextResponse.json(booking);
// }
//
// export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
//   await connectDB();
//   const data = await req.json();
//   const booking = await Booking.findOneAndUpdate({ id: params.id }, data, { new: true });
//   return NextResponse.json(booking);
// }
//
// export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
//   await connectDB();
//   await Booking.findOneAndDelete({ id: params.id });
//   return NextResponse.json({ success: true });
// }
