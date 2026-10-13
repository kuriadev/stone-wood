// ── GET /api/staff/password?id=  → what one person's password is   (owner only)
//
// The eye on Staff Accounts. The owner asked to be able to read a password
// back for transparency and for the day somebody forgets theirs. It is the
// ONLY place a password is ever decrypted (see lib/staff.server.ts), it is
// refused to everyone but the owner, and each look is written to Activity
// History — without the password itself.

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { findStaffById, revealStaffPassword, staffTableReady } from "@/lib/staff.server";
import { logActivity } from "@/lib/activity.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requirePermission(req, "staff.manage");
  if (denied) return denied;
  if (!(await staffTableReady())) {
    return NextResponse.json({ success: false, error: "Staff accounts are not switched on yet." }, { status: 409 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: "Which person?" }, { status: 400 });

  try {
    const person = await findStaffById(id);
    if (!person) return NextResponse.json({ success: false, error: "That person is no longer on the staff list." }, { status: 404 });

    const password = await revealStaffPassword(id);
    if (password === null) {
      return NextResponse.json(
        { success: false, error: "No password is saved for this person yet. It is saved the next time they sign in, or reset it to set a new one." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    await logActivity({
      actor: "Admin", action: "staff.password_viewed", entity: "staff", entityId: person.id,
      summary: `Looked up ${person.name}'s password.`,
    });
    return NextResponse.json({ success: true, password }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[/api/staff/password GET]", err);
    return NextResponse.json({ success: false, error: "Could not look that up." }, { status: 500 });
  }
}
