// ── GET  /api/reviews  →  list all reviews
// ── POST /api/reviews  →  submit a new review
// TODO: Implement with MongoDB/Mongoose when backend is ready.
//
// import { NextRequest, NextResponse } from "next/server";
// import { connectDB } from "@/lib/mongoose";
// import { Review } from "@/models/Review";
//
// export async function GET() {
//   await connectDB();
//   const reviews = await Review.find().sort({ createdAt: -1 });
//   return NextResponse.json(reviews);
// }
//
// export async function POST(req: NextRequest) {
//   await connectDB();
//   const data = await req.json();
//   const review = await Review.create(data);
//   return NextResponse.json(review, { status: 201 });
// }
