import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      customerEmail,
      customerName,
      message,
      type,
    } = body;

    const transporter = nodemailer.createTransport({
      service: "gmail",

      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Stonewood Resort" <${process.env.GMAIL_USER}>`,

      to: customerEmail,

      subject: `Customer Service Response - ${type}`,

      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;">
          <h2 style="color:#c9a84c;">
            Stonewood Resort Customer Service
          </h2>

          <p>Hello ${customerName},</p>

          <p>${message}</p>

          <br/>

          <p>
            Thank you for contacting us.
          </p>

          <p>
            — Stonewood Resort Support Team
          </p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}