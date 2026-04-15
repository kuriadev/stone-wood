// ── GET  /api/inventory  →  list all inventory items
// ── POST /api/inventory  →  add new inventory item
// TODO: Implement with MongoDB/Mongoose when backend is ready.
//
// import { NextRequest, NextResponse } from "next/server";
// import { connectDB } from "@/lib/mongoose";
// import { Inventory } from "@/models/Inventory";
//
// export async function GET() {
//   await connectDB();
//   const items = await Inventory.find().sort({ category: 1, name: 1 });
//   return NextResponse.json(items);
// }
//
// export async function POST(req: NextRequest) {
//   await connectDB();
//   const data = await req.json();
//   const item = await Inventory.create(data);
//   return NextResponse.json(item, { status: 201 });
// }
