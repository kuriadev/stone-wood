import { NextResponse } from "next/server";

let customerMessages: any[] = [];

export async function GET() {
  return NextResponse.json(customerMessages);
}

export async function POST(req: Request) {
  const body = await req.json();

  customerMessages.unshift(body);

  return NextResponse.json({
    success: true,
  });
}